import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  RefreshCw,
  ShieldCheck,
  Clock3,
  RotateCcw,
  LockKeyhole,
} from "lucide-react";

import {
  getDiningSessions,
  closeDiningSession,
  resetTableSession,
} from "../api/diningSessions";

function formatDate(value) {
  if (!value) return "—";

  const date = new Date(value);

  return Number.isNaN(date.getTime())
    ? "—"
    : date.toLocaleString("en-IN", {
        dateStyle: "medium",
        timeStyle: "short",
      });
}

function DiningSessions() {
  const { restaurantId, branchId } = useParams();
  const navigate = useNavigate();

  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [filter, setFilter] = useState("all");

  const loadSessions = useCallback(async () => {
    try {
      setLoading(true);
      setError("");

      const data = await getDiningSessions(branchId);
      setSessions(Array.isArray(data) ? data : []);
    } catch (err) {
      if (err.response?.status === 401) {
        localStorage.removeItem("access_token");
        navigate("/login");
        return;
      }

      setError(err.response?.data?.detail || "Unable to load dining sessions.");
    } finally {
      setLoading(false);
    }
  }, [branchId, navigate]);

  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  const counts = useMemo(() => {
    const active = sessions.filter((session) => session.is_active).length;

    return {
      total: sessions.length,
      active,
      inactive: sessions.length - active,
    };
  }, [sessions]);

  const visibleSessions = useMemo(() => {
    if (filter === "active") {
      return sessions.filter((session) => session.is_active);
    }

    if (filter === "inactive") {
      return sessions.filter((session) => !session.is_active);
    }

    return sessions;
  }, [sessions, filter]);

  async function handleClose(session) {
    if (!session.is_active) return;

    if (
      !window.confirm(
        `Close the dining session for Table ${session.table_id}? This prevents this session from placing new orders.`,
      )
    ) {
      return;
    }

    try {
      setBusyId(session.id);
      setError("");
      setSuccess("");

      await closeDiningSession(branchId, session.id);

      setSuccess(`Session for Table ${session.table_id} closed.`);
      await loadSessions();
    } catch (err) {
      setError(err.response?.data?.detail || "Unable to close this session.");
    } finally {
      setBusyId(null);
    }
  }

  async function handleReset(tableId) {
    if (
      !window.confirm(
        `Reset Table ${tableId}? All active sessions for this table will be closed. The next diner will create a new session by scanning the QR code.`,
      )
    ) {
      return;
    }

    try {
      setBusyId(`table-${tableId}`);
      setError("");
      setSuccess("");

      await resetTableSession(branchId, tableId);

      setSuccess(`Table ${tableId} has been reset.`);
      await loadSessions();
    } catch (err) {
      setError(err.response?.data?.detail || "Unable to reset this table.");
    } finally {
      setBusyId(null);
    }
  }

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
            <h1>Dining sessions</h1>
            <p>
              Monitor table sessions and prepare tables for incoming guests.
            </p>
          </div>

          <button
            className="dining-refresh"
            onClick={loadSessions}
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
            <ShieldCheck size={20} />
          </span>
          <div>
            <span>Total sessions</span>
            <strong>{counts.total}</strong>
          </div>
        </article>

        <article className="dining-stat">
          <span className="dining-stat-icon active">
            <Clock3 size={20} />
          </span>
          <div>
            <span>Active sessions</span>
            <strong>{counts.active}</strong>
          </div>
        </article>

        <article className="dining-stat">
          <span className="dining-stat-icon inactive">
            <LockKeyhole size={20} />
          </span>
          <div>
            <span>Closed</span>
            <strong>{counts.inactive}</strong>
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

      <section className="dining-panel">
        <div className="dining-panel-heading">
          <div>
            <h2>Session history</h2>
            <p>Recent sessions across this branch.</p>
          </div>

          <select
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
            aria-label="Filter dining sessions"
          >
            <option value="all">All sessions</option>
            <option value="active">Active only</option>
            <option value="inactive">Closed</option>
          </select>
        </div>

        {loading ? (
          <div className="dining-empty">Loading sessions…</div>
        ) : visibleSessions.length === 0 ? (
          <div className="dining-empty">
            <ShieldCheck size={32} />
            <strong>No sessions found</strong>
            <span>Try another filter or refresh the list.</span>
          </div>
        ) : (
          <div className="dining-table-wrap">
            <table className="dining-table">
              <thead>
                <tr>
                  <th>Table</th>
                  <th>Started</th>
                  <th>Closure policy</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>

              <tbody>
                {visibleSessions.map((session) => (
                  <tr key={session.id}>
                    <td>
                      <strong>Table {session.table_id}</strong>
                      <small>Session #{session.id}</small>
                    </td>

                    <td>{formatDate(session.created_at)}</td>
                    <td>Staff closes session</td>

                    <td>
                      <span
                        className={`dining-badge ${
                          session.is_active ? "is-active" : "is-inactive"
                        }`}
                      >
                        {session.is_active ? "Active" : "Inactive"}
                      </span>
                      {session.closed_at && (
                        <small>Closed {formatDate(session.closed_at)}</small>
                      )}
                    </td>

                    <td>
                      <div className="dining-actions">
                        {session.is_active && (
                          <button
                            className="dining-action close"
                            onClick={() => handleClose(session)}
                            disabled={busyId !== null}
                          >
                            <LockKeyhole size={14} />
                            Close
                          </button>
                        )}

                        <button
                          className="dining-action reset"
                          onClick={() => handleReset(session.table_id)}
                          disabled={busyId !== null}
                        >
                          <RotateCcw size={14} />
                          Reset table
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <p className="dining-footnote">
        Closing a session blocks further ordering through its token. Existing
        orders are retained. Resetting a table closes its open sessions and
        creates a new eight-hour session.
      </p>
    </main>
  );
}

export default DiningSessions;
