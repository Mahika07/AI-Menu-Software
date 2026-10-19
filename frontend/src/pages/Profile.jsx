import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Save, UserRound } from "lucide-react";

import { getCurrentUser, updateCurrentUser } from "../api/auth";

export default function Profile() {
  const navigate = useNavigate();

  const [user, setUser] = useState(null);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadProfile() {
      try {
        const data = await getCurrentUser();

        if (!cancelled) {
          setUser(data);
          setFullName(data.full_name || "");
          setEmail(data.email || "");
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err.response?.data?.detail || "Unable to load your profile.",
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadProfile();

    return () => {
      cancelled = true;
    };
  }, []);

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    setMessage("");

    const trimmedName = fullName.trim();
    const trimmedEmail = email.trim().toLowerCase();

    if (!trimmedName || !trimmedEmail) {
      setError("Please enter your name and email address.");
      return;
    }

    try {
      setSaving(true);

      const updatedUser = await updateCurrentUser({
        full_name: trimmedName,
        email: trimmedEmail,
      });

      setUser(updatedUser);
      setFullName(updatedUser.full_name || "");
      setEmail(updatedUser.email || "");
      setMessage("Profile updated successfully.");
    } catch (err) {
      setError(
        err.response?.data?.detail ||
          "Unable to update your profile. Please try again.",
      );
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <div className="dx-page">Loading your profile...</div>;
  }

  return (
    <div className="dx-page">
      <header className="dx-top">
        <div className="dx-greeting">
          <small>Account settings</small>
          <h1>My Profile</h1>
        </div>

        <button
          type="button"
          className="dx-icon-btn"
          onClick={() => navigate("/dashboard")}
          aria-label="Back to dashboard"
        >
          <ArrowLeft size={18} />
        </button>
      </header>

      <section className="dx-card" style={{ maxWidth: 720, padding: 28 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div className="dx-avatar">
            {(fullName || email || "U").charAt(0).toUpperCase()}
          </div>

          <div>
            <h2 style={{ margin: 0 }}>Personal information</h2>
            <p style={{ margin: "6px 0 0", color: "#64748b" }}>
              Manage your restaurant-owner account details.
            </p>
          </div>
        </div>

        {error && (
          <div className="dx-error" role="alert" style={{ marginTop: 20 }}>
            {error}
          </div>
        )}

        {message && (
          <p role="status" style={{ color: "#15803d" }}>
            {message}
          </p>
        )}

        <form onSubmit={handleSubmit} style={{ marginTop: 28 }}>
          <label htmlFor="profile-name">Full name</label>
          <input
            id="profile-name"
            value={fullName}
            onChange={(event) => setFullName(event.target.value)}
            required
            maxLength={120}
            autoComplete="name"
            style={inputStyle}
          />

          <label htmlFor="profile-email" style={labelStyle}>
            Email address
          </label>
          <input
            id="profile-email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
            maxLength={254}
            autoComplete="email"
            style={inputStyle}
          />

          <div style={{ display: "flex", gap: 12, marginTop: 24 }}>
            <button
              type="button"
              className="dx-icon-btn"
              onClick={() => navigate("/dashboard")}
            >
              Cancel
            </button>

            <button
              type="submit"
              className="dx-banner-btn"
              disabled={saving || !user}
            >
              <Save size={17} />
              {saving ? "Saving..." : "Save changes"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

const labelStyle = {
  display: "block",
  marginTop: 20,
  marginBottom: 8,
  fontWeight: 600,
};

const inputStyle = {
  display: "block",
  boxSizing: "border-box",
  width: "100%",
  padding: "13px 14px",
  border: "1px solid #d7e0e8",
  borderRadius: 10,
  font: "inherit",
  background: "#fff",
};
