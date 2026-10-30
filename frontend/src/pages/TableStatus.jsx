import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Armchair,
  ArrowLeft,
  CheckCircle2,
  CircleAlert,
  Clock,
  RefreshCw,
  Settings2,
  Users,
  XCircle,
} from "lucide-react";

import { getTables } from "../api/tables";
import { useBranchSelection } from "../context/BranchSelectionContext";

const STATUS_FILTERS = [
  { value: "all", label: "All tables" },
  { value: "available", label: "Available" },
  { value: "occupied", label: "Occupied" },
  { value: "unavailable", label: "Unavailable" },
  { value: "inactive", label: "Inactive" },
];

function getTableStatus(table) {
  if (table.is_active === false) {
    return {
      value: "inactive",
      label: "Inactive",
      icon: XCircle,
      color: "#64748b",
      background: "#f1f5f9",
    };
  }

  if (table.is_occupied === true) {
    return {
      value: "occupied",
      label: "Occupied",
      icon: Users,
      color: "#dc2626",
      background: "#fef2f2",
    };
  }

  if (table.is_unavailable === true) {
    return {
      value: "unavailable",
      label: "Unavailable",
      icon: CircleAlert,
      color: "#d97706",
      background: "#fffbeb",
    };
  }

  return {
    value: "available",
    label: "Available",
    icon: CheckCircle2,
    color: "#16a34a",
    background: "#f0fdf4",
  };
}

