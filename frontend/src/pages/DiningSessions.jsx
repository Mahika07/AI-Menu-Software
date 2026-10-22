import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  Armchair,
  CheckCircle2,
  RefreshCw,
  Users,
  Ban,
} from "lucide-react";
import { getTables, updateTable } from "../api/tables";

function DiningSessions() {
  const { restaurantId, branchId } = useParams();
  const navigate = useNavigate();

  const [tables, setTables] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyTableId, setBusyTableId] = useState(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const loadTables = useCallback(async () => {
    try {
      setLoading(true);
      setError("");

      const data = await getTables(branchId);
      setTables(Array.isArray(data) ? data : []);
    } catch (err) {
      if (err.response?.status === 401) {
        localStorage.removeItem("access_token");
        navigate("/login");
        return;
      }

      setError(err.response?.data?.detail || "Unable to load table status.");
    } finally {
      setLoading(false);
    }
  }, [branchId, navigate]);

  useEffect(() => {
    loadTables();
  }, [loadTables]);

  async function setTableStatus(table, occupied) {
    if (table.is_unavailable || table.is_active === false) {
      setError(
        "This table is unavailable. Make it available for service before changing its occupancy.",
      );
      return;
    }

    if (table.is_occupied === occupied) return;

    const action = occupied ? "mark occupied" : "mark available";

    if (
      !window.confirm(
        `Are you sure you want to ${action} Table ${table.table_number}?`,
      )
    ) {
      return;
    }

    try {
      setBusyTableId(table.id);
      setError("");
      setSuccess("");

      const updated = await updateTable(branchId, table.id, {
        is_occupied: occupied,
      });

      setTables((current) =>
        current.map((item) => (item.id === updated.id ? updated : item)),
      );

      setSuccess(
        `Table ${table.table_number} marked ${
          occupied ? "occupied" : "available"
        }.`,
      );
    } catch (err) {
      setError(err.response?.data?.detail || "Unable to update table status.");

      await loadTables();
    } finally {
      setBusyTableId(null);
    }
  }

  const availableCount = tables.filter(
    (table) =>
      table.is_active !== false && !table.is_unavailable && !table.is_occupied,
  ).length;

  const occupiedCount = tables.filter(
    (table) =>
      table.is_active !== false && !table.is_unavailable && table.is_occupied,
  ).length;

  const unavailableCount = tables.filter(
    (table) => table.is_unavailable || table.is_active === false,
  ).length;

  return (
    <main className="dining-page">
      <header className="dining-header">
        <button
          className="dining-back"
          onClick={() =>
            navigate(`/dashboard/restaurants/${restaurantId}/branches`)
          }
        >
          <ArrowLeft size={18} />
          Back to branches
        </button>

        <div className="dining-heading-row">
          <div>
            <span className="dining-eyebrow">RESTAURANT OPERATIONS</span>
            <h1>Table availability</h1>
            <p>
              Staff can mark each table available or occupied. Customers do not
              manage dining sessions.
            </p>
          </div>

          <button
            className="dining-refresh"
            onClick={loadTables}
            disabled={loading}
          >
            <RefreshCw size={16} />
            Refresh
          </button>
        </div>
      </header>

      <section className="dining-stats">
        <article className="dining-stat">
          <span className="dining-stat-icon">
            <Armchair size={20} />
          </span>
          <div>
            <span>Total tables</span>
            <strong>{tables.length}</strong>
          </div>
        </article>

        <article className="dining-stat">
          <span className="dining-stat-icon active">
            <CheckCircle2 size={20} />
          </span>
          <div>
            <span>Available</span>
            <strong>{availableCount}</strong>
          </div>
        </article>

        <article className="dining-stat">
          <span className="dining-stat-icon inactive">
            <Users size={20} />
          </span>
          <div>
            <span>Occupied</span>
            <strong>{occupiedCount}</strong>
          </div>
        </article>

        <article className="dining-stat">
          <span className="dining-stat-icon inactive">
            <Ban size={20} />
          </span>
          <div>
            <span>Unavailable / inactive</span>
            <strong>{unavailableCount}</strong>
          </div>
        </article>
      </section>

      {error && (
        <div className="dining-alert error" role="alert">
          {error}
        </div>
      )}

      {success && (
        <div className="dining-alert success" role="status">
          {success}
        </div>
      )}

      {loading ? (
        <div className="dining-empty">Loading tables…</div>
      ) : tables.length === 0 ? (
        <div className="dining-empty">
          <Armchair size={32} />
          <strong>No tables configured</strong>
          <span>Add tables from Tables &amp; QR Codes.</span>
        </div>
      ) : (
        <section
          className="dining-table-cards"
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))",
            gap: 16,
          }}
        >
          {tables.map((table) => {
            const unavailable =
              table.is_unavailable || table.is_active === false;
            const occupied = table.is_occupied;

            const tableStatus = unavailable
              ? "Unavailable"
              : occupied
                ? "Occupied"
                : "Available";

            const statusColor = unavailable
              ? "#d97706"
              : occupied
                ? "#dc2626"
                : "#16a34a";

            return (
              <article
                className="dining-stat"
                key={table.id}
                style={{
                  display: "block",
                  borderTop: `4px solid ${statusColor}`,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: 12,
                  }}
                >
                  <div>
                    <span>TABLE</span>
                    <h2 style={{ margin: "6px 0" }}>{table.table_number}</h2>
                    <strong>{tableStatus}</strong>
                  </div>

                  <Armchair size={26} />
                </div>

                <div
                  style={{
                    display: "flex",
                    gap: 8,
                    marginTop: 18,
                    flexWrap: "wrap",
                  }}
                >
                  <button
                    className="dining-action"
                    onClick={() => setTableStatus(table, false)}
                    disabled={busyTableId !== null || unavailable || !occupied}
                  >
                    <CheckCircle2 size={14} />
                    Mark available
                  </button>

                  <button
                    className="dining-action close"
                    onClick={() => setTableStatus(table, true)}
                    disabled={busyTableId !== null || unavailable || occupied}
                  >
                    <Users size={14} />
                    Mark occupied
                  </button>
                </div>

                {unavailable && (
                  <small
                    style={{
                      display: "block",
                      marginTop: 12,
                    }}
                  >
                    Change this table's availability in Tables &amp; QR Codes.
                  </small>
                )}
              </article>
            );
          })}
        </section>
      )}
    </main>
  );
}

export default DiningSessions;
