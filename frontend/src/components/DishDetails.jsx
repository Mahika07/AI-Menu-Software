import { useEffect, useState } from "react";
import { X, Star, Leaf, Flame, Utensils } from "lucide-react";

import { getReviews, createReview } from "../api/reviews";
import { useAnalytics } from "../hooks/useAnalytics";

function DishDetails({
  dish,
  onClose,
  branchId = null,
  tableId = null,
  qrToken = null,
}) {
  const [reviews, setReviews] = useState([]);
  const [loadingReviews, setLoadingReviews] = useState(true);

  const [rating, setRating] = useState(5);
  const [customerName, setCustomerName] = useState("");
  const [comment, setComment] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const { track } = useAnalytics(branchId, tableId, qrToken);

  useEffect(() => {
    async function loadReviews() {
      try {
        setLoadingReviews(true);
        setError("");

        const data = await getReviews(dish.id);

        setReviews(data);
      } catch (err) {
        setError(err.response?.data?.detail || "Failed to load reviews");
      } finally {
        setLoadingReviews(false);
      }
    }

    if (dish?.id) {
      loadReviews();
    }
  }, [dish?.id]);

  const averageRating =
    reviews.length > 0
      ? (
          reviews.reduce((sum, review) => sum + review.rating, 0) /
          reviews.length
        ).toFixed(1)
      : null;

  async function handleSubmit(event) {
    event.preventDefault();

    if (!comment.trim()) {
      setError("Please enter a review.");
      return;
    }

    try {
      setSubmitting(true);
      setError("");
      setSuccess("");

      const newReview = await createReview(dish.id, {
        rating,
        customer_name: customerName.trim() || null,
        comment: comment.trim(),
      });

      setReviews((previous) => [newReview, ...previous]);

      /*
       * Track only successful review submissions.
       */
      track({
        eventType: "REVIEW_SUBMITTED",
        dishId: dish.id,
        metadata: {
          source: "dish_details",
          rating,
        },
      });

      setCustomerName("");
      setComment("");
      setRating(5);

      setSuccess("Thank you! Your review has been added.");
    } catch (err) {
      setError(err.response?.data?.detail || "Failed to submit review");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="dish-modal-overlay" onClick={onClose}>
      <div className="dish-modal" onClick={(event) => event.stopPropagation()}>
        {/* CLOSE */}

        <button
          className="dish-modal-close"
          onClick={onClose}
          aria-label="Close"
        >
          <X size={22} />
        </button>

        {/* IMAGE */}

        {dish.image_url ? (
          <img
            src={dish.image_url}
            alt={dish.name}
            className="dish-modal-image"
          />
        ) : (
          <div className="dish-modal-image placeholder">
            <Utensils size={45} />
          </div>
        )}

        <div className="dish-modal-content">
          {/* HEADER */}

          <div className="dish-modal-header">
            <div>
              <h2>{dish.name}</h2>

              {dish.description && <p>{dish.description}</p>}
            </div>

            <strong className="dish-modal-price">₹{dish.price}</strong>
          </div>

          {/* TAGS */}

          <div className="dish-tags">
            {dish.dietary_type && (
              <span className="tag dietary-tag">
                <Leaf size={13} />
                {dish.dietary_type}
              </span>
            )}

            {dish.spice_level && (
              <span className="tag spice-tag">
                <Flame size={13} />
                {dish.spice_level}
              </span>
            )}

            {dish.serving_size && (
              <span className="tag">{dish.serving_size}</span>
            )}
          </div>

          {/* INGREDIENTS */}

          {dish.ingredients && (
            <div className="dish-modal-section">
              <h3>Ingredients</h3>
              <p>{dish.ingredients}</p>
            </div>
          )}

          {/* ALLERGENS */}

          {dish.allergens && (
            <div className="dish-modal-allergens">
              <strong>Allergen information</strong>

              <p>{dish.allergens}</p>
            </div>
          )}

          {/* RATING */}

          <div className="dish-rating-summary">
            <div className="rating-number">{averageRating || "—"}</div>

            <div>
              <div className="stars">
                {[1, 2, 3, 4, 5].map((star) => (
                  <Star
                    key={star}
                    size={18}
                    fill={
                      averageRating && star <= Math.round(Number(averageRating))
                        ? "currentColor"
                        : "none"
                    }
                  />
                ))}
              </div>

              <span>
                {reviews.length} {reviews.length === 1 ? "review" : "reviews"}
              </span>
            </div>
          </div>

          {/* REVIEWS */}

          <div className="reviews-section">
            <h3>Customer Reviews</h3>

            {loadingReviews ? (
              <p className="muted">Loading reviews...</p>
            ) : reviews.length === 0 ? (
              <p className="muted">
                No reviews yet. Be the first to review this dish!
              </p>
            ) : (
              <div className="review-list">
                {reviews.map((review) => (
                  <div className="review-card" key={review.id}>
                    <div className="review-header">
                      <strong>{review.customer_name || "Customer"}</strong>

                      <div className="review-stars">
                        {[1, 2, 3, 4, 5].map((star) => (
                          <Star
                            key={star}
                            size={14}
                            fill={
                              star <= review.rating ? "currentColor" : "none"
                            }
                          />
                        ))}
                      </div>
                    </div>

                    {review.comment && <p>{review.comment}</p>}

                    <small>
                      {new Date(review.created_at).toLocaleDateString()}
                    </small>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* WRITE REVIEW */}

          <div className="review-form-section">
            <h3>Rate this dish</h3>

            <form onSubmit={handleSubmit}>
              <div className="rating-selector">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    type="button"
                    key={star}
                    className={
                      star <= rating ? "star-button active" : "star-button"
                    }
                    onClick={() => setRating(star)}
                    aria-label={`Rate ${star} stars`}
                  >
                    <Star
                      size={25}
                      fill={star <= rating ? "currentColor" : "none"}
                    />
                  </button>
                ))}
              </div>

              <input
                type="text"
                value={customerName}
                onChange={(event) => setCustomerName(event.target.value)}
                placeholder="Your name (optional)"
                maxLength={100}
              />

              <textarea
                value={comment}
                onChange={(event) => setComment(event.target.value)}
                placeholder="What did you think about this dish?"
                rows={4}
                maxLength={1000}
                required
              />

              {error && <div className="error-message">{error}</div>}

              {success && <div className="success-message">{success}</div>}

              <button
                type="submit"
                className="primary-button review-submit"
                disabled={submitting}
              >
                {submitting ? "Submitting..." : "Submit Review"}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}

export default DishDetails;
