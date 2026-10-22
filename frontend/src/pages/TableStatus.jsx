import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
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
import { getRestaurants } from "../api/restaurants";
import { getBranches } from "../api/branches";
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

const cardStyle = {
  background: "var(--card-bg, #ffffff)",
  border: "1px solid var(--border-color, #e5e7eb)",
  borderRadius: 14,
  padding: 18,
};

export default function TableStatus() {
  const params = useParams();
  const { restaurantId } = params;
  const navigate = useNavigate();

  const [resolvedRestaurantId, setResolvedRestaurantId] = useState(
    restaurantId || "",
  );
  const [resolvedBranchId, setResolvedBranchId] = useState(
    params.branchId || "",
  );

  const [tables, setTables] = useState([]);
  const [filter, setFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [lastUpdated, setLastUpdated] = useState(null);

  // Use the branch from the URL when available; otherwise resolve the first
  // restaurant and its first branch for the sidebar's /dashboard/table-status link.
  useEffect(() => {
    let cancelled = false;

    async function resolveBranch() {
      if (params.branchId) {
        setResolvedBranchId(String(params.branchId));
        setResolvedRestaurantId(String(restaurantId || ""));
        return;
      }

      setResolvedBranchId("");
      setResolvedRestaurantId("");
      setLoading(true);

      try {
        const restaurants = await getRestaurants();
        if (cancelled) return;

        if (!Array.isArray(restaurants) || restaurants.length === 0) {
          setError("No restaurant was found for your account.");
          setLoading(false);
          return;
        }

        const selectedRestaurant = restaurants[0];
        const branches = await getBranches(selectedRestaurant.id);
        if (cancelled) return;

        if (!Array.isArray(branches) || branches.length === 0) {
          setError("No branch was found for your restaurant.");
          setLoading(false);
          return;
        }

        setResolvedRestaurantId(String(selectedRestaurant.id));
        setResolvedBranchId(String(branches[0].id));
        setError("");
      } catch (err) {
        console.error("Unable to resolve branch for table status:", err);
        if (!cancelled) {
          setError(
            err?.response?.data?.detail ||
              "Unable to load your restaurant branch. Please try again.",
          );
          setLoading(false);
        }
      }
    }

    resolveBranch();

    return () => {
      cancelled = true;
    };
  }, [params.branchId, restaurantId]);

  const loadTables = useCallback(
    async (showLoader = false) => {
      if (!resolvedBranchId) {
        setTables([]);
        return;
      }

      if (showLoader) {
        setRefreshing(true);
      }

      try {
        const result = await getTables(resolvedBranchId);
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
    [resolvedBranchId],
  );

  useEffect(() => {
    setLoading(true);
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
  }, [loadTables]);

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

  const filteredTables = useMemo(() => {
    return tables.filter(
      (table) => filter === "all" || getTableStatus(table).value === filter,
    );
  }, [tables, filter]);

  function openTableManagement() {
    if (resolvedRestaurantId && resolvedBranchId) {
      navigate(
        `/dashboard/restaurants/${resolvedRestaurantId}/branches/${resolvedBranchId}/tables`,
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
      color: "#4f46e5",
      background: "#eef2ff",
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
    <main style={{ padding: "24px", maxWidth: 1400, margin: "0 auto" }}>
      <header
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 16,
          marginBottom: 24,
        }}
      >
        <div>
          <button
            type="button"
            onClick={() => navigate(-1)}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              border: 0,
              background: "transparent",
              padding: "0 0 12px",
              cursor: "pointer",
              color: "var(--text-secondary, #64748b)",
            }}
          >
            <ArrowLeft size={17} />
            Back
          </button>

          <h1 style={{ margin: 0, fontSize: 28, fontWeight: 750 }}>
            Table Status
          </h1>

          <p
            style={{
              margin: "8px 0 0",
              color: "var(--text-secondary, #64748b)",
            }}
          >
            Monitor table availability and occupancy for your branch.
          </p>
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={() => loadTables(true)}
            disabled={refreshing}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              padding: "10px 14px",
              border: "1px solid var(--border-color, #d1d5db)",
              borderRadius: 9,
              background: "var(--card-bg, #fff)",
              cursor: refreshing ? "wait" : "pointer",
            }}
          >
            <RefreshCw size={16} className={refreshing ? "animate-spin" : ""} />
            Refresh
          </button>

          <button
            type="button"
            onClick={openTableManagement}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              padding: "10px 14px",
              border: 0,
              borderRadius: 9,
              background: "#4f46e5",
              color: "#fff",
              cursor: "pointer",
            }}
          >
            <Settings2 size={16} />
            Manage tables
          </button>
        </div>
      </header>

      {lastUpdated && (
        <p
          style={{
            fontSize: 12,
            color: "var(--text-secondary, #64748b)",
            marginBottom: 20,
          }}
        >
          <Clock
            size={13}
            style={{
              display: "inline",
              verticalAlign: "middle",
              marginRight: 5,
            }}
          />
          Last updated: {lastUpdated.toLocaleTimeString()}
          {" · "}Automatically refreshes every 5 seconds
        </p>
      )}

      {error && (
        <div
          role="alert"
          style={{
            ...cardStyle,
            marginBottom: 20,
            color: "#b91c1c",
            background: "#fef2f2",
            borderColor: "#fecaca",
          }}
        >
          {error}
          <button
            type="button"
            onClick={() => loadTables(true)}
            style={{
              marginLeft: 12,
              border: 0,
              background: "transparent",
              color: "inherit",
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            Retry
          </button>
        </div>
      )}

      <section
        aria-label="Table summary"
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
          gap: 16,
          marginBottom: 28,
        }}
      >
        {summaryCards.map((item) => {
          const Icon = item.icon;

          return (
            <div key={item.label} style={cardStyle}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 12,
                }}
              >
                <span
                  style={{
                    fontSize: 14,
                    color: "var(--text-secondary, #64748b)",
                  }}
                >
                  {item.label}
                </span>

                <span
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 11,
                    background: item.background,
                    color: item.color,
                    display: "grid",
                    placeItems: "center",
                  }}
                >
                  <Icon size={20} />
                </span>
              </div>

              <div style={{ fontSize: 30, fontWeight: 750, marginTop: 14 }}>
                {loading ? "—" : item.value}
              </div>
            </div>
          );
        })}
      </section>

      <section>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: 12,
            marginBottom: 18,
          }}
        >
          <h2 style={{ fontSize: 19, margin: 0 }}>Tables overview</h2>

          <div
            style={{
              display: "flex",
              gap: 8,
              flexWrap: "wrap",
            }}
          >
            {STATUS_FILTERS.map((item) => {
              const selected = filter === item.value;

              return (
                <button
                  key={item.value}
                  type="button"
                  onClick={() => setFilter(item.value)}
                  aria-pressed={selected}
                  style={{
                    border: `1px solid ${
                      selected ? "#4f46e5" : "var(--border-color, #e5e7eb)"
                    }`,
                    borderRadius: 999,
                    padding: "8px 13px",
                    background: selected ? "#eef2ff" : "var(--card-bg, #fff)",
                    color: selected
                      ? "#4338ca"
                      : "var(--text-primary, #334155)",
                    cursor: "pointer",
                    fontSize: 13,
                    fontWeight: selected ? 700 : 500,
                  }}
                >
                  {item.label}
                  {` (${stats[item.value]})`}
                </button>
              );
            })}
          </div>
        </div>

        {loading ? (
          <div style={{ ...cardStyle, textAlign: "center", padding: 48 }}>
            Loading table status…
          </div>
        ) : filteredTables.length === 0 ? (
          <div
            style={{
              ...cardStyle,
              textAlign: "center",
              padding: "48px 20px",
            }}
          >
            <Armchair
              size={38}
              style={{
                color: "#94a3b8",
                margin: "0 auto 12px",
              }}
            />

            <h3 style={{ margin: "0 0 8px" }}>
              {tables.length === 0
                ? "No tables configured"
                : "No tables match this filter"}
            </h3>

            <p
              style={{
                color: "var(--text-secondary, #64748b)",
                margin: "0 0 18px",
              }}
            >
              {tables.length === 0
                ? "Add tables to this branch to start monitoring availability."
                : "Choose another status filter to see more tables."}
            </p>

            {tables.length === 0 && (
              <button
                type="button"
                onClick={openTableManagement}
                style={{
                  padding: "10px 16px",
                  border: 0,
                  borderRadius: 9,
                  background: "#4f46e5",
                  color: "#fff",
                  cursor: "pointer",
                }}
              >
                Manage tables
              </button>
            )}
          </div>
        ) : (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(210px, 1fr))",
              gap: 16,
            }}
          >
            {filteredTables.map((table) => {
              const status = getTableStatus(table);
              const Icon = status.icon;

              return (
                <article
                  key={table.id}
                  style={{
                    ...cardStyle,
                    borderTop: `4px solid ${status.color}`,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "flex-start",
                      justifyContent: "space-between",
                      gap: 10,
                    }}
                  >
                    <div>
                      <span
                        style={{
                          fontSize: 12,
                          color: "var(--text-secondary, #64748b)",
                        }}
                      >
                        TABLE
                      </span>

                      <h3
                        style={{
                          margin: "4px 0 0",
                          fontSize: 23,
                          fontWeight: 750,
                          overflowWrap: "anywhere",
                        }}
                      >
                        {table.table_number}
                      </h3>
                    </div>

                    <Armchair
                      size={24}
                      style={{ color: status.color, flexShrink: 0 }}
                    />
                  </div>

                  <div
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 6,
                      padding: "6px 9px",
                      borderRadius: 999,
                      background: status.background,
                      color: status.color,
                      fontSize: 12,
                      fontWeight: 700,
                      marginTop: 18,
                    }}
                  >
                    <Icon size={14} />
                    {status.label}
                  </div>

                  <div
                    style={{
                      borderTop: "1px solid var(--border-color, #e5e7eb)",
                      marginTop: 18,
                      paddingTop: 14,
                      fontSize: 12,
                      color: "var(--text-secondary, #64748b)",
                    }}
                  >
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
    </main>
  );
}
