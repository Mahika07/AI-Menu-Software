import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  Save,
  UserRound,
  LockKeyhole,
  Eye,
  EyeOff,
  CheckCircle2,
} from "lucide-react";

import { getCurrentUser, updateCurrentUser, changePassword } from "../api/auth";

export default function Profile() {
  const navigate = useNavigate();

  const [user, setUser] = useState(null);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);

  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [passwordMessage, setPasswordMessage] = useState("");

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

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
          if (err.response?.status === 401) {
            localStorage.removeItem("access_token");
            navigate("/login", { replace: true });
            return;
          }

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
  }, [navigate]);

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

  async function handlePasswordSubmit(event) {
    event.preventDefault();
    setPasswordError("");
    setPasswordMessage("");

    if (!currentPassword || !newPassword || !confirmPassword) {
      setPasswordError("Please complete all password fields.");
      return;
    }

    if (newPassword.length < 8) {
      setPasswordError("Your new password must contain at least 8 characters.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setPasswordError("The new passwords do not match.");
      return;
    }

    if (currentPassword === newPassword) {
      setPasswordError(
        "Your new password must differ from your current password.",
      );
      return;
    }

    try {
      setChangingPassword(true);

      await changePassword({
        current_password: currentPassword,
        new_password: newPassword,
      });

      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setPasswordMessage("Your password has been updated successfully.");
    } catch (err) {
      if (err.response?.status === 401) {
        setPasswordError(
          "Your current password may be incorrect, or your session has expired.",
        );
      } else {
        setPasswordError(
          err.response?.data?.detail ||
            "Unable to update your password. Please try again.",
        );
      }
    } finally {
      setChangingPassword(false);
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

      {error && (
        <div className="dx-error" role="alert" style={{ marginBottom: 20 }}>
          {error}
        </div>
      )}

      {/* Personal information */}
      <section className="dx-card profile-section">
        <div className="profile-section-heading">
          <div className="profile-section-icon">
            <UserRound size={23} />
          </div>

          <div>
            <h2>Personal information</h2>
            <p>Manage your restaurant-owner account details.</p>
          </div>
        </div>

        {message && (
          <div className="profile-success" role="status">
            <CheckCircle2 size={18} />
            {message}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="profile-field">
            <label htmlFor="profile-name">Full name</label>
            <input
              id="profile-name"
              value={fullName}
              onChange={(event) => setFullName(event.target.value)}
              required
              maxLength={120}
              autoComplete="name"
            />
          </div>

          <div className="profile-field">
            <label htmlFor="profile-email">Email address</label>
            <input
              id="profile-email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
              maxLength={254}
              autoComplete="email"
            />
          </div>

          <div className="profile-actions">
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

      {/* Update password */}
      <section className="dx-card profile-section">
        <div className="profile-section-heading">
          <div className="profile-section-icon profile-lock-icon">
            <LockKeyhole size={23} />
          </div>

          <div>
            <h2>Update password</h2>
            <p>Change your password to help keep your account secure.</p>
          </div>
        </div>

        {passwordError && (
          <div className="dx-error" role="alert">
            {passwordError}
          </div>
        )}

        {passwordMessage && (
          <div className="profile-success" role="status">
            <CheckCircle2 size={18} />
            {passwordMessage}
          </div>
        )}

        <form onSubmit={handlePasswordSubmit}>
          <PasswordField
            id="current-password"
            label="Current password"
            value={currentPassword}
            onChange={setCurrentPassword}
            visible={showCurrentPassword}
            onToggle={() => setShowCurrentPassword((value) => !value)}
            autoComplete="current-password"
          />

          <PasswordField
            id="new-password"
            label="New password"
            value={newPassword}
            onChange={setNewPassword}
            visible={showNewPassword}
            onToggle={() => setShowNewPassword((value) => !value)}
            autoComplete="new-password"
            minLength={8}
          />

          <PasswordField
            id="confirm-password"
            label="Confirm new password"
            value={confirmPassword}
            onChange={setConfirmPassword}
            visible={showConfirmPassword}
            onToggle={() => setShowConfirmPassword((value) => !value)}
            autoComplete="new-password"
            minLength={8}
          />

          <p className="profile-password-hint">
            Use at least 8 characters. Choose a password you do not use for
            other accounts.
          </p>

          <div className="profile-actions">
            <button
              type="button"
              className="dx-icon-btn"
              onClick={() => {
                setCurrentPassword("");
                setNewPassword("");
                setConfirmPassword("");
                setPasswordError("");
                setPasswordMessage("");
              }}
            >
              Clear
            </button>

            <button
              type="submit"
              className="dx-banner-btn"
              disabled={changingPassword}
            >
              <LockKeyhole size={17} />
              {changingPassword ? "Updating..." : "Update password"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

function PasswordField({
  id,
  label,
  value,
  onChange,
  visible,
  onToggle,
  autoComplete,
  minLength,
}) {
  return (
    <div className="profile-field">
      <label htmlFor={id}>{label}</label>

      <div className="profile-password-input">
        <input
          id={id}
          type={visible ? "text" : "password"}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          required
          minLength={minLength}
          autoComplete={autoComplete}
        />

        <button
          type="button"
          onClick={onToggle}
          aria-label={visible ? "Hide password" : "Show password"}
          title={visible ? "Hide password" : "Show password"}
        >
          {visible ? <EyeOff size={19} /> : <Eye size={19} />}
        </button>
      </div>
    </div>
  );
}
