import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  Plus,
  Pencil,
  Trash2,
  ArrowLeft,
  QrCode,
  ExternalLink,
  Download,
  Printer,
  RefreshCw,
  CheckCircle2,
  CircleAlert,
  Ban,
  Armchair,
  Users,
  LayoutGrid,
} from "lucide-react";
import { QRCodeCanvas } from "qrcode.react";

import {
  getTables,
  createTable,
  updateTable,
  deleteTable,
} from "../api/tables";

const FILTERS = [
  { value: "all", label: "All tables" },
  { value: "available", label: "Available" },
  { value: "occupied", label: "Occupied" },
  { value: "unavailable", label: "Unavailable" },
  { value: "inactive", label: "Inactive" },
];

function getTableStatus(table) {
  if (table.is_active === false) {
    return {
      key: "inactive",
      label: "Inactive",
      color: "#64748b",
      background: "#f1f5f9",
    };
  }

  if (table.is_occupied === true) {
    return {
      key: "occupied",
      label: "Occupied",
      color: "#b91c1c",
      background: "#fee2e2",
    };
  }

  if (table.is_unavailable === true) {
    return {
      key: "unavailable",
      label: "Unavailable",
      color: "#a16207",
      background: "#fef3c7",
    };
  }

  return {
    key: "available",
    label: "Available",
    color: "#15803d",
    background: "#dcfce7",
  };
}

const cardStyle = {
  background: "var(--card-bg, #ffffff)",
  border: "1px solid var(--border-color, #e5e7eb)",
  borderRadius: 14,
  padding: 18,
};

