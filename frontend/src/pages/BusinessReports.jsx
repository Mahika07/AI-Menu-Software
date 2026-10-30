import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  Download,
  FileText,
  RefreshCw,
  TrendingUp,
  Armchair,
  Receipt,
  Wallet,
} from "lucide-react";

import {
  createExpense,
  deleteExpense,
  getExpenses,
  getOperationsAnalytics,
} from "../api/operationsAnalytics";

import { useBranchSelection } from "../context/BranchSelectionContext";
import "./BusinessReports.css";

function dateString(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function currency(value) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(Number(value || 0));
}

function csvCell(value) {
  let text = String(value ?? "");

  if (/^[\s]*[=+@]/.test(text) || /^[\s]*-[A-Za-z]/.test(text)) {
    text = `'${text}`;
  }

  return `"${text.replace(/"/g, '""')}"`;
}

export default function BusinessReports() {
  const {
    selectedBranch,
    selectedBranchId,
    loading: branchLoading,
  } = useBranchSelection();

  const today = new Date();
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);

  const [startDate, setStartDate] = useState(dateString(monthStart));
  const [endDate, setEndDate] = useState(dateString(today));

  const [report, setReport] = useState(null);
  const [expenses, setExpenses] = useState([]);

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const [form, setForm] = useState({
    category: "Utilities",
    description: "",
    amount: "",
    incurred_on: dateString(today),
    notes: "",
  });

  const branchId = selectedBranchId || selectedBranch?.id || "";

  const loadReport = useCallback(async () => {
    if (!branchId) {
      setReport(null);
      setExpenses([]);
      return;
    }

    if (startDate && endDate && startDate > endDate) {
      setError("Start date cannot be after end date.");
      return;
    }

    setLoading(true);
    setError("");
    setNotice("");

    try {
      const [operations, expenseRows] = await Promise.all([
        getOperationsAnalytics(branchId, startDate, endDate),
        getExpenses(branchId, startDate, endDate),
      ]);

      setReport(operations);
      setExpenses(Array.isArray(expenseRows) ? expenseRows : []);
    } catch (err) {
      setError(
        err.response?.data?.detail ||
          "Unable to load reports. Please try again.",
      );
    } finally {
      setLoading(false);
    }
  }, [branchId, startDate, endDate]);

  useEffect(() => {
    let cancelled = false;

    async function fetchReport() {
      if (!branchId) {
        setReport(null);
        setExpenses([]);
        return;
      }

      if (startDate && endDate && startDate > endDate) {
        setReport(null);
        setExpenses([]);
        setError("Start date cannot be after end date.");
        return;
      }

      setLoading(true);
      setError("");

      try {
        const [operations, expenseRows] = await Promise.all([
          getOperationsAnalytics(branchId, startDate, endDate),
          getExpenses(branchId, startDate, endDate),
        ]);

        if (!cancelled) {
          setReport(operations);
          setExpenses(Array.isArray(expenseRows) ? expenseRows : []);
        }
      } catch (err) {
        if (!cancelled) {
          setReport(null);
          setExpenses([]);
          setError(
            err.response?.data?.detail ||
              "Unable to load reports. Please try again.",
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    fetchReport();

    return () => {
      cancelled = true;
    };
  }, [branchId, startDate, endDate]);

  async function submitExpense(event) {
    event.preventDefault();

    if (!branchId) {
      setError("Select a branch before adding an expense.");
      return;
    }

    setSaving(true);
    setError("");
    setNotice("");

    try {
      await createExpense(branchId, {
        ...form,
        amount: Number(form.amount),
      });

      setForm((current) => ({
        ...current,
        description: "",
        amount: "",
        notes: "",
        incurred_on: dateString(new Date()),
      }));

      setNotice("Expense saved.");
      await loadReport();
    } catch (err) {
      setError(err.response?.data?.detail || "Could not save expense.");
    } finally {
      setSaving(false);
    }
  }

  async function removeExpense(expenseId) {
    if (!window.confirm("Delete this expense record? This cannot be undone.")) {
      return;
    }

    try {
      await deleteExpense(branchId, expenseId);
      setNotice("Expense deleted.");
      await loadReport();
    } catch (err) {
      setError(err.response?.data?.detail || "Could not delete expense.");
    }
  }

  function exportCsv() {
    if (!report) return;

    const rows = [
      ["Smart Menu Operations & Expenses Report", `${startDate} to ${endDate}`],
      ["Metric", "Value"],
      ["Paid revenue", report?.paid_revenue ?? 0],
      ["Recorded expenses", report?.recorded_expenses ?? 0],
      [
        "Estimated contribution after recorded expenses",
        report?.estimated_contribution_after_recorded_expenses ?? 0,
      ],
      ["Table utilization (%)", report?.table_utilization_percent ?? 0],
      ["Tables used", report?.tables_used ?? 0],
      ["Active orders", report?.active_orders ?? 0],
      ["Completed orders", report?.completed_orders ?? 0],
      [
        "Average completion minutes",
        report?.average_completion_minutes ?? "N/A",
      ],
      [],
      ["Expense date", "Category", "Description", "Amount (INR)", "Notes"],
      ...expenses.map((expense) => [
        expense.incurred_on,
        expense.category,
        expense.description,
        expense.amount,
        expense.notes || "",
      ]),
    ];

    const blob = new Blob(
      ["\uFEFF" + rows.map((row) => row.map(csvCell).join(",")).join("\r\n")],
      { type: "text/csv;charset=utf-8;" },
    );

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = `smart-menu-report-${startDate}-to-${endDate}.csv`;

    document.body.appendChild(link);
    link.click();
    link.remove();

    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  const cards = [
    {
      label: "Paid revenue",
      value: currency(report?.paid_revenue),
      icon: Wallet,
    },
    {
      label: "Recorded expenses",
      value: currency(report?.recorded_expenses),
      icon: Receipt,
    },
    {
      label: "Contribution after recorded expenses",
      value: currency(report?.estimated_contribution_after_recorded_expenses),
      icon: TrendingUp,
    },
    {
      label: "Table utilization",
      value: `${Number(report?.table_utilization_percent || 0).toFixed(1)}%`,
      icon: Armchair,
    },
  ];

  return (
    <main className="business-reports-page">
      <header className="br-header">
        <div>
          <span className="br-eyebrow">PHASE 6 · BUSINESS INTELLIGENCE</span>

          <h1>Reports & Operations</h1>

          <p>
            One place for operational metrics, recorded expenses, and links to
            detailed reports.
          </p>

          {selectedBranch && (
            <p className="br-selected-branch">
              Branch: <strong>{selectedBranch.name}</strong>
            </p>
          )}
        </div>

        <div className="br-actions no-print">
          <button type="button" onClick={exportCsv} disabled={!report}>
            <Download size={16} />
            Export CSV
          </button>

          <button
            type="button"
            onClick={() => window.print()}
            disabled={!report}
          >
            <FileText size={16} />
            Print / Save PDF
          </button>

          <button
            type="button"
            onClick={loadReport}
            disabled={loading || !branchId}
          >
            <RefreshCw size={16} className={loading ? "br-spin" : ""} />
            Refresh
          </button>
        </div>
      </header>

      <section className="br-filters no-print">
        <label>
          From
          <input
            type="date"
            value={startDate}
            max={endDate}
            onChange={(event) => setStartDate(event.target.value)}
          />
        </label>

        <label>
          To
          <input
            type="date"
            value={endDate}
            min={startDate}
            onChange={(event) => setEndDate(event.target.value)}
          />
        </label>
      </section>

      {error && (
        <div className="br-message br-error" role="alert">
          {error}
        </div>
      )}

      {notice && (
        <div className="br-message br-success" role="status">
          {notice}
        </div>
      )}

      {branchLoading ? (
        <p className="br-muted">Loading branch information…</p>
      ) : !branchId ? (
        <p className="br-muted">
          Select a branch from the dashboard header to view reports.
        </p>
      ) : (
        <>
          {loading && <p className="br-muted">Loading reports…</p>}

          <section className="br-card-grid">
            {cards.map(({ label, value, icon: Icon }) => (
              <article className="br-stat-card" key={label}>
                <span className="br-stat-icon">
                  <Icon size={19} />
                </span>

                <span className="br-stat-label">{label}</span>
                <strong>{value}</strong>
              </article>
            ))}
          </section>

          <section className="br-panel">
            <div className="br-panel-heading">
              <div>
                <h2>Operational performance</h2>
                <p>Metrics for the selected period.</p>
              </div>
            </div>

            <div className="br-metric-grid">
              <div>
                <span>Tables used</span>
                <strong>
                  {report?.tables_used ?? "—"} / {report?.table_count ?? "—"}
                </strong>
              </div>

              <div>
                <span>Tables unavailable</span>
                <strong>{report?.unavailable_table_count ?? "—"}</strong>
              </div>

              <div>
                <span>Table turnover</span>
                <strong>
                  {report
                    ? `${report.table_turnover_per_table} orders/table`
                    : "—"}
                </strong>
              </div>

              <div>
                <span>Orders completed</span>
                <strong>{report?.completed_orders ?? "—"}</strong>
              </div>

              <div>
                <span>Orders active</span>
                <strong>{report?.active_orders ?? "—"}</strong>
              </div>

              <div>
                <span>Avg. create-to-last-update</span>
                <strong>
                  {report?.average_create_to_last_update_minutes == null
                    ? "Not enough completed-order data"
                    : `${report.average_create_to_last_update_minutes} min`}
                </strong>
              </div>
            </div>

            {report?.profit_note && (
              <p className="br-footnote">{report.profit_note}</p>
            )}
          </section>

          <section className="br-panel">
            <div className="br-panel-heading">
              <div>
                <h2>Detailed reports</h2>
                <p>Open an existing report for more breakdowns.</p>
              </div>
            </div>

            <div className="br-report-links">
              <Link to="/dashboard/sales-analytics">
                <TrendingUp size={18} />
                <span>
                  <strong>Sales analytics</strong>
                  <small>
                    Revenue trends, order volume, average order value,
                    best-selling dishes
                  </small>
                </span>
              </Link>

              <Link to="/dashboard/analytics">
                <TrendingUp size={18} />
                <span>
                  <strong>Menu & customer analytics</strong>
                  <small>
                    QR engagement, searches, dish views, reviews and popular
                    items
                  </small>
                </span>
              </Link>

              <Link to="/dashboard/revenue-analytics">
                <Wallet size={18} />
                <span>
                  <strong>Revenue analytics</strong>
                  <small>
                    Collections, outstanding bills, payment methods and daily
                    totals
                  </small>
                </span>
              </Link>

              <Link to="/dashboard/reports">
                <FileText size={18} />
                <span>
                  <strong>POS reports</strong>
                  <small>
                    Bill totals, tax, discounts, payment and order status
                    breakdown
                  </small>
                </span>
              </Link>
            </div>
          </section>

          <section className="br-panel no-print">
            <div className="br-panel-heading">
              <div>
                <h2>Record an expense</h2>
                <p>
                  Expenses are branch-specific and used in the selected-period
                  summary.
                </p>
              </div>
            </div>

            <form className="br-expense-form" onSubmit={submitExpense}>
              <label>
                Category
                <select
                  value={form.category}
                  onChange={(event) =>
                    setForm({ ...form, category: event.target.value })
                  }
                >
                  {[
                    "Utilities",
                    "Rent",
                    "Payroll",
                    "Supplies",
                    "Maintenance",
                    "Marketing",
                    "Delivery",
                    "Other",
                  ].map((category) => (
                    <option key={category}>{category}</option>
                  ))}
                </select>
              </label>

              <label>
                Description
                <input
                  required
                  minLength={2}
                  maxLength={250}
                  value={form.description}
                  onChange={(event) =>
                    setForm({ ...form, description: event.target.value })
                  }
                  placeholder="e.g. Electricity bill"
                />
              </label>

              <label>
                Amount (₹)
                <input
                  required
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={form.amount}
                  onChange={(event) =>
                    setForm({ ...form, amount: event.target.value })
                  }
                  placeholder="0.00"
                />
              </label>

              <label>
                Expense date
                <input
                  required
                  type="date"
                  value={form.incurred_on}
                  onChange={(event) =>
                    setForm({ ...form, incurred_on: event.target.value })
                  }
                />
              </label>

              <label className="br-notes-field">
                Notes (optional)
                <input
                  maxLength={4000}
                  value={form.notes}
                  onChange={(event) =>
                    setForm({ ...form, notes: event.target.value })
                  }
                  placeholder="Reference or additional details"
                />
              </label>

              <button type="submit" disabled={saving || !branchId}>
                {saving ? "Saving…" : "Add expense"}
              </button>
            </form>
          </section>

          <section className="br-panel">
            <div className="br-panel-heading">
              <div>
                <h2>Recorded expenses</h2>
                <p>{expenses.length} records in the selected period.</p>
              </div>
            </div>

            {expenses.length ? (
              <div className="br-table-wrap">
                <table className="br-expense-table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Category</th>
                      <th>Description</th>
                      <th>Amount</th>
                      <th>Notes</th>
                      <th className="no-print">Action</th>
                    </tr>
                  </thead>

                  <tbody>
                    {expenses.map((expense) => (
                      <tr key={expense.id}>
                        <td>{expense.incurred_on}</td>
                        <td>{expense.category}</td>
                        <td>{expense.description}</td>
                        <td>{currency(expense.amount)}</td>
                        <td>{expense.notes || "—"}</td>

                        <td className="no-print">
                          <button
                            type="button"
                            className="br-delete"
                            onClick={() => removeExpense(expense.id)}
                          >
                            Delete
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="br-empty">
                No expenses recorded for this date range.
              </p>
            )}
          </section>
        </>
      )}
    </main>
  );
}
