import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Store,
  Plus,
  Edit3,
  Trash2,
  GitBranch,
  MapPin,
  ArrowLeft,
  X,
} from "lucide-react";

import {
  getRestaurants,
  createRestaurant,
  updateRestaurant,
  deleteRestaurant,
} from "../api/restaurants";

function Restaurants() {
  const navigate = useNavigate();

  const [restaurants, setRestaurants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const [showForm, setShowForm] = useState(false);
  const [editingRestaurant, setEditingRestaurant] = useState(null);

  const [form, setForm] = useState({
    name: "",
    description: "",
    location: "",
    logo_url: "",
  });

  async function loadRestaurants() {
    try {
      setLoading(true);
      setError("");

      const data = await getRestaurants();
      setRestaurants(data);
    } catch (err) {
      console.error(err);

      if (err.response?.status === 401) {
        localStorage.removeItem("access_token");
        navigate("/login");
        return;
      }

      setError(err.response?.data?.detail || "Unable to load restaurants.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadRestaurants();
  }, []);

  function openCreateForm() {
    setEditingRestaurant(null);

    setForm({
      name: "",
      description: "",
      location: "",
      logo_url: "",
    });

    setShowForm(true);
    setError("");
  }

  function openEditForm(restaurant) {
    setEditingRestaurant(restaurant);

    setForm({
      name: restaurant.name || "",
      description: restaurant.description || "",
      location: restaurant.location || "",
      logo_url: restaurant.logo_url || "",
    });

    setShowForm(true);
    setError("");
  }

  function closeForm() {
    if (saving) return;

    setShowForm(false);
    setEditingRestaurant(null);
  }

  function handleChange(event) {
    const { name, value } = event.target;

    setForm((previous) => ({
      ...previous,
      [name]: value,
    }));
  }

  async function handleSubmit(event) {
    event.preventDefault();

    if (!form.name.trim()) {
      setError("Restaurant name is required.");
      return;
    }

    try {
      setSaving(true);
      setError("");

      const payload = {
        name: form.name.trim(),
        description: form.description.trim() || null,
        location: form.location.trim() || null,
        logo_url: form.logo_url.trim() || null,
      };

      if (editingRestaurant) {
        const updated = await updateRestaurant(editingRestaurant.id, payload);

        setRestaurants((previous) =>
          previous.map((restaurant) =>
            restaurant.id === updated.id ? updated : restaurant,
          ),
        );
      } else {
        const created = await createRestaurant(payload);

        setRestaurants((previous) => [created, ...previous]);
      }

      closeForm();
    } catch (err) {
      console.error(err);

      setError(err.response?.data?.detail || "Unable to save restaurant.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(restaurant) {
    const confirmed = window.confirm(
      `Delete "${restaurant.name}"? This will also delete its branches, menu, tables and related data.`,
    );

    if (!confirmed) return;

    try {
      setError("");

      await deleteRestaurant(restaurant.id);

      setRestaurants((previous) =>
        previous.filter((item) => item.id !== restaurant.id),
      );
    } catch (err) {
      console.error(err);

      setError(err.response?.data?.detail || "Unable to delete restaurant.");
    }
  }

  function openBranches(restaurant) {
    navigate(`/dashboard/restaurants/${restaurant.id}/branches`);
  }

  return (
    <div className="management-page">
      {/* Header */}
      <header className="management-header">
        <div className="management-header-left">
          <button
            className="back-button"
            onClick={() => navigate("/dashboard")}
            title="Back to dashboard"
          >
            <ArrowLeft size={18} />
          </button>

          <div className="management-brand">
            <div className="management-brand-icon">
              <Store size={19} />
            </div>

            <div>
              <strong>Restaurants</strong>
              <span>Manage your restaurants</span>
            </div>
          </div>
        </div>

        <button className="primary-action" onClick={openCreateForm}>
          <Plus size={17} />
          Add Restaurant
        </button>
      </header>

      {/* Main */}
      <main className="management-container">
        {error && <div className="management-error">{error}</div>}

        <div className="management-title">
          <div>
            <h1>Your Restaurants</h1>
            <p>
              Create and manage restaurants connected to your Smart Menu
              account.
            </p>
          </div>

          <span className="item-count">
            {restaurants.length} restaurant
            {restaurants.length !== 1 ? "s" : ""}
          </span>
        </div>

        {/* Loading */}
        {loading && (
          <div className="empty-state">
            <div className="loading-spinner" />
            <p>Loading restaurants...</p>
          </div>
        )}

        {/* Empty */}
        {!loading && restaurants.length === 0 && (
          <div className="empty-state">
            <div className="empty-icon">
              <Store size={28} />
            </div>

            <h2>No restaurants yet</h2>

            <p>
              Create your first restaurant to start building your digital menu.
            </p>

            <button className="primary-action" onClick={openCreateForm}>
              <Plus size={17} />
              Create Restaurant
            </button>
          </div>
        )}

        {/* Restaurant cards */}
        {!loading && restaurants.length > 0 && (
          <div className="restaurant-grid">
            {restaurants.map((restaurant) => (
              <div className="restaurant-card" key={restaurant.id}>
                <div className="restaurant-card-top">
                  <div className="restaurant-logo">
                    {restaurant.logo_url ? (
                      <img
                        src={restaurant.logo_url}
                        alt={`${restaurant.name} logo`}
                      />
                    ) : (
                      <Store size={24} />
                    )}
                  </div>

                  <div className="restaurant-card-actions">
                    <button
                      onClick={() => openEditForm(restaurant)}
                      title="Edit restaurant"
                    >
                      <Edit3 size={16} />
                    </button>

                    <button
                      className="danger-icon"
                      onClick={() => handleDelete(restaurant)}
                      title="Delete restaurant"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>

                <h2>{restaurant.name}</h2>

                {restaurant.description && (
                  <p className="restaurant-description">
                    {restaurant.description}
                  </p>
                )}

                {restaurant.location && (
                  <div className="restaurant-location">
                    <MapPin size={15} />
                    <span>{restaurant.location}</span>
                  </div>
                )}

                <button
                  className="manage-branches-button"
                  onClick={() => openBranches(restaurant)}
                >
                  <GitBranch size={17} />
                  Manage Branches
                  <span>→</span>
                </button>
              </div>
            ))}
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
                <h2>
                  {editingRestaurant ? "Edit Restaurant" : "Add Restaurant"}
                </h2>

                <p>
                  {editingRestaurant
                    ? "Update restaurant information."
                    : "Create a new restaurant."}
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
                Restaurant Name
                <input
                  name="name"
                  value={form.name}
                  onChange={handleChange}
                  placeholder="e.g. The Food House"
                  maxLength={150}
                  required
                />
              </label>

              <label>
                Description
                <textarea
                  name="description"
                  value={form.description}
                  onChange={handleChange}
                  placeholder="Short description of your restaurant"
                  maxLength={2000}
                  rows={4}
                />
              </label>

              <label>
                Location
                <input
                  name="location"
                  value={form.location}
                  onChange={handleChange}
                  placeholder="e.g. Indore, Madhya Pradesh"
                  maxLength={255}
                />
              </label>

              <label>
                Logo URL
                <input
                  name="logo_url"
                  value={form.logo_url}
                  onChange={handleChange}
                  placeholder="https://..."
                  maxLength={500}
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
                    : editingRestaurant
                      ? "Save Changes"
                      : "Create Restaurant"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default Restaurants;