export default function TableStatus() {
  const navigate = useNavigate();

  const {
    selectedRestaurant,
    selectedBranch,
    selectedBranchId,
    loading: branchLoading,
  } = useBranchSelection();

  const branchId = selectedBranchId || selectedBranch?.id || "";
  const restaurantId = selectedRestaurant?.id || "";

  const [tables, setTables] = useState([]);
  const [filter, setFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [lastUpdated, setLastUpdated] = useState(null);

  const loadTables = useCallback(
    async (showLoader = false) => {
      if (!branchId) {
        setTables([]);
        setLoading(false);
        setRefreshing(false);
        return;
      }

      if (showLoader) {
        setRefreshing(true);
      }

      try {
        const result = await getTables(branchId);

        setTables(Array.isArray(result) ? result : []);
        setError("");
        setLastUpdated(new Date());
      } catch (err) {
        console.error("Unable to load table status:", err);

        setError(
          err?.response?.data?.detail ||
            "Unable to load table status. Please try again.",
        );
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [branchId],
  );

  useEffect(() => {
    if (branchLoading) return undefined;

    if (!branchId) {
      setTables([]);
      setLoading(false);
      setError("");
      setLastUpdated(null);
      return undefined;
    }

    setLoading(true);
    setError("");
    setTables([]);

    loadTables();

    const intervalId = window.setInterval(() => {
      loadTables();
    }, 5000);

    const handleFocus = () => loadTables();

    window.addEventListener("focus", handleFocus);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("focus", handleFocus);
    };
  }, [branchId, branchLoading, loadTables]);

  const stats = useMemo(() => {
    const counts = {
      all: tables.length,
      available: 0,
      occupied: 0,
      unavailable: 0,
      inactive: 0,
    };

    tables.forEach((table) => {
      counts[getTableStatus(table).value] += 1;
    });

    return counts;
  }, [tables]);

  const filteredTables = useMemo(
    () =>
      tables.filter(
        (table) => filter === "all" || getTableStatus(table).value === filter,
      ),
    [tables, filter],
  );

  function openTableManagement() {
    if (restaurantId && branchId) {
      navigate(
        `/dashboard/restaurants/${restaurantId}/branches/${branchId}/tables`,
      );
    } else {
      navigate("/dashboard/restaurants");
    }
  }

  const summaryCards = [
    {
      label: "Total tables",
      value: stats.all,
      icon: Armchair,
      color: "#1f6a9a",
      background: "#e0eefa",
    },
    {
      label: "Available",
      value: stats.available,
      icon: CheckCircle2,
      color: "#16a34a",
      background: "#f0fdf4",
    },
    {
      label: "Occupied",
      value: stats.occupied,
      icon: Users,
      color: "#dc2626",
      background: "#fef2f2",
    },
    {
      label: "Unavailable",
      value: stats.unavailable,
      icon: CircleAlert,
      color: "#d97706",
      background: "#fffbeb",
    },
  ];

  return (
    <main className="ts-page">
      <header className="ts-header">
        <div className="ts-title">
          <button
            type="button"
            className="ts-back"
            onClick={() => navigate(-1)}
          >
            <ArrowLeft size={17} />
            Back
          </button>

          <h1>Table Status</h1>

          <p>Monitor table availability and occupancy for your branch.</p>

          {selectedBranch && (
            <p className="ts-selected-branch">
              Branch: <strong>{selectedBranch.name}</strong>
            </p>
          )}
        </div>

        <div className="ts-actions">
          <button
            type="button"
            className="ts-btn"
            onClick={() => loadTables(true)}
            disabled={refreshing || loading || !branchId}
          >
            <RefreshCw size={16} className={refreshing ? "ts-spin" : ""} />
            Refresh
          </button>

          <button
            type="button"
            className="ts-btn ts-btn-primary"
            onClick={openTableManagement}
            disabled={!branchId}
          >
            <Settings2 size={16} />
            Manage tables
          </button>
        </div>
      </header>

      {branchLoading ? (
        <div className="ts-card ts-note">Loading branch information…</div>
      ) : !branchId ? (
        <div className="ts-card ts-note">
          <Armchair size={38} className="ts-note-icon" />
          <h3>No branch selected</h3>
          <p>Select a branch from the dashboard header to view table status.</p>
        </div>
      ) : (
        <>
          {lastUpdated && (
            <p className="ts-updated">
              <Clock size={13} />
              <span>
                Last updated: {lastUpdated.toLocaleTimeString()}
                {" · "}Automatically refreshes every 5 seconds
              </span>
            </p>
          )}

          {error && (
            <div role="alert" className="ts-error">
              <span>{error}</span>
              <button type="button" onClick={() => loadTables(true)}>
                Retry
              </button>
            </div>
          )}

          <section aria-label="Table summary" className="ts-summary">
            {summaryCards.map((item) => {
              const Icon = item.icon;

              return (
                <div
                  key={item.label}
                  className="ts-card ts-stat"
                  style={{
                    "--tint": item.background,
                    "--tint-ink": item.color,
                  }}
                >
                  <div className="ts-stat-top">
                    <span className="ts-stat-label">{item.label}</span>

                    <span className="ts-stat-icon">
                      <Icon size={20} />
                    </span>
                  </div>

                  <div className="ts-stat-value">
                    {loading ? "—" : item.value}
                  </div>
                </div>
              );
            })}
          </section>

          <section>
            <div className="ts-overview-head">
              <h2>Tables overview</h2>

              <div className="ts-filters">
                {STATUS_FILTERS.map((item) => {
                  const selected = filter === item.value;

                  return (
                    <button
                      key={item.value}
                      type="button"
                      className={`ts-filter ${selected ? "active" : ""}`}
                      onClick={() => setFilter(item.value)}
                      aria-pressed={selected}
                    >
                      {item.label}
                      {` (${stats[item.value]})`}
                    </button>
                  );
                })}
              </div>
            </div>

            {loading ? (
              <div className="ts-card ts-note">Loading table status…</div>
            ) : filteredTables.length === 0 ? (
              <div className="ts-card ts-note">
                <Armchair size={38} className="ts-note-icon" />

                <h3>
                  {tables.length === 0
                    ? "No tables configured"
                    : "No tables match this filter"}
                </h3>

                <p>
                  {tables.length === 0
                    ? "Add tables to this branch to start monitoring availability."
                    : "Choose another status filter to see more tables."}
                </p>

                {tables.length === 0 && (
                  <button
                    type="button"
                    className="ts-btn ts-btn-primary"
                    onClick={openTableManagement}
                  >
                    Manage tables
                  </button>
                )}
              </div>
            ) : (
              <div className="ts-grid">
                {filteredTables.map((table) => {
                  const status = getTableStatus(table);
                  const Icon = status.icon;

                  return (
                    <article
                      key={table.id}
                      className="ts-card ts-table"
                      style={{
                        "--status-color": status.color,
                        "--status-bg": status.background,
                      }}
                    >
                      <div className="ts-table-top">
                        <div>
                          <span className="ts-table-eyebrow">Table</span>
                          <h3>{table.table_number}</h3>
                        </div>

                        <Armchair size={24} className="ts-table-icon" />
                      </div>

                      <div className="ts-status-pill">
                        <Icon size={14} />
                        {status.label}
                      </div>

                      <div className="ts-table-note">
                        {table.is_occupied
                          ? "An active order or unpaid bill is associated with this table."
                          : table.is_unavailable
                            ? "This table has been marked unavailable."
                            : table.is_active === false
                              ? "This table is currently inactive."
                              : "Ready to accept a new order."}
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </section>
        </>
      )}
    </main>
  );
}
