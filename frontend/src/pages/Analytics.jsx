import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  Bot,
  Eye,
  GitBranch,
  MessageSquare,
  QrCode,
  RefreshCw,
  Search,
  Star,
  TrendingUp,
  Utensils,
  Users,
} from "lucide-react";

import { getBranchAnalytics } from "../api/analytics";
import { getBranches } from "../api/branches";

function formatNumber(value) {
  return new Intl.NumberFormat("en-IN").format(value || 0);
}

function StatCard({ icon, label, value }) {
  return (
    <div className="analytics-stat-card">
      <div className="analytics-stat-icon">{icon}</div>

      <div className="analytics-stat-content">
        <span className="analytics-stat-label">{label}</span>

        <strong className="analytics-stat-value">{value}</strong>
      </div>
    </div>
  );
}

function EngagementItem({ icon, label, value }) {
  return (
    <div className="analytics-engagement-item">
      <div className="analytics-engagement-icon">{icon}</div>

      <div>
        <span>{label}</span>
        <strong>{value}</strong>
      </div>
    </div>
  );
}

function ActivityChart({ trends }) {
  const [activeMetric, setActiveMetric] = useState("menu_views");

  const metrics = [
    {
      key: "menu_views",
      label: "Menu Views",
    },
    {
      key: "qr_scans",
      label: "QR Scans",
    },
    {
      key: "dish_views",
      label: "Dish Views",
    },
    {
      key: "searches",
      label: "Searches",
    },
    {
      key: "ai_questions",
      label: "AI Questions",
    },
    {
      key: "reviews_submitted",
      label: "Reviews",
    },
  ];

  const chartData = useMemo(() => {
    return (trends || []).map((item) => ({
      date: item.date,
      value: Number(item[activeMetric] || 0),
    }));
  }, [trends, activeMetric]);

  const maxValue = Math.max(...chartData.map((item) => item.value), 1);

  const width = 900;
  const height = 280;

  const paddingLeft = 45;
  const paddingRight = 20;
  const paddingTop = 20;
  const paddingBottom = 45;

  const chartWidth = width - paddingLeft - paddingRight;

  const chartHeight = height - paddingTop - paddingBottom;

  const points = chartData.map((item, index) => {
    const x =
      chartData.length === 1
        ? paddingLeft + chartWidth / 2
        : paddingLeft + (index / (chartData.length - 1)) * chartWidth;

    const y = paddingTop + chartHeight - (item.value / maxValue) * chartHeight;

    return {
      ...item,
      x,
      y,
    };
  });

  const linePoints = points.map((point) => `${point.x},${point.y}`).join(" ");

  const areaPoints =
    points.length > 0
      ? [
          `${points[0].x},${paddingTop + chartHeight}`,
          ...points.map((point) => `${point.x},${point.y}`),
          `${points[points.length - 1].x},${paddingTop + chartHeight}`,
        ].join(" ")
      : "";

  function formatDate(dateString) {
    const date = new Date(`${dateString}T00:00:00`);

    return date.toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
    });
  }

  const labelStep = chartData.length <= 7 ? 1 : Math.ceil(chartData.length / 7);

  return (
    <section className="analytics-section analytics-trend-section">
      <div className="analytics-section-header">
        <div>
          <h2>Activity Trends</h2>

          <p>Track customer activity over time.</p>
        </div>

        <TrendingUp size={21} />
      </div>

      <div className="analytics-chart-tabs">
        {metrics.map((metric) => (
          <button
            key={metric.key}
            type="button"
            className={activeMetric === metric.key ? "active" : ""}
            onClick={() => setActiveMetric(metric.key)}
          >
            {metric.label}
          </button>
        ))}
      </div>

      {chartData.length > 0 ? (
        <div className="analytics-chart-wrapper">
          <svg
            viewBox={`0 0 ${width} ${height}`}
            className="analytics-chart"
            preserveAspectRatio="none"
          >
            {/* Horizontal grid lines */}
            {[0, 1, 2, 3, 4].map((line) => {
              const y = paddingTop + (chartHeight / 4) * line;

              const value = Math.round(maxValue - (maxValue / 4) * line);

              return (
                <g key={line}>
                  <line
                    x1={paddingLeft}
                    y1={y}
                    x2={width - paddingRight}
                    y2={y}
                    className="analytics-chart-grid"
                  />

                  <text
                    x={paddingLeft - 8}
                    y={y + 4}
                    textAnchor="end"
                    className="analytics-chart-label"
                  >
                    {value}
                  </text>
                </g>
              );
            })}

            {/* Area */}
            {points.length > 1 && (
              <polygon points={areaPoints} className="analytics-chart-area" />
            )}

            {/* Line */}
            {points.length > 1 && (
              <polyline
                points={linePoints}
                fill="none"
                className="analytics-chart-line"
              />
            )}

            {/* Points */}
            {points.map((point) => (
              <g key={point.date}>
                <circle
                  cx={point.x}
                  cy={point.y}
                  r="4"
                  className="analytics-chart-point"
                />

                <title>
                  {formatDate(point.date)}: {point.value}
                </title>
              </g>
            ))}

            {/* X-axis labels */}
            {points.map((point, index) => {
              if (index % labelStep !== 0 && index !== points.length - 1) {
                return null;
              }

              return (
                <text
                  key={`label-${point.date}`}
                  x={point.x}
                  y={height - 12}
                  textAnchor="middle"
                  className="analytics-chart-label"
                >
                  {formatDate(point.date)}
                </text>
              );
            })}
          </svg>

          <div className="analytics-chart-summary">
            <span>
              {metrics.find((metric) => metric.key === activeMetric)?.label}
            </span>

            <strong>
              {formatNumber(
                chartData.reduce((total, item) => total + item.value, 0),
              )}
            </strong>

            <small>Total during selected period</small>
          </div>
        </div>
      ) : (
        <div className="analytics-empty">
          <TrendingUp size={28} />

          <h3>No trend data yet</h3>

          <p>
            Activity trends will appear once customers start using your menu.
          </p>
        </div>
      )}
    </section>
  );
}

