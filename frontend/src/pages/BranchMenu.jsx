import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  Plus,
  Edit3,
  Trash2,
  Utensils,
  FolderOpen,
  X,
  Power,
  Upload,
} from "lucide-react";

import {
  getCategories,
  createCategory,
  updateCategory,
  deleteCategory,
} from "../api/categories";

import { getDishes, createDish, updateDish, deleteDish } from "../api/dishes";

function BranchMenu() {
  const navigate = useNavigate();
  const { restaurantId, branchId } = useParams();

  const [categories, setCategories] = useState([]);
  const [dishes, setDishes] = useState([]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [error, setError] = useState("");

  const [activeCategoryId, setActiveCategoryId] = useState(null);

  const [showCategoryForm, setShowCategoryForm] = useState(false);
  const [showDishForm, setShowDishForm] = useState(false);

  const [editingCategory, setEditingCategory] = useState(null);
  const [editingDish, setEditingDish] = useState(null);

  const [categoryForm, setCategoryForm] = useState({
    name: "",
    description: "",
    display_order: 0,
  });

  const [dishForm, setDishForm] = useState({
    category_id: "",
    name: "",
    description: "",
    price: "",
    image_url: "",
    ingredients: "",
    spice_level: "",
    dietary_type: "",
    allergens: "",
    serving_size: "",
  });

  async function loadMenu() {
    try {
      setLoading(true);
      setError("");

      const [categoryData, dishData] = await Promise.all([
        getCategories(branchId),
        getDishes(branchId),
      ]);

      const sortedCategories = [...categoryData].sort(
        (a, b) => a.display_order - b.display_order,
      );

      setCategories(sortedCategories);
      setDishes(dishData);

      if (sortedCategories.length > 0 && activeCategoryId === null) {
        setActiveCategoryId(sortedCategories[0].id);
      }

      if (
        sortedCategories.length > 0 &&
        !sortedCategories.some((category) => category.id === activeCategoryId)
      ) {
        setActiveCategoryId(sortedCategories[0].id);
      }

      if (sortedCategories.length === 0) {
        setActiveCategoryId(null);
      }
    } catch (err) {
      console.error(err);

      if (err.response?.status === 401) {
        localStorage.removeItem("access_token");
        navigate("/login");
        return;
      }

      setError(err.response?.data?.detail || "Unable to load menu.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadMenu();
  }, [branchId]);

  function openCreateCategory() {
    setEditingCategory(null);

    setCategoryForm({
      name: "",
      description: "",
      display_order: categories.length,
    });

    setShowCategoryForm(true);
    setError("");
  }

  function openEditCategory(category) {
    setEditingCategory(category);

    setCategoryForm({
      name: category.name || "",
      description: category.description || "",
      display_order: category.display_order ?? 0,
    });

    setShowCategoryForm(true);
    setError("");
  }

  function closeCategoryForm() {
    if (saving) return;

    setShowCategoryForm(false);
    setEditingCategory(null);
  }

  function openCreateDish(categoryId = activeCategoryId) {
    if (!categoryId) {
      setError("Create a category first.");
      return;
    }

    setEditingDish(null);

    setDishForm({
      category_id: String(categoryId),
      name: "",
      description: "",
      price: "",
      image_url: "",
      ingredients: "",
      spice_level: "",
      dietary_type: "",
      allergens: "",
      serving_size: "",
    });

    setShowDishForm(true);
    setError("");
  }

  function openEditDish(dish) {
    setEditingDish(dish);

    setDishForm({
      category_id: String(dish.category_id),
      name: dish.name || "",
      description: dish.description || "",
      price: dish.price ?? "",
      image_url: dish.image_url || "",
      ingredients: dish.ingredients || "",
      spice_level: dish.spice_level || "",
      dietary_type: dish.dietary_type || "",
      allergens: dish.allergens || "",
      serving_size: dish.serving_size || "",
    });

    setShowDishForm(true);
    setError("");
  }

  function closeDishForm() {
    if (saving) return;

    setShowDishForm(false);
    setEditingDish(null);
  }

  function handleCategoryChange(event) {
    const { name, value } = event.target;

    setCategoryForm((previous) => ({
      ...previous,
      [name]: name === "display_order" ? Number(value) : value,
    }));
  }

  function handleDishChange(event) {
    const { name, value } = event.target;

    setDishForm((previous) => ({
      ...previous,
      [name]: value,
    }));
  }

  async function handleCategorySubmit(event) {
    event.preventDefault();

    if (!categoryForm.name.trim()) {
      setError("Category name is required.");
      return;
    }

    try {
      setSaving(true);
      setError("");

      const payload = {
        name: categoryForm.name.trim(),
        description: categoryForm.description.trim() || null,
        display_order: Number(categoryForm.display_order || 0),
      };

      if (editingCategory) {
        const updated = await updateCategory(
          branchId,
          editingCategory.id,
          payload,
        );

        setCategories((previous) =>
          previous
            .map((category) =>
              category.id === updated.id ? updated : category,
            )
            .sort((a, b) => a.display_order - b.display_order),
        );
      } else {
        const created = await createCategory(branchId, payload);

        setCategories((previous) =>
          [...previous, created].sort(
            (a, b) => a.display_order - b.display_order,
          ),
        );

        setActiveCategoryId(created.id);
      }

      closeCategoryForm();
    } catch (err) {
      console.error(err);

      setError(err.response?.data?.detail || "Unable to save category.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDishSubmit(event) {
    event.preventDefault();

    if (!dishForm.name.trim()) {
      setError("Dish name is required.");
      return;
    }

    if (!dishForm.price || Number(dishForm.price) <= 0) {
      setError("Enter a valid dish price.");
      return;
    }

    if (!dishForm.category_id) {
      setError("Select a category.");
      return;
    }

    try {
      setSaving(true);
      setError("");

      // category_id belongs in the request body.
      const payload = {
        category_id: Number(dishForm.category_id),
        name: dishForm.name.trim(),
        description: dishForm.description.trim() || null,
        price: Number(dishForm.price),
        image_url: dishForm.image_url.trim() || null,
        ingredients: dishForm.ingredients.trim() || null,
        spice_level: dishForm.spice_level || null,
        dietary_type: dishForm.dietary_type || null,
        allergens: dishForm.allergens.trim() || null,
        serving_size: dishForm.serving_size.trim() || null,
      };

      if (editingDish) {
        const updated = await updateDish(branchId, editingDish.id, payload);

        setDishes((previous) =>
          previous.map((dish) => (dish.id === updated.id ? updated : dish)),
        );

        setActiveCategoryId(Number(dishForm.category_id));
      } else {
        // IMPORTANT:
        // Backend endpoint is:
        // POST /branches/{branch_id}/dishes
        //
        // category_id is sent inside payload.
        const created = await createDish(branchId, payload);

        setDishes((previous) => [...previous, created]);

        setActiveCategoryId(Number(dishForm.category_id));
      }

      closeDishForm();
    } catch (err) {
      console.error(err);

      setError(err.response?.data?.detail || "Unable to save dish.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteCategory(category) {
    const categoryDishes = dishes.filter(
      (dish) => dish.category_id === category.id,
    );

    const message =
      categoryDishes.length > 0
        ? `Delete "${category.name}"? This will also delete ${
            categoryDishes.length
          } dish${categoryDishes.length === 1 ? "" : "es"}.`
        : `Delete "${category.name}"?`;

    if (!window.confirm(message)) return;

    try {
      setError("");

      await deleteCategory(branchId, category.id);

      setCategories((previous) =>
        previous.filter((item) => item.id !== category.id),
      );

      setDishes((previous) =>
        previous.filter((dish) => dish.category_id !== category.id),
      );

      if (activeCategoryId === category.id) {
        const remaining = categories.filter((item) => item.id !== category.id);

        setActiveCategoryId(remaining.length > 0 ? remaining[0].id : null);
      }
    } catch (err) {
      console.error(err);

      setError(err.response?.data?.detail || "Unable to delete category.");
    }
  }

  async function handleDeleteDish(dish) {
    if (!window.confirm(`Delete "${dish.name}"?`)) {
      return;
    }

    try {
      setError("");

      await deleteDish(branchId, dish.id);

      setDishes((previous) => previous.filter((item) => item.id !== dish.id));
    } catch (err) {
      console.error(err);

      setError(err.response?.data?.detail || "Unable to delete dish.");
    }
  }

  async function toggleDish(dish) {
    try {
      setError("");

      const updated = await updateDish(branchId, dish.id, {
        is_available: !dish.is_available,
      });

      setDishes((previous) =>
        previous.map((item) => (item.id === updated.id ? updated : item)),
      );
    } catch (err) {
      console.error(err);

      setError(err.response?.data?.detail || "Unable to update dish.");
    }
  }

  function openMenuImport() {
    navigate(
      `/dashboard/restaurants/${restaurantId}/branches/${branchId}/menu/import`,
    );
  }

  const activeCategory = categories.find(
    (category) => category.id === activeCategoryId,
  );

  const visibleDishes = dishes.filter(
    (dish) => dish.category_id === activeCategoryId,
  );

  return (
    <div className="management-page">
      {/* Header */}
      <header className="management-header">
        <div className="management-header-left">
          <button
            className="back-button"
            onClick={() =>
              navigate(`/dashboard/restaurants/${restaurantId}/branches`)
            }
          >
            <ArrowLeft size={18} />
          </button>

          <div className="management-brand">
            <div className="management-brand-icon">
              <Utensils size={19} />
            </div>

            <div>
              <strong>Menu</strong>
              <span>Manage categories and dishes</span>
            </div>
          </div>
        </div>

        <div className="management-header-actions">
          <button className="secondary-action" onClick={openMenuImport}>
            <Upload size={17} />
            Import Menu
          </button>

          <button
            className="primary-action"
            onClick={() => openCreateDish()}
            disabled={categories.length === 0}
          >
            <Plus size={17} />
            Add Dish
          </button>
        </div>
      </header>

      {/* Main */}
      <main className="menu-management-container">
        {error && <div className="management-error">{error}</div>}

        <div className="menu-page-title">
          <div>
            <h1>Branch Menu</h1>

            <p>Build and maintain the digital menu shown to your customers.</p>
          </div>

          <button className="secondary-action" onClick={openCreateCategory}>
            <Plus size={16} />
            Add Category
          </button>
        </div>

        {loading ? (
          <div className="empty-state">
            <div className="loading-spinner" />

            <p>Loading menu...</p>
          </div>
        ) : (
          <div className="menu-management-layout">
            {/* Categories */}
            <aside className="category-sidebar">
              <div className="category-sidebar-header">
                <div>
                  <strong>Categories</strong>

                  <span>{categories.length} total</span>
                </div>

                <button onClick={openCreateCategory} title="Add category">
                  <Plus size={17} />
                </button>
              </div>

              {categories.length === 0 ? (
                <div className="category-empty">
                  <FolderOpen size={24} />

                  <p>No categories</p>

                  <button onClick={openCreateCategory}>Create Category</button>
                </div>
              ) : (
                <div className="category-list">
                  {categories.map((category) => {
                    const count = dishes.filter(
                      (dish) => dish.category_id === category.id,
                    ).length;

                    return (
                      <div
                        key={category.id}
                        className={`category-item ${
                          activeCategoryId === category.id ? "selected" : ""
                        }`}
                      >
                        <button
                          className="category-select"
                          onClick={() => setActiveCategoryId(category.id)}
                        >
                          <span>{category.name}</span>

                          <small>{count}</small>
                        </button>

                        <div className="category-actions">
                          <button
                            onClick={() => openEditCategory(category)}
                            title="Edit category"
                          >
                            <Edit3 size={13} />
                          </button>

                          <button
                            onClick={() => handleDeleteCategory(category)}
                            title="Delete category"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </aside>

            {/* Dishes */}
            <section className="dish-management">
              {activeCategory ? (
                <>
                  <div className="dish-section-header">
                    <div>
                      <h2>{activeCategory.name}</h2>

                      {activeCategory.description && (
                        <p>{activeCategory.description}</p>
                      )}
                    </div>

                    <button
                      className="primary-action"
                      onClick={() => openCreateDish(activeCategory.id)}
                    >
                      <Plus size={16} />
                      Add Dish
                    </button>
                  </div>

                  {visibleDishes.length === 0 ? (
                    <div className="dish-empty">
                      <div className="dish-empty-icon">
                        <Utensils size={25} />
                      </div>

                      <h3>No dishes yet</h3>

                      <p>Add the first dish to this category.</p>

                      <button
                        className="primary-action"
                        onClick={() => openCreateDish(activeCategory.id)}
                      >
                        <Plus size={16} />
                        Add Dish
                      </button>
                    </div>
                  ) : (
                    <div className="dish-admin-list">
                      {visibleDishes.map((dish) => (
                        <div
                          className={`dish-admin-card ${
                            !dish.is_available ? "dish-unavailable" : ""
                          }`}
                          key={dish.id}
                        >
                          <div className="dish-admin-image">
                            {dish.image_url ? (
                              <img src={dish.image_url} alt={dish.name} />
                            ) : (
                              <Utensils size={24} />
                            )}
                          </div>

                          <div className="dish-admin-content">
                            <div className="dish-admin-title">
                              <h3>{dish.name}</h3>

                              <span>₹{dish.price}</span>
                            </div>

                            {dish.description && <p>{dish.description}</p>}

                            <div className="dish-tags">
                              {dish.dietary_type && (
                                <span>{dish.dietary_type}</span>
                              )}

                              {dish.spice_level && (
                                <span>{dish.spice_level}</span>
                              )}

                              {!dish.is_available && (
                                <span className="unavailable-tag">
                                  Unavailable
                                </span>
                              )}
                            </div>
                          </div>

                          <div className="dish-admin-actions">
                            <button
                              onClick={() => toggleDish(dish)}
                              title={
                                dish.is_available
                                  ? "Mark unavailable"
                                  : "Mark available"
                              }
                            >
                              <Power size={16} />
                            </button>

                            <button
                              onClick={() => openEditDish(dish)}
                              title="Edit dish"
                            >
                              <Edit3 size={16} />
                            </button>

                            <button
                              className="danger-icon"
                              onClick={() => handleDeleteDish(dish)}
                              title="Delete dish"
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <div className="dish-empty">
                  <div className="dish-empty-icon">
                    <FolderOpen size={25} />
                  </div>

                  <h3>Create a menu category</h3>

                  <p>
                    Start by creating categories such as Starters, Main Course,
                    Drinks or Desserts.
                  </p>

                  <button
                    className="primary-action"
                    onClick={openCreateCategory}
                  >
                    <Plus size={16} />
                    Add Category
                  </button>
                </div>
              )}
            </section>
          </div>
        )}
      </main>

      {/* Category Modal */}
      {showCategoryForm && (
        <div
          className="form-modal-overlay"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              closeCategoryForm();
            }
          }}
        >
          <div className="form-modal">
            <div className="form-modal-header">
              <div>
                <h2>{editingCategory ? "Edit Category" : "Add Category"}</h2>

                <p>Organize your menu into categories.</p>
              </div>

              <button
                className="modal-close"
                onClick={closeCategoryForm}
                disabled={saving}
              >
                <X size={19} />
              </button>
            </div>

            <form onSubmit={handleCategorySubmit}>
              <label>
                Category Name
                <input
                  name="name"
                  value={categoryForm.name}
                  onChange={handleCategoryChange}
                  placeholder="e.g. Main Course"
                  maxLength={100}
                  required
                />
              </label>

              <label>
                Description
                <textarea
                  name="description"
                  value={categoryForm.description}
                  onChange={handleCategoryChange}
                  placeholder="Optional category description"
                  maxLength={500}
                  rows={3}
                />
              </label>

              <label>
                Display Order
                <input
                  type="number"
                  name="display_order"
                  value={categoryForm.display_order}
                  onChange={handleCategoryChange}
                  min="0"
                />
              </label>

              <div className="form-modal-footer">
                <button
                  type="button"
                  className="secondary-action"
                  onClick={closeCategoryForm}
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
                    : editingCategory
                      ? "Save Changes"
                      : "Create Category"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Dish Modal */}
      {showDishForm && (
        <div
          className="form-modal-overlay"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              closeDishForm();
            }
          }}
        >
          <div className="form-modal dish-form-modal">
            <div className="form-modal-header">
              <div>
                <h2>{editingDish ? "Edit Dish" : "Add Dish"}</h2>

                <p>Add complete information for your dish.</p>
              </div>

              <button
                className="modal-close"
                onClick={closeDishForm}
                disabled={saving}
              >
                <X size={19} />
              </button>
            </div>

            <form onSubmit={handleDishSubmit}>
              <label>
                Category
                <select
                  name="category_id"
                  value={dishForm.category_id}
                  onChange={handleDishChange}
                  required
                >
                  <option value="">Select category</option>

                  {categories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                Dish Name
                <input
                  name="name"
                  value={dishForm.name}
                  onChange={handleDishChange}
                  placeholder="e.g. Paneer Tikka"
                  maxLength={150}
                  required
                />
              </label>

              <label>
                Description
                <textarea
                  name="description"
                  value={dishForm.description}
                  onChange={handleDishChange}
                  placeholder="Describe the dish"
                  maxLength={2000}
                  rows={3}
                />
              </label>

              <div className="dish-form-row">
                <label>
                  Price
                  <input
                    type="number"
                    name="price"
                    value={dishForm.price}
                    onChange={handleDishChange}
                    placeholder="299"
                    min="0.01"
                    step="0.01"
                    required
                  />
                </label>

                <label>
                  Serving Size
                  <input
                    name="serving_size"
                    value={dishForm.serving_size}
                    onChange={handleDishChange}
                    placeholder="2 people"
                    maxLength={100}
                  />
                </label>
              </div>

              <label>
                Image URL
                <input
                  name="image_url"
                  value={dishForm.image_url}
                  onChange={handleDishChange}
                  placeholder="https://..."
                  maxLength={500}
                />
              </label>

              <label>
                Ingredients
                <textarea
                  name="ingredients"
                  value={dishForm.ingredients}
                  onChange={handleDishChange}
                  placeholder="Paneer, onion, capsicum, spices..."
                  maxLength={2000}
                  rows={3}
                />
              </label>

              <div className="dish-form-row">
                <label>
                  Dietary Type
                  <select
                    name="dietary_type"
                    value={dishForm.dietary_type}
                    onChange={handleDishChange}
                  >
                    <option value="">Select</option>

                    <option value="Vegetarian">Vegetarian</option>

                    <option value="Vegan">Vegan</option>

                    <option value="Non-Vegetarian">Non-Vegetarian</option>

                    <option value="Egg">Egg</option>
                  </select>
                </label>

                <label>
                  Spice Level
                  <select
                    name="spice_level"
                    value={dishForm.spice_level}
                    onChange={handleDishChange}
                  >
                    <option value="">Select</option>

                    <option value="Mild">Mild</option>

                    <option value="Medium">Medium</option>

                    <option value="Spicy">Spicy</option>

                    <option value="Very Spicy">Very Spicy</option>
                  </select>
                </label>
              </div>

              <label>
                Allergens
                <textarea
                  name="allergens"
                  value={dishForm.allergens}
                  onChange={handleDishChange}
                  placeholder="Milk, nuts, gluten..."
                  maxLength={1000}
                  rows={2}
                />
              </label>

              <div className="form-modal-footer">
                <button
                  type="button"
                  className="secondary-action"
                  onClick={closeDishForm}
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
                    : editingDish
                      ? "Save Changes"
                      : "Create Dish"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default BranchMenu;
