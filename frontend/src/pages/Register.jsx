import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { UserPlus, LoaderCircle } from "lucide-react";
import axios from "axios";
import { API_BASE_URL } from "../api/config";

export default function Register() {
  const navigate = useNavigate();

  const [formData, setFormData] = useState({
    full_name: "",
    email: "",
    password: "",
    confirm_password: "",
  });

  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  function handleChange(event) {
    setFormData({
      ...formData,
      [event.target.name]: event.target.value,
    });
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");

    const fullName = formData.full_name.trim();
    const email = formData.email.trim().toLowerCase();

    if (!email) {
      setError("Please enter your email.");
      return;
    }

    if (formData.password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }

    if (formData.password !== formData.confirm_password) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);

    try {
      await axios.post(`${API_BASE_URL}/auth/register`, {
        full_name: fullName || null,
        email,
        password: formData.password,
      });

      navigate("/login", {
        replace: true,
        state: {
          message: "Account created successfully. Please log in.",
          email,
        },
      });
    } catch (err) {
      console.error("Registration failed:", err);

      const detail = err.response?.data?.detail;

      if (err.response?.status === 409) {
        setError("An account with this email already exists. Please log in.");
      } else if (Array.isArray(detail)) {
        setError(
          detail
            .map((item) => item.msg)
            .filter(Boolean)
            .join(", ") || "Please check your details.",
        );
      } else {
        setError(detail || "Could not create your account. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-header">
          <div className="auth-icon">
            <UserPlus size={28} />
          </div>

          <h1>Create your account</h1>
          <p>Start managing your restaurant with Smart Menu.</p>
        </div>

        {error && <div className="auth-error">{error}</div>}

        <form onSubmit={handleSubmit} className="auth-form">
          <div className="form-group">
            <label htmlFor="full_name">Full Name</label>

            <input
              id="full_name"
              name="full_name"
              type="text"
              placeholder="Your name"
              value={formData.full_name}
              onChange={handleChange}
              maxLength={100}
              autoComplete="name"
            />
          </div>

          <div className="form-group">
            <label htmlFor="email">Email</label>

            <input
              id="email"
              name="email"
              type="email"
              placeholder="you@example.com"
              value={formData.email}
              onChange={handleChange}
              autoComplete="email"
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="password">Password</label>

            <input
              id="password"
              name="password"
              type="password"
              placeholder="At least 8 characters"
              value={formData.password}
              onChange={handleChange}
              minLength={8}
              maxLength={128}
              autoComplete="new-password"
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="confirm_password">Confirm Password</label>

            <input
              id="confirm_password"
              name="confirm_password"
              type="password"
              placeholder="Enter password again"
              value={formData.confirm_password}
              onChange={handleChange}
              minLength={8}
              maxLength={128}
              autoComplete="new-password"
              required
            />
          </div>

          <button type="submit" className="auth-submit" disabled={loading}>
            {loading ? (
              <>
                <LoaderCircle size={18} className="auth-spinner" />
                Creating account...
              </>
            ) : (
              <>
                <UserPlus size={18} />
                Create Account
              </>
            )}
          </button>
        </form>

        <div className="auth-footer">
          <span>Already have an account?</span>
          <Link to="/login">Log in</Link>
        </div>
      </div>
    </div>
  );
}
