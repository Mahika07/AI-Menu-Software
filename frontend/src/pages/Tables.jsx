import { useEffect, useState } from "react";
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
} from "lucide-react";
import { QRCodeCanvas } from "qrcode.react";

import {
  getTables,
  createTable,
  updateTable,
  deleteTable,
} from "../api/tables";

function Tables() {
  const { restaurantId, branchId } = useParams();
  const navigate = useNavigate();

  const [tables, setTables] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [showForm, setShowForm] = useState(false);
  const [editingTable, setEditingTable] = useState(null);

  const [form, setForm] = useState({
    table_number: "",
    is_active: true,
  });

  async function loadTables() {
    try {
      setLoading(true);
      setError("");

      const data = await getTables(branchId);
      setTables(data);
    } catch (err) {
      setError(err.response?.data?.detail || "Failed to load tables");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadTables();
  }, [branchId]);

  function handleChange(event) {
    const { name, value, type, checked } = event.target;

    setForm({
      ...form,
      [name]: type === "checkbox" ? checked : value,
    });
  }

  function openCreateForm() {
    setEditingTable(null);

    setForm({
      table_number: "",
      is_active: true,
    });

    setError("");
    setShowForm(true);
  }

  function openEditForm(table) {
    setEditingTable(table);

    setForm({
      table_number: table.table_number,
      is_active: table.is_active,
    });

    setError("");
    setShowForm(true);
  }

  async function handleSubmit(event) {
    event.preventDefault();

    try {
      setError("");

      if (editingTable) {
        await updateTable(branchId, editingTable.id, form);
      } else {
        await createTable(branchId, {
          table_number: form.table_number,
        });
      }

      setShowForm(false);
      setEditingTable(null);

      await loadTables();
    } catch (err) {
      setError(err.response?.data?.detail || "Failed to save table");
    }
  }

  async function handleDelete(tableId) {
    const confirmed = window.confirm("Delete this table and its QR code?");

    if (!confirmed) return;

    try {
      setError("");

      await deleteTable(branchId, tableId);

      await loadTables();
    } catch (err) {
      setError(err.response?.data?.detail || "Failed to delete table");
    }
  }

  function getMenuUrl(qrToken) {
    return `${window.location.origin}/menu/${qrToken}`;
  }

  function openMenu(qrToken) {
    window.open(`/menu/${qrToken}`, "_blank", "noopener,noreferrer");
  }

  function downloadQR(table) {
    const canvas = document.getElementById(`qr-${table.id}`);

    if (!canvas) {
      setError("QR code is not ready yet.");
      return;
    }

    const pngUrl = canvas.toDataURL("image/png");

    const downloadLink = document.createElement("a");

    downloadLink.href = pngUrl;
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

    const printWindow = window.open("", "_blank", "noopener,noreferrer");

    if (!printWindow) {
      setError("Please allow pop-ups to print the QR code.");
      return;
    }

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>${table.table_number} QR Code</title>

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

            h1 {
              margin-bottom: 10px;
            }

            p {
              color: #555;
            }
          </style>
        </head>

        <body>
          <div class="qr-print">
            <h1>${table.table_number}</h1>

            <img
              src="${imageUrl}"
              alt="QR Code"
            />

            <p>
              Scan to view our menu
            </p>
          </div>
        </body>
      </html>
    `);

    printWindow.document.close();

    printWindow.focus();

    setTimeout(() => {
      printWindow.print();
    }, 300);
  }

  return (
    <div className="page">
      {/* HEADER */}

      <div className="page-header">
        <div>
          <button
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

          <h1>Tables & QR Codes</h1>

          <p>Manage tables and customer menu QR codes</p>
        </div>

        <div className="page-header-actions" style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button
            type="button"
            className="secondary-button"
            onClick={() => navigate(`/dashboard/restaurants/${restaurantId}/branches/${branchId}/dining-sessions`)}
          >
            Manage Dining Sessions
          </button>
          <button className="primary-button" onClick={openCreateForm}>
            <Plus size={18} />
            Add Table
          </button>
        </div>
      </div>

      {/* ERROR */}

      {error && <div className="error-message">{error}</div>}

      {/* FORM */}

      {showForm && (
        <div className="form-card">
          <h2>{editingTable ? "Edit Table" : "Add Table"}</h2>

          <form onSubmit={handleSubmit}>
            <label>Table Number</label>

            <input
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
        </div>
      )}

      {/* TABLES */}

      {loading ? (
        <div className="loading">Loading tables...</div>
      ) : tables.length === 0 ? (
        <div className="empty-state">
          <QrCode size={40} />

          <h2>No tables yet</h2>

          <p>Add tables to generate unique QR codes for your customers.</p>

          <button className="primary-button" onClick={openCreateForm}>
            <Plus size={18} />
            Add Table
          </button>
        </div>
      ) : (
        <div className="table-grid">
          {tables.map((table) => (
            <div className="table-card" key={table.id}>
              {/* TABLE HEADER */}

              <div className="table-card-header">
                <div className="table-icon">
                  <QrCode size={30} />
                </div>

                <div>
                  <h2>{table.table_number}</h2>

                  <span
                    className={
                      table.is_active ? "status-active" : "status-inactive"
                    }
                  >
                    {table.is_active ? "Active" : "Inactive"}
                  </span>
                </div>
              </div>

              {/* QR CODE */}

              <div className="qr-display">
                <QRCodeCanvas
                  id={`qr-${table.id}`}
                  value={getMenuUrl(table.qr_token)}
                  size={180}
                  level="H"
                  includeMargin={true}
                />
              </div>

              {/* URL */}

              <div className="qr-info">
                <label>Customer Menu</label>

                <div className="qr-url">{getMenuUrl(table.qr_token)}</div>
              </div>

              {/* ACTIONS */}

              <div className="table-actions">
                <button
                  className="secondary-button"
                  onClick={() => openMenu(table.qr_token)}
                >
                  <ExternalLink size={16} />
                  Open Menu
                </button>

                <button
                  className="secondary-button"
                  onClick={() => downloadQR(table)}
                  title="Download QR"
                >
                  <Download size={16} />
                  Download
                </button>

                <button
                  className="secondary-button"
                  onClick={() => printQR(table)}
                  title="Print QR"
                >
                  <Printer size={16} />
                  Print
                </button>
              </div>

              {/* EDIT / DELETE */}

              <div className="card-actions">
                <button onClick={() => openEditForm(table)} title="Edit">
                  <Pencil size={17} />
                </button>

                <button
                  onClick={() => handleDelete(table.id)}
                  title="Delete"
                  className="danger-button"
                >
                  <Trash2 size={17} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default Tables;
