import { useEffect, useMemo, useState } from "react";
import { MessageSquare, Star, RefreshCw, GitBranch } from "lucide-react";

import { getOwnerReviews } from "../api/ownerReviews";
import { getBranches } from "../api/branches";

function formatDate(value) {
  if (!value) return "";

  return new Date(value).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function RatingStars({ rating }) {
  return (
    <div className="owner-review-stars">
      {Array.from({ length: 5 }, (_, index) => (
        <Star
          key={index}
          size={15}
          fill={index < rating ? "currentColor" : "none"}
        />
      ))}
    </div>
  );
}

export default function Reviews() {
  const [branches, setBranches] = useState([]);
  const [branchId, setBranchId] = useState(
    localStorage.getItem("selected_branch_id") || "",
  );

  const [branchesLoading, setBranchesLoading] = useState(true);

  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  async function loadBranches() {
    try {
      setBranchesLoading(true);

      const restaurantId = localStorage.getItem("selected_restaurant_id");

      if (!restaurantId) {
        setError("No restaurant selected.");
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
      }
    } catch (err) {
      console.error("Failed to load branches:", err);

      setError(err.response?.data?.detail || "Failed to load branches.");
    } finally {
      setBranchesLoading(false);
    }
  }

  async function loadReviews(showRefresh = false) {
    if (!branchId) {
      setReviews([]);
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

      const data = await getOwnerReviews(branchId);

      setReviews(data);
    } catch (err) {
      console.error("Failed to load reviews:", err);

      setError(err.response?.data?.detail || "Failed to load reviews.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    loadBranches();
  }, []);

  useEffect(() => {
    if (!branchesLoading) {
      loadReviews();
    }
  }, [branchId, branchesLoading]);

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

  const selectedBranch = branches.find(
    (branch) => String(branch.id) === String(branchId),
  );

  const averageRating = useMemo(() => {
    if (!reviews.length) return 0;

    const total = reviews.reduce((sum, review) => sum + review.rating, 0);

    return (total / reviews.length).toFixed(1);
  }, [reviews]);

  const ratingDistribution = useMemo(() => {
    return [5, 4, 3, 2, 1].map((rating) => ({
      rating,
      count: reviews.filter((review) => review.rating === rating).length,
    }));
  }, [reviews]);

  if (loading && !reviews.length) {
    return (
      <div className="owner-reviews-page">
        <div className="owner-reviews-loading">Loading reviews...</div>
      </div>
    );
  }

  return (
    <div className="owner-reviews-page">
      {/* Header */}
      <div className="owner-reviews-header">
        <div>
          <h1>Customer Reviews</h1>
          <p>See what customers are saying about your dishes.</p>
        </div>

        <div className="owner-reviews-header-actions">
          {/* Branch Selector */}
          <div className="owner-branch-selector">
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
            className="owner-reviews-refresh"
            onClick={() => loadReviews(true)}
            disabled={refreshing || !branchId}
          >
            <RefreshCw
              size={16}
              className={refreshing ? "owner-reviews-spin" : ""}
            />

            {refreshing ? "Refreshing..." : "Refresh"}
          </button>
        </div>
      </div>

      {/* Selected Branch */}
      {selectedBranch && (
        <div className="owner-selected-branch">
          <GitBranch size={16} />

          <span>
            Viewing reviews for <strong>{selectedBranch.name}</strong>
          </span>
        </div>
      )}

      {error && <div className="owner-reviews-error">{error}</div>}

      {/* Summary */}
      <div className="owner-reviews-summary">
        <div className="owner-review-stat">
          <MessageSquare size={20} />

          <div>
            <span>Total Reviews</span>
            <strong>{reviews.length}</strong>
          </div>
        </div>

        <div className="owner-review-stat">
          <Star size={20} fill="currentColor" />

          <div>
            <span>Average Rating</span>
            <strong>{reviews.length ? `${averageRating} / 5` : "—"}</strong>
          </div>
        </div>
      </div>

      {/* Rating Distribution */}
      <section className="owner-reviews-section">
        <div className="owner-reviews-section-header">
          <div>
            <h2>Rating Distribution</h2>
            <p>Overview of customer ratings.</p>
          </div>

          <Star size={20} />
        </div>

        <div className="owner-rating-distribution">
          {ratingDistribution.map((item) => {
            const percentage =
              reviews.length > 0
                ? Math.round((item.count / reviews.length) * 100)
                : 0;

            return (
              <div key={item.rating} className="owner-rating-row">
                <div className="owner-rating-label">
                  <span>{item.rating}</span>
                  <Star size={13} fill="currentColor" />
                </div>

                <div className="owner-rating-bar">
                  <div
                    className="owner-rating-fill"
                    style={{
                      width: `${percentage}%`,
                    }}
                  />
                </div>

                <span className="owner-rating-count">{item.count}</span>
              </div>
            );
          })}
        </div>
      </section>

      {/* Reviews */}
      <section className="owner-reviews-section">
        <div className="owner-reviews-section-header">
          <div>
            <h2>All Reviews</h2>
            <p>Customer feedback for your dishes.</p>
          </div>

          <MessageSquare size={20} />
        </div>

        {reviews.length > 0 ? (
          <div className="owner-reviews-list">
            {reviews.map((review) => (
              <article key={review.id} className="owner-review-card">
                <div className="owner-review-card-top">
                  <div>
                    <h3>{review.dish_name}</h3>

                    <span>{review.customer_name || "Anonymous customer"}</span>
                  </div>

                  <RatingStars rating={review.rating} />
                </div>

                {review.comment && (
                  <p className="owner-review-comment">"{review.comment}"</p>
                )}

                <span className="owner-review-date">
                  {formatDate(review.created_at)}
                </span>
              </article>
            ))}
          </div>
        ) : (
          <div className="owner-reviews-empty">
            <MessageSquare size={32} />

            <h3>No reviews yet</h3>

            <p>
              Customer reviews will appear here once customers review your
              dishes.
            </p>
          </div>
        )}
      </section>
    </div>
  );
}