function Analytics() {
  const [analytics, setAnalytics] = useState(null);

  const [days, setDays] = useState(7);

  const [branches, setBranches] = useState([]);

  const [branchId, setBranchId] = useState(
    localStorage.getItem("selected_branch_id") || "",
  );

  const [branchesLoading, setBranchesLoading] = useState(true);

  const [loading, setLoading] = useState(true);

  const [refreshing, setRefreshing] = useState(false);

  const [error, setError] = useState("");

  async function loadBranches() {
    try {
      setBranchesLoading(true);

      const restaurantId = localStorage.getItem("selected_restaurant_id");

      if (!restaurantId) {
        setError("No restaurant selected.");
        setBranches([]);
        setBranchId("");
        return;
      }

      const data = await getBranches(restaurantId);

      const activeBranches = data.filter(
        (branch) => branch.is_active !== false,
      );

      setBranches(activeBranches);

      if (!activeBranches.length) {
        setBranchId("");

        localStorage.removeItem("selected_branch_id");

        return;
      }

      const savedBranchId = localStorage.getItem("selected_branch_id");

      const savedBranchExists = activeBranches.some(
        (branch) => String(branch.id) === String(savedBranchId),
      );

      if (savedBranchExists) {
        setBranchId(String(savedBranchId));
      } else {
        const firstBranch = activeBranches[0];

        setBranchId(String(firstBranch.id));

        localStorage.setItem("selected_branch_id", String(firstBranch.id));

        if (firstBranch.restaurant_id) {
          localStorage.setItem(
            "selected_restaurant_id",
            String(firstBranch.restaurant_id),
          );
        }
      }
    } catch (err) {
      console.error("Failed to load branches:", err);

      setError(err.response?.data?.detail || "Failed to load branches.");
    } finally {
      setBranchesLoading(false);
    }
  }

  async function loadAnalytics(selectedDays = days, showRefresh = false) {
    if (!branchId) {
      setAnalytics(null);
      setLoading(false);
      return;
    }

    try {
      if (showRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      setError("");

      const data = await getBranchAnalytics(branchId, selectedDays);

      setAnalytics(data);
    } catch (err) {
      console.error("Analytics error:", err);

      setError(err.response?.data?.detail || "Failed to load analytics.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    loadBranches();
  }, []);

  useEffect(() => {
    if (!branchesLoading && branchId) {
      loadAnalytics(days);
    }
  }, [branchId, days, branchesLoading]);

  function handleBranchChange(event) {
    const newBranchId = event.target.value;

    setBranchId(newBranchId);

    localStorage.setItem("selected_branch_id", newBranchId);

    const selectedBranch = branches.find(
      (branch) => String(branch.id) === String(newBranchId),
    );

    if (selectedBranch?.restaurant_id) {
      localStorage.setItem(
        "selected_restaurant_id",
        String(selectedBranch.restaurant_id),
      );
    }
  }

  function handleDaysChange(value) {
    setDays(value);
  }

  const selectedBranch = branches.find(
    (branch) => String(branch.id) === String(branchId),
  );

  function getProgressWidth(views) {
    if (!analytics?.popular_dishes?.length) {
      return 0;
    }

    const maxViews = Math.max(
      ...analytics.popular_dishes.map((dish) => dish.views),
    );

    if (!maxViews) return 0;

    return Math.max(5, Math.round((views / maxViews) * 100));
  }

  if (loading) {
    return (
      <div className="analytics-page">
        <div className="analytics-loading">
          <RefreshCw size={24} className="analytics-spin" />

          <p>Loading analytics...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="analytics-page">
        <div className="analytics-header">
          <div>
            <h1>Analytics</h1>

            <p>Understand how customers interact with your menu.</p>
          </div>

          <div className="analytics-header-actions">
            <div className="analytics-branch-selector">
              <GitBranch size={17} />

              <select
                value={branchId}
                onChange={handleBranchChange}
                disabled={branchesLoading || !branches.length}
              >
                {!branches.length ? (
                  <option value="">No branches</option>
                ) : (
                  branches.map((branch) => (
                    <option key={branch.id} value={branch.id}>
                      {branch.name}
                    </option>
                  ))
                )}
              </select>
            </div>

            <button
              type="button"
              onClick={() => loadAnalytics(days)}
              className="analytics-retry-btn"
            >
              Try Again
            </button>
          </div>
        </div>

        {selectedBranch && (
          <div className="analytics-selected-branch">
            <GitBranch size={16} />

            <span>
              Viewing analytics for <strong>{selectedBranch.name}</strong>
            </span>
          </div>
        )}

        <div className="analytics-error">
          <Activity size={22} />

          <div>
            <strong>Unable to load analytics</strong>

            <p>{error}</p>
          </div>
        </div>
      </div>
    );
  }

  const summary = analytics?.summary || {};

  const averageRating =
    summary.average_rating !== null && summary.average_rating !== undefined
      ? `${Number(summary.average_rating).toFixed(1)} / 5`
      : "No ratings";

  return (
    <div className="analytics-page">
      {/* Header */}
      <div className="analytics-header">
        <div>
          <h1>Analytics</h1>

          <p>Understand how customers interact with your digital menu.</p>
        </div>

        <div className="analytics-header-actions">
          {/* Branch Selector */}
          <div className="analytics-branch-selector">
            <GitBranch size={17} />

            <select
              value={branchId}
              onChange={handleBranchChange}
              disabled={branchesLoading || !branches.length}
            >
              {!branches.length ? (
                <option value="">No branches</option>
              ) : (
                branches.map((branch) => (
                  <option key={branch.id} value={branch.id}>
                    {branch.name}
                  </option>
                ))
              )}
            </select>
          </div>

          {/* Refresh */}
          <button
            type="button"
            className="analytics-refresh-btn"
            onClick={() => loadAnalytics(days, true)}
            disabled={refreshing || !branchId}
          >
            <RefreshCw
              size={17}
              className={refreshing ? "analytics-spin" : ""}
            />

            {refreshing ? "Refreshing..." : "Refresh"}
          </button>
        </div>
      </div>

      {/* Selected Branch */}
      {selectedBranch && (
        <div className="analytics-selected-branch">
          <GitBranch size={16} />

          <span>
            Viewing analytics for <strong>{selectedBranch.name}</strong>
          </span>
        </div>
      )}

      {/* Main Stats */}
      <div className="analytics-stats-grid">
        <StatCard
          icon={<Eye size={20} />}
          label="Menu Views"
          value={formatNumber(summary.menu_views)}
        />

        <StatCard
          icon={<QrCode size={20} />}
          label="QR Scans"
          value={formatNumber(summary.qr_scans)}
        />

        <StatCard
          icon={<Utensils size={20} />}
          label="Dish Views"
          value={formatNumber(summary.dish_views)}
        />

        <StatCard
          icon={<Users size={20} />}
          label="Unique Visitors"
          value={formatNumber(summary.unique_visitors)}
        />

        <StatCard
          icon={<Search size={20} />}
          label="Searches"
          value={formatNumber(summary.searches)}
        />

        <StatCard
          icon={<Bot size={20} />}
          label="AI Questions"
          value={formatNumber(summary.ai_questions)}
        />

        <StatCard
          icon={<MessageSquare size={20} />}
          label="Reviews"
          value={formatNumber(summary.reviews_submitted)}
        />

        <StatCard
          icon={<Star size={20} />}
          label="Average Rating"
          value={averageRating}
        />
      </div>

      {/* Activity Period */}
      <section className="analytics-period-section">
        <div>
          <h2>Activity Period</h2>

          <p>Choose the period for your analytics.</p>
        </div>

        <div className="analytics-period-buttons">
          {[7, 30, 90].map((period) => (
            <button
              key={period}
              type="button"
              className={days === period ? "active" : ""}
              onClick={() => handleDaysChange(period)}
            >
              {period} Days
            </button>
          ))}
        </div>
      </section>

      {/* Activity Trends */}
      <ActivityChart trends={analytics?.trends || []} />

      {/* Total Activity */}
      <div className="analytics-overview-card">
        <div className="analytics-overview-icon">
          <Activity size={22} />
        </div>

        <div>
          <span>Total Customer Activity</span>

          <strong>{formatNumber(summary.total_events)}</strong>

          <p>Total tracked interactions across your digital menu.</p>
        </div>
      </div>

      {/* Popular Dishes */}
      <section className="analytics-section">
        <div className="analytics-section-header">
          <div>
            <h2>Popular Dishes</h2>

            <p>Dishes customers are viewing most often.</p>
          </div>

          <TrendingUp size={21} />
        </div>

        {analytics?.popular_dishes?.length > 0 ? (
          <div className="analytics-popular-table-wrapper">
            <table className="analytics-popular-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Dish</th>
                  <th>Views</th>
                  <th>Popularity</th>
                </tr>
              </thead>

              <tbody>
                {analytics.popular_dishes.map((dish, index) => (
                  <tr key={dish.dish_id}>
                    <td>
                      <span className="analytics-rank">{index + 1}</span>
                    </td>

                    <td>
                      <strong>{dish.dish_name}</strong>
                    </td>

                    <td>{formatNumber(dish.views)}</td>

                    <td>
                      <div className="analytics-progress-wrapper">
                        <div className="analytics-progress">
                          <div
                            className="analytics-progress-bar"
                            style={{
                              width: `${getProgressWidth(dish.views)}%`,
                            }}
                          />
                        </div>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="analytics-empty">
            <Utensils size={28} />

            <h3>No dish activity yet</h3>

            <p>
              Dish views will appear here once customers start exploring your
              menu.
            </p>
          </div>
        )}
      </section>

      {/* Customer Engagement */}
      <section className="analytics-section">
        <div className="analytics-section-header">
          <div>
            <h2>Customer Engagement</h2>

            <p>Key signals showing how customers use your menu.</p>
          </div>

          <Activity size={21} />
        </div>

        <div className="analytics-engagement-grid">
          <EngagementItem
            icon={<Users size={20} />}
            label="Unique Visitors"
            value={formatNumber(summary.unique_visitors)}
          />

          <EngagementItem
            icon={<Eye size={20} />}
            label="Menu Views"
            value={formatNumber(summary.menu_views)}
          />

          <EngagementItem
            icon={<QrCode size={20} />}
            label="QR Scans"
            value={formatNumber(summary.qr_scans)}
          />

          <EngagementItem
            icon={<Search size={20} />}
            label="Searches"
            value={formatNumber(summary.searches)}
          />

          <EngagementItem
            icon={<Bot size={20} />}
            label="AI Questions"
            value={formatNumber(summary.ai_questions)}
          />

          <EngagementItem
            icon={<MessageSquare size={20} />}
            label="Reviews"
            value={formatNumber(summary.reviews_submitted)}
          />

          <EngagementItem
            icon={<Star size={20} />}
            label="Average Rating"
            value={averageRating}
          />
        </div>
      </section>

      {/* Rating Distribution */}
      <section className="analytics-section">
        <div className="analytics-section-header">
          <div>
            <h2>Rating Distribution</h2>

            <p>See how customers are rating your dishes.</p>
          </div>

          <Star size={21} />
        </div>

        <div className="analytics-rating-distribution">
          {analytics?.rating_distribution?.map((item) => {
            const totalReviews = summary.reviews_submitted || 0;

            const percentage =
              totalReviews > 0
                ? Math.round((item.count / totalReviews) * 100)
                : 0;

            return (
              <div key={item.rating} className="analytics-rating-row">
                <div className="analytics-rating-label">
                  <span>{item.rating}</span>

                  <Star size={14} fill="currentColor" />
                </div>

                <div className="analytics-rating-bar">
                  <div
                    className="analytics-rating-fill"
                    style={{
                      width: `${percentage}%`,
                    }}
                  />
                </div>

                <span className="analytics-rating-count">{item.count}</span>
              </div>
            );
          })}
        </div>
      </section>

      {/* Recent Reviews */}
      <section className="analytics-section">
        <div className="analytics-section-header">
          <div>
            <h2>Recent Reviews</h2>

            <p>Latest customer feedback during the selected period.</p>
          </div>

          <MessageSquare size={21} />
        </div>

        {analytics?.recent_reviews?.length > 0 ? (
          <div className="analytics-reviews-list">
            {analytics.recent_reviews.map((review) => (
              <div key={review.id} className="analytics-review-card">
                <div className="analytics-review-header">
                  <div>
                    <strong>{review.dish_name}</strong>

                    <span className="analytics-review-customer">
                      {review.customer_name || "Anonymous customer"}
                    </span>
                  </div>

                  <div className="analytics-review-rating">
                    {Array.from({ length: 5 }, (_, index) => (
                      <Star
                        key={index}
                        size={15}
                        fill={index < review.rating ? "currentColor" : "none"}
                      />
                    ))}
                  </div>
                </div>

                {review.comment && (
                  <p className="analytics-review-comment">"{review.comment}"</p>
                )}

                <span className="analytics-review-date">
                  {new Date(review.created_at).toLocaleDateString("en-IN", {
                    day: "2-digit",
                    month: "short",
                    year: "numeric",
                  })}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div className="analytics-empty">
            <MessageSquare size={28} />

            <h3>No reviews yet</h3>

            <p>
              Customer reviews will appear here once customers start reviewing
              dishes.
            </p>
          </div>
        )}
      </section>
    </div>
  );
}

export default Analytics;
