import { useState } from "react";
import { Link } from "react-router-dom";
import { KeyRound } from "lucide-react";
import { requestPasswordReset } from "../api/auth";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    setLoading(true);
    try {
      await requestPasswordReset(email.trim().toLowerCase());
      setSent(true);
    } catch {
      setError("We could not process your request right now. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-page">
      <form className="auth-card" onSubmit={handleSubmit}>
        <div className="auth-icon">
          <KeyRound size={26} />
        </div>

        <h1>Forgot password?</h1>
        <p className="auth-subtitle">Enter your account email and we’ll send a reset link.</p>
        {error && <div className="error-message" role="alert">{error}</div>}
        {sent ? (
          <div className="success-message" role="status">If an account exists for that email, a password reset link has been sent. Check your inbox.</div>
        ) : (
          <>
            <label htmlFor="reset-email">Email</label>
            <input id="reset-email" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" required />
            <button type="submit" disabled={loading}>{loading ? "Sending..." : "Send reset link"}</button>
          </>
        )}
        <div className="auth-footer"><Link to="/login">Back to sign in</Link></div>
      </form>
    </div>
  );
}
