import { useEffect, useMemo, useState } from "react";
import { MessageSquare, Star, RefreshCw, GitBranch } from "lucide-react";

import { getOwnerReviews } from "../api/ownerReviews";
import { useBranchSelection } from "../context/BranchSelectionContext";

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
  // Read the globally selected branch.
  const {
    selectedBranch,
    selectedBranchId,
    loading: loadingSelection,
  } = useBranchSelection();

  const branchId = selectedBranchId;

  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  // Load reviews for the globally selected branch.
  useEffect(() => {
    if (loadingSelection) return;

    if (!branchId) {
      setReviews([]);
      setLoading(false);
      setRefreshing(false);
      setError("");
      return;
    }

    let cancelled = false;

    async function loadReviews() {
      try {
        setLoading(true);
        setError("");

        // Clear old branch reviews while the new branch loads.
        setReviews([]);

        const data = await getOwnerReviews(branchId);

        if (!cancelled) {
          setReviews(Array.isArray(data) ? data : []);
        }
      } catch (err) {
        console.error("Failed to load reviews:", err);

        if (!cancelled) {
          setReviews([]);
          setError(err.response?.data?.detail || "Failed to load reviews.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadReviews();

    return () => {
      cancelled = true;
    };
  }, [branchId, loadingSelection]);

  // Manual refresh.
  async function handleRefresh() {
    if (!branchId || refreshing) return;

    try {
      setRefreshing(true);
      setError("");

      const data = await getOwnerReviews(branchId);

      // Prevent showing results for a branch that has since changed.
      if (String(branchId) === String(selectedBranchId)) {
        setReviews(Array.isArray(data) ? data : []);
      }
    } catch (err) {
      console.error("Failed to refresh reviews:", err);

      setError(err.response?.data?.detail || "Failed to refresh reviews.");
    } finally {
      setRefreshing(false);
    }
  }

  // Average rating.
  const averageRating = useMemo(() => {
    if (!reviews.length) return 0;

    const total = reviews.reduce(
      (sum, review) => sum + Number(review.rating || 0),
      0,
    );

    return (total / reviews.length).toFixed(1);
  }, [reviews]);

  // Rating distribution.
  const ratingDistribution = useMemo(() => {
    return [5, 4, 3, 2, 1].map((rating) => ({
      rating,
      count: reviews.filter((review) => Number(review.rating) === rating)
        .length,
    }));
  }, [reviews]);

  // Initial loading.
  if (loadingSelection || loading) {
    return (
      <div className="owner-reviews-page">
        <div className="owner-reviews-loading">
          {loadingSelection
            ? "Loading restaurant and branch..."
            : "Loading reviews..."}
        </div>
      </div>
    );
  }

  // No selected branch.
  if (!branchId) {
    return (
      <div className="owner-reviews-page">
        <div className="owner-reviews-empty">
          <GitBranch size={32} />

          <h3>No branch selected</h3>

          <p>
            Select a restaurant and branch from the dashboard header to view
            customer reviews.
          </p>
        </div>
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
          <button
            type="button"
            className="owner-reviews-refresh"
            onClick={handleRefresh}
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

      {/* Selected Branch Information */}
      {selectedBranch && (
        <div className="owner-selected-branch">
          <GitBranch size={16} />

          <span>
            Viewing reviews for <strong>{selectedBranch.name}</strong>
          </span>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="owner-reviews-error" role="alert">
          {error}
        </div>
      )}

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

      {/* All Reviews */}
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
