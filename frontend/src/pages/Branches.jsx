import { useEffect, useState } from "react";
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

function Branches() {
  const navigate = useNavigate();
  const { restaurantId } = useParams();

  const [branches, setBranches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const [showForm, setShowForm] = useState(false);
  const [editingBranch, setEditingBranch] = useState(null);

  const [form, setForm] = useState({
    name: "",
    address: "",
    phone: "",
  });

  // --------------------------------------------------
  // Select branch
  // --------------------------------------------------

  function selectBranch(branch) {
    if (!branch?.id || !branch.is_active) {
      return;
    }

    localStorage.setItem("selected_branch_id", String(branch.id));

    // Store restaurant too — useful later if needed
    localStorage.setItem("selected_restaurant_id", String(restaurantId));
  }

  // --------------------------------------------------
  // Automatically select a valid branch
  // --------------------------------------------------

  function syncSelectedBranch(branchList) {
    const activeBranches = branchList.filter((branch) => branch.is_active);

    if (activeBranches.length === 0) {
      localStorage.removeItem("selected_branch_id");
      return;
    }

    const currentSelectedId = localStorage.getItem("selected_branch_id");

    const currentSelectedBranch = activeBranches.find(
      (branch) => String(branch.id) === String(currentSelectedId),
    );

    if (currentSelectedBranch) {
      return;
    }

    // No valid branch selected → choose first active branch
    selectBranch(activeBranches[0]);
  }

  // --------------------------------------------------
  // Load branches
  // --------------------------------------------------

  async function loadBranches() {
    try {
      setLoading(true);
      setError("");

      const data = await getBranches(restaurantId);

      setBranches(data);

      syncSelectedBranch(data);
    } catch (err) {
      console.error(err);

      if (err.response?.status === 401) {
        localStorage.removeItem("access_token");
        navigate("/login");
        return;
      }

      setError(err.response?.data?.detail || "Unable to load branches.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadBranches();
  }, [restaurantId]);

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

    setError("");
    setShowForm(true);
  }

  function closeForm() {
    if (saving) return;

    setShowForm(false);
    setEditingBranch(null);
  }

  function handleChange(event) {
    const { name, value } = event.target;

    setForm((previous) => ({
      ...previous,
      [name]: value,
    }));
  }

  // --------------------------------------------------
  // Create / Update branch
  // --------------------------------------------------

  async function handleSubmit(event) {
    event.preventDefault();

    if (!form.name.trim()) {
      setError("Branch name is required.");
      return;
    }

    if (!form.address.trim()) {
      setError("Branch address is required.");
      return;
    }

    try {
      setSaving(true);
      setError("");

      const payload = {
        name: form.name.trim(),
        address: form.address.trim(),
        phone: form.phone.trim() || null,
      };

      if (editingBranch) {
        const updated = await updateBranch(
          restaurantId,
          editingBranch.id,
          payload,
        );

        setBranches((previous) => {
          const updatedBranches = previous.map((branch) =>
            branch.id === updated.id ? updated : branch,
          );

          syncSelectedBranch(updatedBranches);

          return updatedBranches;
        });
      } else {
        const created = await createBranch(restaurantId, payload);

        setBranches((previous) => {
          const updatedBranches = [created, ...previous];

          syncSelectedBranch(updatedBranches);

          return updatedBranches;
        });
      }

      closeForm();
    } catch (err) {
      console.error(err);

      setError(err.response?.data?.detail || "Unable to save branch.");
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

      setBranches((previous) => {
        const updatedBranches = previous.filter(
          (item) => item.id !== branch.id,
        );

        const selectedId = localStorage.getItem("selected_branch_id");

        // If deleted branch was selected,
        // automatically choose another active branch.
        if (String(branch.id) === String(selectedId)) {
          localStorage.removeItem("selected_branch_id");
        }

        syncSelectedBranch(updatedBranches);

        return updatedBranches;
      });
    } catch (err) {
      console.error(err);

      setError(err.response?.data?.detail || "Unable to delete branch.");
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

      setBranches((previous) => {
        const updatedBranches = previous.map((item) =>
          item.id === updated.id ? updated : item,
        );

        // If branch was deactivated, make sure another
        // active branch becomes selected.
        syncSelectedBranch(updatedBranches);

        return updatedBranches;
      });
    } catch (err) {
      console.error(err);

      setError(err.response?.data?.detail || "Unable to update branch.");
    }
  }

  // --------------------------------------------------
  // Navigation
  // --------------------------------------------------

  function openMenu(branch) {
    selectBranch(branch);

    navigate(
      `/dashboard/restaurants/${restaurantId}/branches/${branch.id}/menu`,
    );
  }

  function openTables(branch) {
    selectBranch(branch);

    navigate(
      `/dashboard/restaurants/${restaurantId}/branches/${branch.id}/tables`,
    );
  }

  function openAnalytics(branch) {
    selectBranch(branch);

    navigate("/dashboard/analytics");
  }

  function openReviews(branch) {
    selectBranch(branch);

    navigate("/dashboard/reviews");
  }

  // --------------------------------------------------
  // Render
  // --------------------------------------------------

  const selectedBranchId = localStorage.getItem("selected_branch_id");

  return (
    <div className="management-page">
      {/* Header */}
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

      {/* Main */}
      <main className="management-container">
        {error && <div className="management-error">{error}</div>}

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

        {/* Loading */}
        {loading && (
          <div className="empty-state">
            <div className="loading-spinner" />
            <p>Loading branches...</p>
          </div>
        )}

        {/* Empty */}
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

        {/* Branch cards */}
        {!loading && branches.length > 0 && (
          <div className="branch-grid">
            {branches.map((branch) => {
              const isSelected = String(branch.id) === String(selectedBranchId);

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

                  {/* Select branch */}
                  {branch.is_active && (
                    <button
                      type="button"
                      className={
                        isSelected
                          ? "branch-selected-button"
                          : "branch-select-button"
                      }
                      onClick={() => selectBranch(branch)}
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

                  {/* Analytics / Reviews */}
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

      {/* Modal */}
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
                  required
                />
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
                  required
                />
              </label>

              <label>
                Phone
                <input
                  name="phone"
                  value={form.phone}
                  onChange={handleChange}
                  placeholder="e.g. +91 9876543210"
                  maxLength={20}
                />
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