function Tables() {
  const { restaurantId, branchId } = useParams();
  const navigate = useNavigate();

  const [tables, setTables] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const [showForm, setShowForm] = useState(false);
  const [editingTable, setEditingTable] = useState(null);
  const [statusFilter, setStatusFilter] = useState("all");
  const [updatingTableId, setUpdatingTableId] = useState(null);
  const [deletingTableId, setDeletingTableId] = useState(null);

  const [form, setForm] = useState({
    table_number: "",
    is_active: true,
  });

  const loadTables = useCallback(
    async (showLoader = true) => {
      if (!branchId) {
        setTables([]);
        setLoading(false);
        return;
      }

      try {
        if (showLoader) setLoading(true);
        else setRefreshing(true);

        setError("");

        const data = await getTables(branchId);
        setTables(Array.isArray(data) ? data : []);
      } catch (err) {
        setError(err.response?.data?.detail || "Failed to load tables.");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [branchId],
  );

  useEffect(() => {
    loadTables();
  }, [loadTables]);

  const stats = useMemo(() => {
    const result = {
      all: tables.length,
      available: 0,
      occupied: 0,
      unavailable: 0,
      inactive: 0,
    };

    tables.forEach((table) => {
      result[getTableStatus(table).key] += 1;
    });

    return result;
  }, [tables]);

  const filteredTables = useMemo(() => {
    if (statusFilter === "all") return tables;

    return tables.filter((table) => getTableStatus(table).key === statusFilter);
  }, [tables, statusFilter]);

  function handleChange(event) {
    const { name, value, type, checked } = event.target;

    setForm((current) => ({
      ...current,
      [name]: type === "checkbox" ? checked : value,
    }));
  }

  function openCreateForm() {
    setEditingTable(null);
    setForm({
      table_number: "",
      is_active: true,
    });
    setError("");
    setNotice("");
    setShowForm(true);
  }

  function openEditForm(table) {
    setEditingTable(table);
    setForm({
      table_number: table.table_number,
      is_active: table.is_active,
    });
    setError("");
    setNotice("");
    setShowForm(true);
  }

  async function handleSubmit(event) {
    event.preventDefault();

    try {
      setError("");
      setNotice("");

      const tableNumber = form.table_number.trim();

      if (!tableNumber) {
        setError("Enter a table number.");
        return;
      }

      if (editingTable) {
        await updateTable(branchId, editingTable.id, {
          table_number: tableNumber,
          is_active: form.is_active,
        });
        setNotice("Table updated successfully.");
      } else {
        await createTable(branchId, {
          table_number: tableNumber,
        });
        setNotice("Table created successfully.");
      }

      setShowForm(false);
      setEditingTable(null);

      await loadTables(false);
    } catch (err) {
      setError(err.response?.data?.detail || "Failed to save table.");
    }
  }

  async function changeTableStatus(table, nextStatus) {
    if (table.is_active === false) {
      setError("Activate this table before changing its status.");
      return;
    }

    const statusLabels = {
      available: "Available",
      occupied: "Occupied",
      unavailable: "Unavailable",
    };

    const messages = {
      available: `Mark ${table.table_number} as available?`,
      occupied: `Mark ${table.table_number} as occupied?`,
      unavailable: `Mark ${table.table_number} as unavailable for maintenance or cleaning?`,
    };

    if (!window.confirm(messages[nextStatus])) return;

    try {
      setError("");
      setNotice("");
      setUpdatingTableId(table.id);

      const payload = {
        is_occupied: nextStatus === "occupied",
        is_unavailable: nextStatus === "unavailable",
      };

      await updateTable(branchId, table.id, payload);

      setNotice(
        `${table.table_number} is now ${statusLabels[nextStatus].toLowerCase()}.`,
      );

      await loadTables(false);
    } catch (err) {
      setError(
        err.response?.data?.detail ||
          `Could not change table status to ${statusLabels[nextStatus]}.`,
      );
    } finally {
      setUpdatingTableId(null);
    }
  }
  async function handleDelete(table) {
    if (table.is_occupied) {
      setError(
        "This table cannot be deleted while it has an outstanding order or unpaid bill.",
      );
      return;
    }

    const confirmed = window.confirm(
      `Delete ${table.table_number} and its QR code? This action cannot be undone.`,
    );

    if (!confirmed) return;

    try {
      setError("");
      setNotice("");
      setDeletingTableId(table.id);

      await deleteTable(branchId, table.id);

      setNotice(`${table.table_number} deleted successfully.`);
      await loadTables(false);
    } catch (err) {
      setError(err.response?.data?.detail || "Failed to delete table.");
    } finally {
      setDeletingTableId(null);
    }
  }

  function getMenuUrl(qrToken) {
    return `${window.location.origin}/menu/${qrToken}`;
  }

  function openMenu(qrToken) {
    window.open(getMenuUrl(qrToken), "_blank", "noopener,noreferrer");
  }

  function downloadQR(table) {
    const canvas = document.getElementById(`qr-${table.id}`);

    if (!canvas) {
      setError("QR code is not ready yet.");
      return;
    }

    const downloadLink = document.createElement("a");
    downloadLink.href = canvas.toDataURL("image/png");
    downloadLink.download = `table-${table.table_number}-qr.png`;

    document.body.appendChild(downloadLink);
    downloadLink.click();
    document.body.removeChild(downloadLink);
  }

  function printQR(table) {
    const canvas = document.getElementById(`qr-${table.id}`);

    if (!canvas) {
      setError("QR code is not ready yet.");
      return;
    }

    const imageUrl = canvas.toDataURL("image/png");
    const printWindow = window.open("", "_blank");

    if (!printWindow) {
      setError("Please allow pop-ups to print the QR code.");
      return;
    }

    const safeTableNumber = String(table.table_number)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>${safeTableNumber} QR Code</title>
          <style>
            body {
              margin: 0;
              min-height: 100vh;
              display: flex;
              align-items: center;
              justify-content: center;
              font-family: Arial, sans-serif;
            }
            .qr-print {
              text-align: center;
              padding: 40px;
            }
            .qr-print img {
              width: 300px;
              height: 300px;
            }
            p { color: #555; }
          </style>
        </head>
        <body>
          <div class="qr-print">
            <h1>${safeTableNumber}</h1>
            <img src="${imageUrl}" alt="QR Code" />
            <p>Scan to view our menu</p>
          </div>
        </body>
      </html>
    `);

    printWindow.document.close();
    printWindow.focus();

    printWindow.onload = () => {
      printWindow.print();
    };
  }

  const summaryCards = [
    {
      key: "all",
      label: "Total tables",
      value: stats.all,
      icon: LayoutGrid,
      color: "#334155",
      background: "#f1f5f9",
    },
    {
      key: "available",
      label: "Available",
      value: stats.available,
      icon: CheckCircle2,
      color: "#15803d",
      background: "#dcfce7",
    },
    {
      key: "occupied",
      label: "Occupied",
      value: stats.occupied,
      icon: Armchair,
      color: "#b91c1c",
      background: "#fee2e2",
    },
    {
      key: "unavailable",
      label: "Unavailable",
      value: stats.unavailable,
      icon: Ban,
      color: "#a16207",
      background: "#fef3c7",
    },
  ];

  return (
    <div className="page">
      {/* PAGE HEADER */}
      <div className="page-header">
        <div>
          <button
            type="button"
            className="back-button"
            onClick={() =>
              navigate(
                `/dashboard/restaurants/${restaurantId}/branches/${branchId}/menu`,
              )
            }
          >
            <ArrowLeft size={17} />
            Menu
          </button>

          <h1>Table Management</h1>
          <p>
            Monitor table occupancy, manage availability, and maintain customer
            QR codes.
          </p>
        </div>

        <div
          className="page-header-actions"
          style={{
            display: "flex",
            gap: 10,
            flexWrap: "wrap",
          }}
        >
          <button
            type="button"
            className="secondary-button"
            onClick={() => loadTables(false)}
            disabled={loading || refreshing}
          >
            <RefreshCw size={16} className={refreshing ? "animate-spin" : ""} />
            {refreshing ? "Refreshing..." : "Refresh"}
          </button>

          <button
            type="button"
            className="secondary-button"
            onClick={() =>
              navigate(
                `/dashboard/restaurants/${restaurantId}/branches/${branchId}/dining-sessions`,
              )
            }
          >
            Manage Dining Sessions
          </button>

          <button
            type="button"
            className="primary-button"
            onClick={openCreateForm}
          >
            <Plus size={18} />
            Add Table
          </button>
        </div>
      </div>

      {/* FEEDBACK */}
      {error && (
        <div
          className="error-message"
          role="alert"
          style={{ marginBottom: 16 }}
        >
          <CircleAlert
            size={17}
            style={{ verticalAlign: "middle", marginRight: 8 }}
          />
          {error}
        </div>
      )}

      {notice && (
        <div
          role="status"
          style={{
            marginBottom: 16,
            padding: "12px 16px",
            borderRadius: 10,
            background: "#dcfce7",
            color: "#166534",
          }}
        >
          <CheckCircle2
            size={17}
            style={{ verticalAlign: "middle", marginRight: 8 }}
          />
          {notice}
        </div>
      )}

      {/* SUMMARY CARDS */}
      <section
        className="table-stats-grid"
        aria-label="Table status summary"
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(175px, 1fr))",
          gap: 16,
          marginBottom: 24,
        }}
      >
        {summaryCards.map((item) => {
          const Icon = item.icon;
          const selected = statusFilter === item.key;

          return (
            <button
              type="button"
              key={item.key}
              onClick={() => setStatusFilter(item.key)}
              aria-pressed={selected}
              style={{
                ...cardStyle,
                display: "flex",
                alignItems: "center",
                gap: 14,
                textAlign: "left",
                cursor: "pointer",
                border: selected
                  ? `2px solid ${item.color}`
                  : "1px solid var(--border-color, #e5e7eb)",
              }}
            >
              <span
                style={{
                  width: 46,
                  height: 46,
                  borderRadius: 12,
                  display: "grid",
                  placeItems: "center",
                  background: item.background,
                  color: item.color,
                  flexShrink: 0,
                }}
              >
                <Icon size={23} />
              </span>

              <span style={{ display: "grid", gap: 4 }}>
                <span
                  style={{
                    fontSize: 13,
                    color: "var(--muted-text, #64748b)",
                  }}
                >
                  {item.label}
                </span>
                <strong style={{ fontSize: 26, lineHeight: 1.1 }}>
                  {loading ? "—" : item.value}
                </strong>
              </span>
            </button>
          );
        })}
      </section>

      {/* STATUS FILTERS */}
      <section style={{ ...cardStyle, marginBottom: 24 }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: 12,
          }}
        >
          <div>
            <h2 style={{ margin: 0 }}>Restaurant tables</h2>
            <p
              style={{
                margin: "6px 0 0",
                color: "var(--muted-text, #64748b)",
              }}
            >
              {filteredTables.length} of {tables.length} tables
            </p>
          </div>

          <label
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              flexWrap: "wrap",
            }}
          >
            <span>Filter:</span>
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              style={{
                padding: "9px 12px",
                borderRadius: 8,
                border: "1px solid var(--border-color, #d1d5db)",
                background: "var(--card-bg, #fff)",
              }}
            >
              {FILTERS.map((filter) => (
                <option key={filter.value} value={filter.value}>
                  {filter.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </section>

      {/* ADD / EDIT FORM */}
      {showForm && (
        <section className="form-card" style={{ marginBottom: 24 }}>
          <h2>{editingTable ? "Edit Table" : "Add Table"}</h2>

          <form onSubmit={handleSubmit}>
            <label htmlFor="table_number">Table Number</label>
            <input
              id="table_number"
              name="table_number"
              value={form.table_number}
              onChange={handleChange}
              placeholder="e.g. Table 1"
              required
              minLength={1}
              maxLength={50}
            />

            {editingTable && (
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  name="is_active"
                  checked={form.is_active}
                  onChange={handleChange}
                />
                Table is active
              </label>
            )}

            <div className="form-actions">
              <button
                type="button"
                className="secondary-button"
                onClick={() => {
                  setShowForm(false);
                  setEditingTable(null);
                }}
              >
                Cancel
              </button>

              <button type="submit" className="primary-button">
                {editingTable ? "Save Changes" : "Create Table"}
              </button>
            </div>
          </form>
        </section>
      )}

      {/* TABLE GRID */}
      {loading ? (
        <div className="loading">Loading tables...</div>
      ) : tables.length === 0 ? (
        <div className="empty-state">
          <QrCode size={40} />
          <h2>No tables yet</h2>
          <p>
            Add your restaurant tables to manage seating and generate unique
            customer menu QR codes.
          </p>
          <button
            type="button"
            className="primary-button"
            onClick={openCreateForm}
          >
            <Plus size={18} />
            Add Table
          </button>
        </div>
      ) : filteredTables.length === 0 ? (
        <div className="empty-state">
          <Armchair size={40} />
          <h2>No tables in this category</h2>
          <p>Choose another status filter to see your tables.</p>
          <button
            type="button"
            className="secondary-button"
            onClick={() => setStatusFilter("all")}
          >
            Show all tables
          </button>
        </div>
      ) : (
        <div
          className="table-grid"
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(285px, 1fr))",
            gap: 18,
          }}
        >
          {filteredTables.map((table) => {
            const tableStatus = getTableStatus(table);
            const busy =
              updatingTableId === table.id || deletingTableId === table.id;

            return (
              <article
                className="table-card"
                key={table.id}
                style={{
                  border: "1px solid var(--border-color, #e5e7eb)",
                  borderRadius: 14,
                  padding: 18,
                  background: "var(--card-bg, #ffffff)",
                  minWidth: 0,
                }}
              >
                {/* CARD HEADER */}
                <div
                  className="table-card-header"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 12,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 12,
                      minWidth: 0,
                    }}
                  >
                    <div
                      className="table-icon"
                      style={{
                        width: 46,
                        height: 46,
                        borderRadius: 12,
                        display: "grid",
                        placeItems: "center",
                        background: "#eff6ff",
                        color: "#2563eb",
                        flexShrink: 0,
                      }}
                    >
                      <Armchair size={25} />
                    </div>

                    <div style={{ minWidth: 0 }}>
                      <h2
                        style={{
                          margin: 0,
                          fontSize: 19,
                          overflowWrap: "anywhere",
                        }}
                      >
                        {table.table_number}
                      </h2>
                      <span
                        style={{
                          display: "inline-block",
                          marginTop: 7,
                          padding: "4px 9px",
                          borderRadius: 20,
                          background: tableStatus.background,
                          color: tableStatus.color,
                          fontSize: 12,
                          fontWeight: 600,
                        }}
                      >
                        {tableStatus.label}
                      </span>
                    </div>
                  </div>

                  <span
                    title="QR code"
                    style={{
                      color: "var(--muted-text, #64748b)",
                      flexShrink: 0,
                    }}
                  >
                    <QrCode size={23} />
                  </span>
                </div>

                {/* STATUS DETAILS */}
                <div
                  style={{
                    marginTop: 16,
                    padding: 12,
                    borderRadius: 9,
                    background: "var(--subtle-bg, #f8fafc)",
                    fontSize: 13,
                    color: "var(--muted-text, #64748b)",
                  }}
                >
                  {tableStatus.key === "available" &&
                    "Ready to seat your next customer."}
                  {tableStatus.key === "occupied" &&
                    "An order or unpaid bill is associated with this table."}
                  {tableStatus.key === "unavailable" &&
                    "Blocked from new POS orders until restored."}
                  {tableStatus.key === "inactive" && "Disabled in the system."}
                </div>

                {/* QR CODE */}
                <div
                  className="qr-display"
                  style={{
                    display: "flex",
                    justifyContent: "center",
                    alignItems: "center",
                    padding: "18px 0",
                  }}
                >
                  <QRCodeCanvas
                    id={`qr-${table.id}`}
                    value={getMenuUrl(table.qr_token)}
                    size={160}
                    level="H"
                    includeMargin
                  />
                </div>

                {/* CUSTOMER MENU URL */}
                <div className="qr-info">
                  <label>Customer Menu</label>
                  <div
                    className="qr-url"
                    title={getMenuUrl(table.qr_token)}
                    style={{
                      overflowWrap: "anywhere",
                      fontSize: 12,
                      marginTop: 6,
                    }}
                  >
                    {getMenuUrl(table.qr_token)}
                  </div>
                </div>

                {/* QR ACTIONS */}
                <div
                  className="table-actions"
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                    gap: 8,
                    marginTop: 16,
                  }}
                >
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() => openMenu(table.qr_token)}
                  >
                    <ExternalLink size={15} />
                    Open Menu
                  </button>

                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() => downloadQR(table)}
                  >
                    <Download size={15} />
                    Download
                  </button>

                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() => printQR(table)}
                    style={{ gridColumn: "1 / -1" }}
                  >
                    <Printer size={15} />
                    Print QR
                  </button>
                </div>

                {/* AVAILABILITY ACTION */}
                {/* TABLE STATUS ACTIONS */}
                {table.is_active !== false && (
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                      gap: 8,
                      marginTop: 14,
                    }}
                  >
                    {tableStatus.key === "available" && (
                      <>
                        <button
                          type="button"
                          className="primary-button"
                          disabled={busy}
                          onClick={() => changeTableStatus(table, "occupied")}
                          style={{ justifyContent: "center" }}
                        >
                          <Armchair size={16} />
                          Mark Occupied
                        </button>

                        <button
                          type="button"
                          className="secondary-button"
                          disabled={busy}
                          onClick={() =>
                            changeTableStatus(table, "unavailable")
                          }
                          style={{ justifyContent: "center" }}
                        >
                          <Ban size={16} />
                          Mark Unavailable
                        </button>
                      </>
                    )}

                    {tableStatus.key === "occupied" && (
                      <>
                        <button
                          type="button"
                          className="secondary-button"
                          disabled={busy}
                          onClick={() => changeTableStatus(table, "available")}
                          style={{ justifyContent: "center" }}
                        >
                          <CheckCircle2 size={16} />
                          Mark Available
                        </button>

                        <button
                          type="button"
                          className="secondary-button"
                          disabled={busy}
                          onClick={() =>
                            changeTableStatus(table, "unavailable")
                          }
                          style={{ justifyContent: "center" }}
                        >
                          <Ban size={16} />
                          Mark Unavailable
                        </button>
                      </>
                    )}

                    {tableStatus.key === "unavailable" && (
                      <button
                        type="button"
                        className="primary-button"
                        disabled={busy}
                        onClick={() => changeTableStatus(table, "available")}
                        style={{
                          gridColumn: "1 / -1",
                          justifyContent: "center",
                        }}
                      >
                        <CheckCircle2 size={16} />
                        Mark Available
                      </button>
                    )}
                  </div>
                )}

                {busy && (
                  <p
                    style={{
                      fontSize: 12,
                      color: "var(--muted-text, #64748b)",
                      marginTop: 8,
                    }}
                  >
                    Updating table status...
                  </p>
                )}

                {/* EDIT / DELETE */}
                <div
                  className="card-actions"
                  style={{
                    display: "flex",
                    justifyContent: "flex-end",
                    gap: 8,
                    marginTop: 12,
                    paddingTop: 12,
                    borderTop: "1px solid var(--border-color, #e5e7eb)",
                  }}
                >
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() => openEditForm(table)}
                    disabled={busy}
                    title="Edit table"
                  >
                    <Pencil size={16} />
                    Edit
                  </button>

                  <button
                    type="button"
                    className="danger-button"
                    onClick={() => handleDelete(table)}
                    disabled={busy || table.is_occupied === true}
                    title={
                      table.is_occupied
                        ? "Cannot delete a table with an outstanding order or unpaid bill."
                        : "Delete table"
                    }
                  >
                    <Trash2 size={16} />
                    {deletingTableId === table.id ? "Deleting..." : "Delete"}
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default Tables;
