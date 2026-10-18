import { useState } from "react";
import { Star } from "lucide-react";
import { submitReview } from "../api/reviews";

import { useAnalytics } from "../hooks/useAnalytics";

function ReviewForm({
  dishId,
  branchId = null,
  tableId = null,
  qrToken = null,
  onSubmitted,
}) {
  const [rating, setRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [customerName, setCustomerName] = useState("");
  const [comment, setComment] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState("");
  const [error, setError] = useState("");

  const { track } = useAnalytics(branchId, tableId, qrToken);

  async function handleSubmit(event) {
    event.preventDefault();

    setError("");
    setSuccess("");

    if (!rating) {
      setError("Please select a rating.");
      return;
    }

    if (!dishId) {
      setError("Unable to identify this dish.");
      return;
    }

    setSubmitting(true);

    try {
      await submitReview({
        dishId,
        rating,
        customerName: customerName.trim() || null,
        comment: comment.trim() || null,
      });

      // Track successful review submission.
      track({
        eventType: "REVIEW_SUBMITTED",
        dishId,
        metadata: {
          source: "review_form",
          rating,
        },
      });

      setSuccess("Thank you! Your review has been submitted.");

      setRating(0);
      setHoverRating(0);
      setCustomerName("");
      setComment("");

      if (onSubmitted) {
        onSubmitted();
      }
    } catch (err) {
      const statusCode = err.response?.status;

      if (statusCode === 404) {
        setError("This dish could not be found.");
      } else if (statusCode === 400) {
        setError(
          err.response?.data?.detail || "This review cannot be submitted.",
        );
      } else if (err.response?.data?.detail) {
        setError(err.response.data.detail);
      } else {
        setError("Unable to submit your review. Please try again.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="review-form">
      <div className="review-form-title">
        <h3>Rate this dish</h3>
        <span>Share your experience</span>
      </div>

      {/* RATING */}

      <div
        className="review-stars"
        onMouseLeave={() => setHoverRating(0)}
        aria-label="Select rating"
      >
        {[1, 2, 3, 4, 5].map((star) => {
          const active = star <= (hoverRating || rating);

          return (
            <button
              key={star}
              type="button"
              className={active ? "review-star active" : "review-star"}
              onMouseEnter={() => setHoverRating(star)}
              onClick={() => setRating(star)}
              aria-label={`${star} star${star > 1 ? "s" : ""}`}
            >
              <Star size={24} fill={active ? "currentColor" : "none"} />
            </button>
          );
        })}
      </div>

      {/* NAME */}

      <input
        type="text"
        value={customerName}
        onChange={(event) => setCustomerName(event.target.value)}
        placeholder="Your name (optional)"
        maxLength={100}
        disabled={submitting}
        className="review-input"
      />

      {/* COMMENT */}

      <textarea
        value={comment}
        onChange={(event) => setComment(event.target.value)}
        placeholder="Tell us what you think (optional)"
        maxLength={1000}
        rows={4}
        disabled={submitting}
        className="review-textarea"
      />

      {/* ERROR */}

      {error && <div className="review-error">{error}</div>}

      {/* SUCCESS */}

      {success && <div className="review-success">{success}</div>}

      {/* SUBMIT */}

      <button
        type="button"
        className="review-submit"
        onClick={handleSubmit}
        disabled={submitting || !rating}
      >
        {submitting ? "Submitting..." : "Submit Review"}
      </button>
    </div>
  );
}

export default ReviewForm;
