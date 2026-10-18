import { useCallback, useEffect, useRef, useState } from "react";
import { getBranchBillAnalytics } from "../api/bills";
import "./RevenueAnalytics.css";

function toDateInput(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatCurrency(value) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(Number(value || 0));
}

function formatDate(value) {
  return new Date(`${value}T00:00:00`).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
  });
}

export default function RevenueAnalytics() {
  const today = new Date();
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(today.getDate() - 29);

  const [startDate, setStartDate] = useState(toDateInput(thirtyDaysAgo));
  const [endDate, setEndDate] = useState(toDateInput(today));
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const requestIdRef = useRef(0);

  const loadAnalytics = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    const branchId = localStorage.getItem("selected_branch_id");

    if (!branchId) {
      setError("Select a branch before viewing revenue analytics.");
      setAnalytics(null);
      setLoading(false);
      return;
    }

    if (startDate && endDate && startDate > endDate) {
      setError("Start date cannot be after the end date.");
      setAnalytics(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError("");

    try {
      const data = await getBranchBillAnalytics(branchId, startDate, endDate);
      if (requestId !== requestIdRef.current) return;
      setAnalytics(data);
    } catch (err) {
      if (requestId !== requestIdRef.current) return;
      setAnalytics(null);
      setError(
        err.response?.data?.detail ||
          "Unable to load analytics. Please try again.",
      );
    } finally {
      if (requestId === requestIdRef.current) {
        setLoading(false);
      }
    }
  }, [startDate, endDate]);

  useEffect(() => {
    loadAnalytics();
    return () => {
      // Invalidate in-flight requests when filters change or the page unmounts.
      requestIdRef.current += 1;
    };
  }, [loadAnalytics]);

  const dailyTotals = analytics?.daily_totals || [];
  const paymentMethods = analytics?.payment_methods || [];

  function exportDailyReport() {
    if (!analytics || dailyTotals.length === 0) return;

    const headers = [
      "Date",
      "Number of Bills",
      "Total Billed (INR)",
      "Revenue Collected (INR)",
    ];

    const rows = dailyTotals.map((day) => [
      day.date,
      day.bill_count,
      day.total_billed,
      day.paid_amount,
    ]);

    const escapeCsv = (value) => {
      const text = String(value ?? "");
      return `"${text.replace(/"/g, '""')}"`;
    };

    const csvContent = [headers, ...rows]
      .map((row) => row.map(escapeCsv).join(","))
      .join("\r\n");

    const blob = new Blob(["\uFEFF" + csvContent], {
      type: "text/csv;charset=utf-8;",
    });

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = `revenue-report-${startDate}-to-${endDate}.csv`;

    document.body.appendChild(link);
    link.click();
    link.remove();

    // Let the browser begin the download before releasing the temporary URL.
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  const maxRevenue = Math.max(
    1,
    ...dailyTotals.map((day) => Number(day.paid_amount || 0)),
  );

  const cards = [
    {
      label: "Total billed",
      value: formatCurrency(analytics?.total_billed),
      detail: `${analytics?.bill_count ?? 0} bills generated`,
      icon: "₹",
    },
    {
      label: "Revenue collected",
      value: formatCurrency(analytics?.paid_amount),
      detail: `${analytics?.paid_count ?? 0} paid bills`,
      icon: "↗",
    },
    {
      label: "Outstanding",
      value: formatCurrency(analytics?.outstanding_amount),
      detail: `${analytics?.unpaid_count ?? 0} unpaid bills`,
      icon: "◷",
    },
    {
      label: "Refunded bills",
      value: String(analytics?.refunded_count ?? 0),
      detail: "Bills marked as refunded",
      icon: "↩",
    },
  ];

  return (
    <main className="revenue-page">
      <header className="revenue-header">
        <div>
          <p className="revenue-eyebrow">BUSINESS OVERVIEW</p>
          <h1>Revenue Analytics</h1>
          <p className="revenue-subtitle">
            Track collections, outstanding bills and daily revenue.
          </p>
        </div>

        <div className="revenue-header-actions">
          <button
            type="button"
            className="revenue-export"
            onClick={exportDailyReport}
            disabled={loading || dailyTotals.length === 0}
          >
            ↓ Export CSV
          </button>

          <button
            className="revenue-refresh"
            type="button"
            onClick={loadAnalytics}
            disabled={loading}
          >
            {loading ? "Loading..." : "↻ Refresh"}
          </button>
        </div>
      </header>

      <section className="revenue-filters">
        <label>
          <span>From</span>
          <input
            type="date"
            value={startDate}
            max={endDate || undefined}
            onChange={(event) => setStartDate(event.target.value)}
          />
        </label>

        <label>
          <span>To</span>
          <input
            type="date"
            value={endDate}
            min={startDate || undefined}
            max={toDateInput(today)}
            onChange={(event) => setEndDate(event.target.value)}
          />
        </label>

        <button
          type="button"
          className="revenue-apply"
          onClick={loadAnalytics}
          disabled={loading}
        >
          Apply filters
        </button>
      </section>

      {error && (
        <div className="revenue-error" role="alert">
          {error}
        </div>
      )}

      {loading && !analytics ? (
        <div className="revenue-empty">Loading revenue data...</div>
      ) : analytics ? (
        <>
          <section className="revenue-summary">
            {cards.map((card) => (
              <article className="revenue-card" key={card.label}>
                <div className="revenue-card-top">
                  <span>{card.label}</span>
                  <span className="revenue-card-icon">{card.icon}</span>
                </div>
                <strong>{card.value}</strong>
                <p>{card.detail}</p>
              </article>
            ))}
          </section>

          <section className="revenue-panels">
            <article className="revenue-panel revenue-chart-panel">
              <div className="revenue-panel-heading">
                <div>
                  <h2>Daily collections</h2>
                  <p>Paid revenue by bill creation date</p>
                </div>
                <span className="revenue-legend">
                  <i /> Collected
                </span>
              </div>

              {dailyTotals.length === 0 ? (
                <div className="revenue-empty">
                  No daily revenue data for this period.
                </div>
              ) : (
                <div className="revenue-chart">
                  {dailyTotals.map((day) => {
                    const amount = Number(day.paid_amount || 0);
                    const height = (amount / maxRevenue) * 100;

                    return (
                      <div
                        className="revenue-bar-column"
                        key={day.date}
                        title={`${formatDate(day.date)}: ${formatCurrency(amount)}`}
                      >
                        <span className="revenue-bar-value">
                          {amount > 0 ? formatCurrency(amount) : "—"}
                        </span>
                        <div className="revenue-bar-track">
                          <div
                            className="revenue-bar"
                            style={{ height: `${height}%` }}
                          />
                        </div>
                        <span className="revenue-bar-date">
                          {formatDate(day.date)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </article>

            <article className="revenue-panel">
              <div className="revenue-panel-heading">
                <div>
                  <h2>Payment methods</h2>
                  <p>Collections grouped by payment type</p>
                </div>
              </div>

              {paymentMethods.length === 0 ? (
                <div className="revenue-empty">
                  No payment-method data available.
                </div>
              ) : (
                <div className="payment-method-list">
                  {paymentMethods.map((method) => (
                    <div
                      className="payment-method-row"
                      key={method.method || "unknown"}
                    >
                      <div>
                        <strong>
                          {(method.method || "Unknown").toUpperCase()}
                        </strong>
                        <span>{method.bill_count} bills</span>
                      </div>
                      <strong>{formatCurrency(method.amount)}</strong>
                    </div>
                  ))}
                </div>
              )}
            </article>
          </section>

          <section className="revenue-panel revenue-daily-table">
            <div className="revenue-panel-heading">
              <div>
                <h2>Daily breakdown</h2>
                <p>Bill volume and revenue for each date</p>
              </div>
            </div>

            {dailyTotals.length === 0 ? (
              <div className="revenue-empty">No records to display.</div>
            ) : (
              <div className="revenue-table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Bills</th>
                      <th>Total billed</th>
                      <th>Collected</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...dailyTotals].reverse().map((day) => (
                      <tr key={day.date}>
                        <td>{formatDate(day.date)}</td>
                        <td>{day.bill_count}</td>
                        <td>{formatCurrency(day.total_billed)}</td>
                        <td className="revenue-collected">
                          {formatCurrency(day.paid_amount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      ) : null}
    </main>
  );
}
