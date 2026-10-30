import { useCallback, useEffect, useState } from "react";
import {
  RefreshCw,
  TrendingUp,
  Wallet,
  ReceiptText,
  Percent,
  BadgeIndianRupee,
  ShoppingBag,
  AlertCircle,
} from "lucide-react";

import { getBranchBillAnalytics } from "../api/bills";
import { useBranchSelection } from "../context/BranchSelectionContext";

import "./Reports.css";

const money = (value) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(Number(value || 0));

const number = (value) =>
  new Intl.NumberFormat("en-IN").format(Number(value || 0));

const formatDate = (value) => {
  if (!value) return "—";

  return new Date(`${value}T00:00:00`).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
};

function StatCard({ icon: Icon, label, value, detail }) {
  return (
    <article className="report-stat-card">
      <div className="report-stat-icon">
        <Icon size={21} />
      </div>
      <p>{label}</p>
      <h2>{value}</h2>
      {detail && <small>{detail}</small>}
    </article>
  );
}

export default function Reports() {
  const {
    selectedBranch,
    selectedBranchId,
    loading: branchLoading,
  } = useBranchSelection();

  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const [report, setReport] = useState(null);
  const [loadingReport, setLoadingReport] = useState(false);
  const [error, setError] = useState("");

  const branchId = selectedBranchId
    ? String(selectedBranchId)
    : selectedBranch?.id
      ? String(selectedBranch.id)
      : "";

  const loadReport = useCallback(async () => {
    if (!branchId) {
      setReport(null);
      return;
    }

    if (startDate && endDate && startDate > endDate) {
      setError("Start date cannot be after end date.");
      return;
    }

    try {
      setLoadingReport(true);
      setError("");

      const data = await getBranchBillAnalytics(branchId, {
        startDate,
        endDate,
      });

      setReport(data);
    } catch (err) {
      setReport(null);
      setError(
        err.response?.data?.detail ||
          "Could not load POS reports. Please try again.",
      );
    } finally {
      setLoadingReport(false);
    }
  }, [branchId, startDate, endDate]);

  useEffect(() => {
    let cancelled = false;

    async function fetchReport() {
      if (!branchId) {
        setReport(null);
        setError("");
        return;
      }

      if (startDate && endDate && startDate > endDate) {
        setReport(null);
        setError("Start date cannot be after end date.");
        return;
      }

      try {
        setLoadingReport(true);
        setError("");

        const data = await getBranchBillAnalytics(branchId, {
          startDate,
          endDate,
        });

        if (!cancelled) {
          setReport(data);
        }
      } catch (err) {
        if (!cancelled) {
          setReport(null);
          setError(
            err.response?.data?.detail ||
              "Could not load POS reports. Please try again.",
          );
        }
      } finally {
        if (!cancelled) {
          setLoadingReport(false);
        }
      }
    }

    fetchReport();

    return () => {
      cancelled = true;
    };
  }, [branchId, startDate, endDate]);

  const dailyTotals = report?.daily_totals || [];
  const collections = report?.daily_collections || [];
  const paymentMethods = report?.payment_methods || [];
  const orderStatuses = report?.order_statuses || [];

  const maxDailySales = Math.max(
    1,
    ...dailyTotals.map((item) => Number(item.total_billed || 0)),
  );

  return (
    <main className="reports-page">
      <header className="reports-header">
        <div>
          <span className="reports-eyebrow">POINT OF SALE</span>
          <h1>Sales Reports</h1>
          <p>
            Review billing, collections, discounts, taxes, and order activity.
          </p>

          {selectedBranch && (
            <p className="reports-selected-branch">
              Branch: <strong>{selectedBranch.name}</strong>
            </p>
          )}
        </div>

        <button
          type="button"
          className="reports-refresh"
          onClick={loadReport}
          disabled={loadingReport || !branchId}
        >
          <RefreshCw
            size={17}
            className={loadingReport ? "reports-spinning" : ""}
          />
          Refresh
        </button>
      </header>

      <section className="reports-filters">
        <label>
          <span>From date</span>
          <input
            type="date"
            value={startDate}
            max={endDate || undefined}
            onChange={(event) => setStartDate(event.target.value)}
          />
        </label>

        <label>
          <span>To date</span>
          <input
            type="date"
            value={endDate}
            min={startDate || undefined}
            onChange={(event) => setEndDate(event.target.value)}
          />
        </label>

        <button
          type="button"
          className="reports-clear"
          onClick={() => {
            setStartDate("");
            setEndDate("");
          }}
        >
          All dates
        </button>
      </section>

      {error && (
        <div className="reports-error" role="alert">
          <AlertCircle size={18} />
          {error}
        </div>
      )}

      {branchLoading ? (
        <div className="reports-loading">Loading branch information...</div>
      ) : !branchId ? (
        <div className="reports-empty">
          Select a restaurant branch from the dashboard header to view its
          reports.
        </div>
      ) : loadingReport && !report ? (
        <div className="reports-loading">Loading your reports...</div>
      ) : report ? (
        <>
          <div className="reports-period">
            Showing bills created{" "}
            {startDate ? `from ${formatDate(startDate)}` : "for all dates"}
            {endDate ? ` to ${formatDate(endDate)}` : ""}
          </div>

          <section className="reports-stats-grid">
            <StatCard
              icon={TrendingUp}
              label="Total billed"
              value={money(report.total_billed)}
              detail={`${number(report.bill_count)} bills`}
            />

            <StatCard
              icon={Wallet}
              label="Paid amount"
              value={money(report.paid_amount)}
              detail={`${number(report.paid_count)} paid bills`}
            />

            <StatCard
              icon={ReceiptText}
              label="Outstanding"
              value={money(report.outstanding_amount)}
              detail={`${number(report.unpaid_count)} outstanding bills`}
            />

            <StatCard
              icon={Percent}
              label="Discounts"
              value={money(report.discount_amount)}
              detail="Applied to bills in this period"
            />

            <StatCard
              icon={BadgeIndianRupee}
              label="Tax collected on bills"
              value={money(report.tax_amount)}
              detail="Tax charged, not necessarily remitted"
            />

            <StatCard
              icon={ShoppingBag}
              label="Orders"
              value={number(report.order_count)}
              detail={`${number(report.refunded_count)} bills marked refunded`}
            />
          </section>

          <section className="reports-panel">
            <div className="reports-panel-heading">
              <div>
                <h2>Daily billed sales</h2>
                <p>Grouped by bill creation date</p>
              </div>
            </div>

            {!dailyTotals.length ? (
              <p className="reports-no-data">No bills in this period.</p>
            ) : (
              <div className="reports-daily-list">
                {dailyTotals.map((day) => (
                  <div className="reports-daily-row" key={day.date}>
                    <div className="reports-daily-label">
                      <strong>{formatDate(day.date)}</strong>
                      <span>{number(day.bill_count)} bills</span>
                    </div>

                    <div className="reports-bar-track">
                      <div
                        className="reports-bar"
                        style={{
                          width: `${Math.min(
                            100,
                            (Number(day.total_billed || 0) / maxDailySales) *
                              100,
                          )}%`,
                        }}
                      />
                    </div>

                    <strong className="reports-daily-value">
                      {money(day.total_billed)}
                    </strong>
                  </div>
                ))}
              </div>
            )}
          </section>

          <div className="reports-two-columns">
            <section className="reports-panel">
              <div className="reports-panel-heading">
                <div>
                  <h2>Payment methods</h2>
                  <p>Paid bills grouped by payment method</p>
                </div>
              </div>

              {!paymentMethods.length ? (
                <p className="reports-no-data">No paid bills found.</p>
              ) : (
                <div className="reports-table-wrap">
                  <table className="reports-table">
                    <thead>
                      <tr>
                        <th>Method</th>
                        <th>Bills</th>
                        <th>Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {paymentMethods.map((method) => (
                        <tr key={method.method}>
                          <td className="reports-capitalize">
                            {method.method}
                          </td>
                          <td>{number(method.bill_count)}</td>
                          <td>{money(method.amount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            <section className="reports-panel">
              <div className="reports-panel-heading">
                <div>
                  <h2>Order statuses</h2>
                  <p>Orders created during the selected period</p>
                </div>
              </div>

              {!orderStatuses.length ? (
                <p className="reports-no-data">No orders found.</p>
              ) : (
                <div className="reports-status-list">
                  {orderStatuses.map((item) => (
                    <div className="reports-status-row" key={item.status}>
                      <span className="reports-capitalize">{item.status}</span>
                      <strong>{number(item.count)}</strong>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>

          <section className="reports-panel">
            <div className="reports-panel-heading">
              <div>
                <h2>Daily collections</h2>
                <p>Grouped by the date payment was recorded</p>
              </div>
            </div>

            {!collections.length ? (
              <p className="reports-no-data">
                No recorded collections in this period.
              </p>
            ) : (
              <div className="reports-table-wrap">
                <table className="reports-table">
                  <thead>
                    <tr>
                      <th>Collection date</th>
                      <th>Payments</th>
                      <th>Amount collected</th>
                    </tr>
                  </thead>
                  <tbody>
                    {collections.map((item) => (
                      <tr key={item.date}>
                        <td>{formatDate(item.date)}</td>
                        <td>{number(item.payment_count)}</td>
                        <td>{money(item.collected_amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      ) : (
        <div className="reports-empty">
          No report data is available for this branch.
        </div>
      )}
    </main>
  );
}
