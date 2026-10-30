import { useEffect, useState, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  GitBranch,
  Plus,
  Edit3,
  Trash2,
  MapPin,
  Phone,
  ArrowLeft,
  Utensils,
  X,
  Power,
  BarChart3,
  MessageSquare,
} from "lucide-react";

import {
  getBranches,
  createBranch,
  updateBranch,
  deleteBranch,
} from "../api/branches";

import { useBranchSelection } from "../context/BranchSelectionContext";

function getErrorMessage(err, fallback = "Something went wrong.") {
  const detail = err?.response?.data?.detail;

  if (typeof detail === "string") return detail;

  if (Array.isArray(detail)) {
    return detail
      .map((item) => {
        if (typeof item === "string") return item;

        if (item && typeof item.msg === "string") {
          const location = Array.isArray(item.loc)
            ? item.loc.filter((part) => part !== "body").join(" → ")
            : "";

          return location ? `${location}: ${item.msg}` : item.msg;
        }

        return "Invalid input.";
      })
      .join(". ");
  }

  if (detail && typeof detail === "object") {
    return typeof detail.msg === "string" ? detail.msg : fallback;
  }

  return err?.message || fallback;
}

function Branches() {
  const navigate = useNavigate();
  const { restaurantId } = useParams();

  const {
    selectedBranchId,
    selectedRestaurantId,
    selectBranch: setGlobalBranch,
  } = useBranchSelection();

  const [branches, setBranches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState({});
  const [submitted, setSubmitted] = useState(false);

  const [showForm, setShowForm] = useState(false);
  const [editingBranch, setEditingBranch] = useState(null);

  const [form, setForm] = useState({
    name: "",
    address: "",
    phone: "",
  });

  const handleApiError = useCallback(
    (err, fallback) => {
      console.error(err);

      if (err.response?.status === 401) {
        localStorage.removeItem("access_token");
        navigate("/login");
        return;
      }

      setError(getErrorMessage(err, fallback));
    },
    [navigate],
  );

  // Always update the shared global selection.
  function selectThisBranch(branch) {
    if (!branch?.id || !branch.is_active) return;

    setGlobalBranch(branch, restaurantId);
  }

  // Keep the selected branch valid for this restaurant.
  function syncSelectedBranch(branchList) {
    const activeBranches = branchList.filter((branch) => branch.is_active);

    if (activeBranches.length === 0) {
      if (String(selectedRestaurantId) === String(restaurantId)) {
        setGlobalBranch(null, restaurantId);
      }
      return;
    }

    const currentSelectedBranch = activeBranches.find(
      (branch) => String(branch.id) === String(selectedBranchId),
    );

    if (currentSelectedBranch) {
      return;
    }

    // Do not override a valid selection belonging to another restaurant.
    if (
      selectedRestaurantId &&
      String(selectedRestaurantId) !== String(restaurantId)
    ) {
      return;
    }

    setGlobalBranch(activeBranches[0], restaurantId);
  }

  const loadBranches = useCallback(async () => {
    try {
      setLoading(true);
      setError("");

      const data = await getBranches(restaurantId);

      const list = Array.isArray(data) ? data : [];

      setBranches(list);
      syncSelectedBranch(list);
    } catch (err) {
      handleApiError(err, "Unable to load branches.");
    } finally {
      setLoading(false);
    }
  }, [restaurantId, selectedBranchId, selectedRestaurantId, handleApiError]);

  useEffect(() => {
    loadBranches();
  }, [loadBranches]);

  // --------------------------------------------------
  // Form
  // --------------------------------------------------

  function openCreateForm() {
    setEditingBranch(null);

    setForm({
      name: "",
      address: "",
      phone: "",
    });

    setFieldErrors({});
    setSubmitted(false);
    setError("");
    setShowForm(true);
  }

  function openEditForm(branch) {
    setEditingBranch(branch);

    setForm({
      name: branch.name || "",
      address: branch.address || "",
      phone: branch.phone || "",
    });

    setFieldErrors({});
    setSubmitted(false);
    setError("");
    setShowForm(true);
  }

  function closeForm() {
    if (saving) return;

    setShowForm(false);
    setEditingBranch(null);

    setForm({
      name: "",
      address: "",
      phone: "",
    });

    setFieldErrors({});
    setSubmitted(false);
    setError("");
  }

  function validateValues(values) {
    const errors = {};

    const name = values.name.trim();
    const address = values.address.trim();
    const phone = values.phone.trim();

    if (!name) {
      errors.name = "Branch name is required.";
    } else if (name.length < 2) {
      errors.name = "Branch name must contain at least 2 characters.";
    } else if (name.length > 150) {
      errors.name = "Branch name cannot exceed 150 characters.";
    }

    if (!address) {
      errors.address = "Branch address is required.";
    } else if (address.length < 5) {
      errors.address = "Address must contain at least 5 characters.";
    } else if (address.length > 500) {
      errors.address = "Address cannot exceed 500 characters.";
    }

    if (phone && !/^[0-9+\-\s()]{7,20}$/.test(phone)) {
      errors.phone = "Enter a valid phone number (7–20 characters).";
    }

    return errors;
  }

  function handleChange(event) {
    const { name, value } = event.target;

    setForm((previous) => ({
      ...previous,
      [name]: value,
    }));

    if (submitted) {
      const updatedForm = {
        ...form,
        [name]: value,
      };

      const errors = validateValues(updatedForm);

      setFieldErrors((previous) => ({
        ...previous,
        [name]: errors[name] || "",
      }));
    }
  }

  function validateForm() {
    const errors = validateValues(form);
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  }

  // --------------------------------------------------
  // Create / Update branch
  // --------------------------------------------------

  async function handleSubmit(event) {
    event.preventDefault();

    setSubmitted(true);
    setError("");

    if (!validateForm()) return;

    try {
      setSaving(true);

      const payload = {
        name: form.name.trim(),
        address: form.address.trim(),
        phone: form.phone.trim() || null,
      };

      let updatedBranches;

      if (editingBranch) {
        const updated = await updateBranch(
          restaurantId,
          editingBranch.id,
          payload,
        );

        updatedBranches = branches.map((branch) =>
          String(branch.id) === String(updated.id) ? updated : branch,
        );
      } else {
        const created = await createBranch(restaurantId, payload);
        updatedBranches = [created, ...branches];
      }

      setBranches(updatedBranches);
      syncSelectedBranch(updatedBranches);

      setShowForm(false);
      setEditingBranch(null);

      setForm({
        name: "",
        address: "",
        phone: "",
      });

      setFieldErrors({});
      setSubmitted(false);
    } catch (err) {
      handleApiError(err, "Unable to save branch.");
    } finally {
      setSaving(false);
    }
  }

  // --------------------------------------------------
  // Delete branch
  // --------------------------------------------------

  async function handleDelete(branch) {
    const confirmed = window.confirm(
      `Delete "${branch.name}"? Its categories, dishes and tables will also be deleted.`,
    );

    if (!confirmed) return;

    try {
      setError("");

      await deleteBranch(restaurantId, branch.id);

      const updatedBranches = branches.filter(
        (item) => String(item.id) !== String(branch.id),
      );

      setBranches(updatedBranches);

      if (String(branch.id) === String(selectedBranchId)) {
        setGlobalBranch(null, restaurantId);
      }

      syncSelectedBranch(updatedBranches);
    } catch (err) {
      handleApiError(err, "Unable to delete branch.");
    }
  }

  // --------------------------------------------------
  // Activate / deactivate branch
  // --------------------------------------------------

  async function toggleBranch(branch) {
    try {
      setError("");

      const updated = await updateBranch(restaurantId, branch.id, {
        is_active: !branch.is_active,
      });

      const updatedBranches = branches.map((item) =>
        String(item.id) === String(updated.id) ? updated : item,
      );

      setBranches(updatedBranches);

      if (
        !updated.is_active &&
        String(updated.id) === String(selectedBranchId)
      ) {
        setGlobalBranch(null, restaurantId);
      }

      syncSelectedBranch(updatedBranches);
    } catch (err) {
      handleApiError(err, "Unable to update branch.");
    }
  }

  // --------------------------------------------------
  // Navigation
  // --------------------------------------------------

  function openMenu(branch) {
    selectThisBranch(branch);

    navigate(
      `/dashboard/restaurants/${restaurantId}/branches/${branch.id}/menu`,
    );
  }

  function openTables(branch) {
    selectThisBranch(branch);

    navigate(
      `/dashboard/restaurants/${restaurantId}/branches/${branch.id}/tables`,
    );
  }

  function openAnalytics(branch) {
    selectThisBranch(branch);
    navigate("/dashboard/analytics");
  }

  function openReviews(branch) {
    selectThisBranch(branch);
    navigate("/dashboard/reviews");
  }

  const addressLength = form.address.trim().length;
  const addressTooShort = addressLength > 0 && addressLength < 5;

  return (
    <div className="management-page">
      <header className="management-header">
        <div className="management-header-left">
          <button
            className="back-button"
            onClick={() => navigate("/dashboard/restaurants")}
            title="Back to restaurants"
          >
            <ArrowLeft size={18} />
          </button>

          <div className="management-brand">
            <div className="management-brand-icon">
              <GitBranch size={19} />
            </div>

            <div>
              <strong>Branches</strong>
              <span>Manage restaurant locations</span>
            </div>
          </div>
        </div>

        <button className="primary-action" onClick={openCreateForm}>
          <Plus size={17} />
          Add Branch
        </button>
      </header>

      <main className="management-container">
        {error && (
          <div className="management-error" role="alert">
            {error}
          </div>
        )}

        <div className="management-title">
          <div>
            <h1>Restaurant Branches</h1>
            <p>Manage locations, menus and tables for this restaurant.</p>
          </div>

          <span className="item-count">
            {branches.length} branch
            {branches.length !== 1 ? "es" : ""}
          </span>
        </div>

        {loading && (
          <div className="empty-state">
            <div className="loading-spinner" />
            <p>Loading branches...</p>
          </div>
        )}

        {!loading && branches.length === 0 && (
          <div className="empty-state">
            <div className="empty-icon">
              <GitBranch size={28} />
            </div>

            <h2>No branches yet</h2>

            <p>
              Add the first location for this restaurant to start managing its
              menu.
            </p>

            <button className="primary-action" onClick={openCreateForm}>
              <Plus size={17} />
              Add Branch
            </button>
          </div>
        )}

        {!loading && branches.length > 0 && (
          <div className="branch-grid">
            {branches.map((branch) => {
              const isSelected =
                String(branch.id) === String(selectedBranchId) &&
                String(selectedRestaurantId) === String(restaurantId);

              return (
                <div
                  className={`branch-card ${
                    !branch.is_active ? "branch-inactive" : ""
                  } ${isSelected ? "branch-selected" : ""}`}
                  key={branch.id}
                >
                  <div className="branch-card-top">
                    <div className="branch-icon">
                      <GitBranch size={23} />
                    </div>

                    <div className="branch-card-actions">
                      <button
                        onClick={() => toggleBranch(branch)}
                        title={
                          branch.is_active
                            ? "Deactivate branch"
                            : "Activate branch"
                        }
                      >
                        <Power size={15} />
                      </button>

                      <button
                        onClick={() => openEditForm(branch)}
                        title="Edit branch"
                      >
                        <Edit3 size={15} />
                      </button>

                      <button
                        className="danger-icon"
                        onClick={() => handleDelete(branch)}
                        title="Delete branch"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </div>

                  <div className="branch-name-row">
                    <h2>{branch.name}</h2>

                    <div className="branch-status-group">
                      <span
                        className={
                          branch.is_active
                            ? "status-badge active"
                            : "status-badge inactive"
                        }
                      >
                        {branch.is_active ? "Active" : "Inactive"}
                      </span>

                      {isSelected && (
                        <span className="status-badge selected">Selected</span>
                      )}
                    </div>
                  </div>

                  <div className="branch-info">
                    <MapPin size={15} />
                    <span>{branch.address}</span>
                  </div>

                  {branch.phone && (
                    <div className="branch-info">
                      <Phone size={15} />
                      <span>{branch.phone}</span>
                    </div>
                  )}

                  {branch.is_active && (
                    <button
                      type="button"
                      className={
                        isSelected
                          ? "branch-selected-button"
                          : "branch-select-button"
                      }
                      onClick={() => selectThisBranch(branch)}
                    >
                      {isSelected ? "✓ Current Branch" : "Use This Branch"}
                    </button>
                  )}

                  <div className="branch-card-footer">
                    <button
                      className="branch-menu-button"
                      disabled={!branch.is_active}
                      onClick={() => openMenu(branch)}
                    >
                      <Utensils size={16} />
                      Manage Menu
                    </button>

                    <button
                      className="branch-table-button"
                      disabled={!branch.is_active}
                      onClick={() => openTables(branch)}
                    >
                      Tables
                    </button>
                  </div>

                  {branch.is_active && (
                    <div className="branch-secondary-actions">
                      <button
                        type="button"
                        onClick={() => openAnalytics(branch)}
                      >
                        <BarChart3 size={15} />
                        Analytics
                      </button>

                      <button type="button" onClick={() => openReviews(branch)}>
                        <MessageSquare size={15} />
                        Reviews
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </main>

      {showForm && (
        <div
          className="form-modal-overlay"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              closeForm();
            }
          }}
        >
          <div className="form-modal">
            <div className="form-modal-header">
              <div>
                <h2>{editingBranch ? "Edit Branch" : "Add Branch"}</h2>

                <p>
                  {editingBranch
                    ? "Update branch information."
                    : "Add a new restaurant location."}
                </p>
              </div>

              <button
                className="modal-close"
                onClick={closeForm}
                disabled={saving}
              >
                <X size={19} />
              </button>
            </div>

            <form onSubmit={handleSubmit}>
              <label>
                Branch Name
                <input
                  name="name"
                  value={form.name}
                  onChange={handleChange}
                  placeholder="e.g. Indore Main Branch"
                  maxLength={150}
                  aria-invalid={Boolean(fieldErrors.name)}
                />
                {fieldErrors.name && (
                  <small className="field-error">{fieldErrors.name}</small>
                )}
              </label>

              <label>
                Address
                <textarea
                  name="address"
                  value={form.address}
                  onChange={handleChange}
                  placeholder="Complete branch address"
                  maxLength={500}
                  rows={4}
                  aria-invalid={Boolean(fieldErrors.address)}
                />
                {fieldErrors.address && (
                  <small className="field-error">{fieldErrors.address}</small>
                )}
                {addressTooShort && !submitted && (
                  <small className="field-hint">
                    Enter at least 5 characters.
                  </small>
                )}
              </label>

              <label>
                Phone
                <input
                  name="phone"
                  value={form.phone}
                  onChange={handleChange}
                  placeholder="e.g. +91 9876543210"
                  maxLength={20}
                  aria-invalid={Boolean(fieldErrors.phone)}
                />
                {fieldErrors.phone && (
                  <small className="field-error">{fieldErrors.phone}</small>
                )}
              </label>

              <div className="form-modal-footer">
                <button
                  type="button"
                  className="secondary-action"
                  onClick={closeForm}
                  disabled={saving}
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  className="primary-action"
                  disabled={saving}
                >
                  {saving
                    ? "Saving..."
                    : editingBranch
                      ? "Save Changes"
                      : "Create Branch"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default Branches;
