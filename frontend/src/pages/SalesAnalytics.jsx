import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  CalendarDays,
  CheckCircle2,
  IndianRupee,
  RefreshCw,
  ShoppingBag,
  TrendingUp,
  Utensils,
  XCircle,
} from "lucide-react";

import { getBranchSalesAnalytics } from "../api/salesAnalytics";

const money = (value) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(Number(value || 0));

const number = (value) =>
  new Intl.NumberFormat("en-IN").format(Number(value || 0));

const dateLabel = (value) =>
  new Date(`${value}T12:00:00`).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
  });

function MetricCard({ icon: Icon, label, value, note }) {
  return (
    <article className="sales-metric-card">
      <div className="sales-metric-top">
        <span>{label}</span>
        <span className="sales-metric-icon">
          <Icon size={20} />
        </span>
      </div>
      <strong className="sales-metric-value">{value}</strong>
      <span className="sales-metric-note">{note}</span>
    </article>
  );
}

function RevenueChart({ data }) {
  const width = 760;
  const height = 260;
  const pad = { top: 20, right: 20, bottom: 42, left: 20 };

  const chartWidth = width - pad.left - pad.right;
  const chartHeight = height - pad.top - pad.bottom;
  const maximum = Math.max(
    1,
    ...data.map((point) => Number(point.revenue || 0)),
  );

  const points = data.map((point, index) => ({
    ...point,
    x:
      data.length === 1
        ? width / 2
        : pad.left + (index / (data.length - 1)) * chartWidth,
    y:
      pad.top +
      chartHeight -
      (Number(point.revenue || 0) / maximum) * chartHeight,
  }));

  const line = points.map((point) => `${point.x},${point.y}`).join(" ");
  const area = points.length
    ? `${pad.left},${pad.top + chartHeight} ${line} ${points[points.length - 1].x},${pad.top + chartHeight}`
    : "";

  if (!data.length) {
    return <div className="sales-empty">No revenue data for this period.</div>;
  }

  return (
    <div className="sales-chart-scroll">
      <svg
        className="sales-revenue-chart"
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label="Daily revenue chart"
      >
        {[0, 1, 2, 3].map((tick) => {
          const y = pad.top + (chartHeight / 3) * tick;
          return (
            <line
              key={tick}
              x1={pad.left}
              x2={width - pad.right}
              y1={y}
              y2={y}
              className="sales-grid-line"
            />
          );
        })}

        {points.length > 1 && (
          <polygon points={area} className="sales-chart-area" />
        )}

        {points.length > 1 && (
          <polyline points={line} className="sales-chart-line" />
        )}

        {points.map((point) => (
          <g key={point.date}>
            <circle
              cx={point.x}
              cy={point.y}
              r="4"
              className="sales-chart-point"
            />
            <title>{`${point.date}: ${money(point.revenue)}`}</title>
          </g>
        ))}

        {points.map((point, index) => {
          const step = Math.max(1, Math.ceil(points.length / 7));
          if (index % step !== 0 && index !== points.length - 1) {
            return null;
          }

          return (
            <text
              key={point.date}
              x={point.x}
              y={height - 13}
              textAnchor="middle"
              className="sales-chart-label"
            >
              {dateLabel(point.date)}
            </text>
          );
        })}
      </svg>
    </div>
  );
}

function StatusBreakdown({ breakdown = {} }) {
  const entries = Object.entries(breakdown);
  const total = entries.reduce((sum, [, count]) => sum + Number(count), 0);

  if (!entries.length) {
    return <div className="sales-empty">No orders in this period.</div>;
  }

  return (
    <div className="sales-status-list">
      {entries
        .sort((a, b) => Number(b[1]) - Number(a[1]))
        .map(([status, count]) => (
          <div className="sales-status-row" key={status}>
            <div className="sales-status-heading">
              <span>{status.replaceAll("_", " ")}</span>
              <strong>{number(count)}</strong>
            </div>
            <div className="sales-status-track">
              <div
                className={`sales-status-fill status-${status}`}
                style={{
                  width: `${total ? (Number(count) / total) * 100 : 0}%`,
                }}
              />
            </div>
          </div>
        ))}
    </div>
  );
}

