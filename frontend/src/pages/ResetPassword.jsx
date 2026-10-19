import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { resetPassword } from "../api/auth";

export default function ResetPassword() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get("token") || "";
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    if (!token) { setError("This reset link is missing its token. Request a new link."); return; }
    if (password !== confirmation) { setError("Your passwords do not match."); return; }
    setLoading(true);
    try {
      await resetPassword(token, password);
      navigate("/login", { replace: true, state: { message: "Your password has been reset. You can now sign in." } });
    } catch (err) {
      setError(err.response?.data?.detail || "This reset link is invalid or has expired. Request a new one.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-page">
      <form className="auth-card" onSubmit={handleSubmit}>
        <h1>Set a new password</h1>
        <p className="auth-subtitle">Choose a new password for your Smart Menu account.</p>
        {error && <div className="error-message" role="alert">{error}</div>}
        <label htmlFor="new-password">New password</label>
        <input id="new-password" type="password" autoComplete="new-password" minLength={8} maxLength={128} value={password} onChange={(event) => setPassword(event.target.value)} required />
        <label htmlFor="confirm-password">Confirm password</label>
        <input id="confirm-password" type="password" autoComplete="new-password" minLength={8} maxLength={128} value={confirmation} onChange={(event) => setConfirmation(event.target.value)} required />
        <button type="submit" disabled={loading}>{loading ? "Updating..." : "Reset password"}</button>
        <div className="auth-footer"><Link to="/forgot-password">Request another link</Link></div>
      </form>
    </div>
  );
}