export default function SalesAnalytics() {
  const [analytics, setAnalytics] = useState(null);
  const [days, setDays] = useState(7);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const branchId = localStorage.getItem("selected_branch_id");

  const loadAnalytics = useCallback(
    async (refresh = false) => {
      if (!branchId) {
        setError("Select a branch before viewing sales analytics.");
        setLoading(false);
        return;
      }

      if (Boolean(startDate) !== Boolean(endDate)) {
        setError("Choose both a start date and an end date.");
        setLoading(false);
        return;
      }

      if (startDate && endDate && startDate > endDate) {
        setError("Start date must be on or before end date.");
        setLoading(false);
        return;
      }

      try {
        refresh ? setRefreshing(true) : setLoading(true);
        setError("");

        const result = await getBranchSalesAnalytics(
          branchId,
          days,
          startDate,
          endDate,
        );

        setAnalytics(result);
      } catch (err) {
        console.error("Sales analytics error:", err);
        setError(
          err.response?.data?.detail ||
            "Unable to load sales analytics. Check the backend endpoint.",
        );
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [branchId, days, startDate, endDate],
  );

  useEffect(() => {
    loadAnalytics();
  }, [loadAnalytics]);

  const chartData = useMemo(() => analytics?.daily_revenue || [], [analytics]);

  const topDishMax = Math.max(
    1,
    ...(analytics?.popular_dishes || []).map((dish) =>
      Number(dish.quantity_sold || 0),
    ),
  );

  function clearCustomDates() {
    setStartDate("");
    setEndDate("");
  }

  return (
    <main className="sales-page">
      <header className="sales-page-header">
        <div>
          <span className="sales-eyebrow">BUSINESS OVERVIEW</span>
          <h1>Sales Analytics</h1>
          <p>Understand revenue, order trends and your best-selling dishes.</p>
        </div>

        <button
          type="button"
          className="sales-refresh-button"
          onClick={() => loadAnalytics(true)}
          disabled={loading || refreshing}
        >
          <RefreshCw size={16} className={refreshing ? "sales-spinning" : ""} />
          Refresh
        </button>
      </header>

      <section className="sales-filters">
        <label>
          <CalendarDays size={17} />
          <span>Period</span>
          <select
            value={days}
            onChange={(event) => {
              setDays(Number(event.target.value));
              clearCustomDates();
            }}
          >
            <option value={7}>Last 7 days</option>
            <option value={14}>Last 14 days</option>
            <option value={30}>Last 30 days</option>
            <option value={60}>Last 60 days</option>
            <option value={90}>Last 90 days</option>
          </select>
        </label>

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
            onChange={(event) => setEndDate(event.target.value)}
          />
        </label>

        {(startDate || endDate) && (
          <button
            type="button"
            className="sales-clear-button"
            onClick={clearCustomDates}
          >
            Clear dates
          </button>
        )}
      </section>

      {error && (
        <div className="sales-error" role="alert">
          {error}
          <button type="button" onClick={() => loadAnalytics()}>
            Try again
          </button>
        </div>
      )}

      {loading ? (
        <div className="sales-loading">
          <RefreshCw size={22} className="sales-spinning" />
          Loading sales analytics…
        </div>
      ) : analytics ? (
        <>
          <div className="sales-metrics-grid">
            <MetricCard
              icon={IndianRupee}
              label="Order value"
              value={money(analytics.total_revenue)}
              note="Excludes cancelled orders"
            />
            <MetricCard
              icon={ShoppingBag}
              label="All orders"
              value={number(analytics.total_orders)}
              note={`${number(analytics.cancelled_orders)} cancelled`}
            />
            <MetricCard
              icon={TrendingUp}
              label="Average order value"
              value={money(analytics.average_order_value)}
              note="Non-cancelled orders"
            />
            <MetricCard
              icon={CheckCircle2}
              label="Eligible orders"
              value={number(analytics.eligible_orders)}
              note="All non-cancelled orders"
            />
          </div>

          <section className="sales-panel">
            <div className="sales-panel-header">
              <div>
                <h2>Revenue trend</h2>
                <p>
                  {analytics.start_date} to {analytics.end_date}
                </p>
              </div>
              <span className="sales-panel-badge">
                <Activity size={15} /> Daily
              </span>
            </div>

            <RevenueChart data={chartData} />

            <div className="sales-chart-footer">
              <span>Total order value</span>
              <strong>{money(analytics.total_revenue)}</strong>
            </div>
          </section>

          <div className="sales-lower-grid">
            <section className="sales-panel">
              <div className="sales-panel-header">
                <div>
                  <h2>Popular dishes</h2>
                  <p>Ranked by quantity ordered</p>
                </div>
                <Utensils size={19} />
              </div>

              {analytics.popular_dishes?.length ? (
                <div className="sales-dishes-list">
                  {analytics.popular_dishes.map((dish, index) => (
                    <div className="sales-dish-row" key={dish.dish_name}>
                      <span className="sales-dish-rank">
                        {String(index + 1).padStart(2, "0")}
                      </span>

                      <div className="sales-dish-info">
                        <div className="sales-dish-heading">
                          <strong>{dish.dish_name}</strong>
                          <span>{number(dish.quantity_sold)} sold</span>
                        </div>
                        <div className="sales-status-track">
                          <div
                            className="sales-dish-bar"
                            style={{
                              width: `${
                                (Number(dish.quantity_sold) / topDishMax) * 100
                              }%`,
                            }}
                          />
                        </div>
                      </div>

                      <strong className="sales-dish-sales">
                        {money(dish.sales)}
                      </strong>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="sales-empty">
                  No dish sales found in this period.
                </div>
              )}
            </section>

            <section className="sales-panel">
              <div className="sales-panel-header">
                <div>
                  <h2>Order status</h2>
                  <p>All orders in the selected period</p>
                </div>
                <ShoppingBag size={19} />
              </div>

              <StatusBreakdown breakdown={analytics.status_breakdown} />

              <div className="sales-cancelled-note">
                <XCircle size={16} />
                Cancelled orders are excluded from order value.
              </div>
            </section>
          </div>

          <p className="sales-disclaimer">
            These figures represent non-cancelled order values, not verified
            payments or cash collected.
          </p>
        </>
      ) : (
        <div className="sales-empty">No analytics data available.</div>
      )}
    </main>
  );
}
