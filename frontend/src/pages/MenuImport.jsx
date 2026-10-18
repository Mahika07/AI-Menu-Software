import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  Upload,
  FileText,
  Trash2,
  Plus,
  Check,
  ArrowLeft,
  LoaderCircle,
  Image as ImageIcon,
} from "lucide-react";

import {
  extractMenu,
  generateMenuImages,
  confirmMenuImport,
} from "../api/menuImport";

function MenuImport() {
  const { restaurantId, branchId } = useParams();
  const navigate = useNavigate();

  const [file, setFile] = useState(null);
  const [menu, setMenu] = useState(null);

  const [loading, setLoading] = useState(false);
  const [generatingImages, setGeneratingImages] = useState(false);
  const [importing, setImporting] = useState(false);

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [imageGenerationResult, setImageGenerationResult] = useState(null);

  // ---------------------------------------------------------
  // Navigation
  // ---------------------------------------------------------

  function goBackToMenu() {
    navigate(
      `/dashboard/restaurants/${restaurantId}/branches/${branchId}/menu`,
    );
  }

  // ---------------------------------------------------------
  // File selection
  // ---------------------------------------------------------

  function handleFileChange(event) {
    const selectedFile = event.target.files?.[0];

    if (!selectedFile) {
      return;
    }

    setError("");
    setSuccess("");
    setMenu(null);
    setImageGenerationResult(null);

    const allowedTypes = [
      "application/pdf",
      "image/jpeg",
      "image/png",
      "image/webp",
    ];

    const allowedExtensions = [".pdf", ".jpg", ".jpeg", ".png", ".webp"];

    const fileName = selectedFile.name.toLowerCase();

    const validMimeType = allowedTypes.includes(selectedFile.type);

    const validExtension = allowedExtensions.some((extension) =>
      fileName.endsWith(extension),
    );

    if (!validMimeType && !validExtension) {
      setError("Please upload a PDF, JPG, JPEG, WEBP, or PNG file.");

      setFile(null);
      return;
    }

    // Backend limit is 10 MB.
    if (selectedFile.size > 10 * 1024 * 1024) {
      setError("File size must be less than 10 MB.");
      setFile(null);
      return;
    }

    setFile(selectedFile);
  }

  // ---------------------------------------------------------
  // Extract menu
  // ---------------------------------------------------------

  async function handleExtract() {
    if (!file) {
      setError("Please select a menu file first.");
      return;
    }

    try {
      setLoading(true);
      setError("");
      setSuccess("");
      setMenu(null);
      setImageGenerationResult(null);

      const extracted = await extractMenu(branchId, file);

      if (!extracted || !Array.isArray(extracted.categories)) {
        setError("AI could not extract a valid menu from this file.");

        return;
      }

      if (extracted.categories.length === 0) {
        setError("No menu categories or dishes were found.");

        return;
      }

      setMenu(extracted);
    } catch (err) {
      console.error("Menu extraction failed:", err);

      setError(
        err.response?.data?.detail ||
          "Unable to extract menu. Please try again.",
      );
    } finally {
      setLoading(false);
    }
  }

  // ---------------------------------------------------------
  // Generate missing dish images
  // ---------------------------------------------------------

  async function handleGenerateImages() {
    if (!menu) {
      setError("Please extract a menu first.");
      return;
    }

    const dishesWithoutImages = menu.categories
      .flatMap((category) =>
        Array.isArray(category.dishes) ? category.dishes : [],
      )
      .filter((dish) => !dish.image_url);

    if (dishesWithoutImages.length === 0) {
      setError("All dishes already have images.");

      return;
    }

    try {
      setGeneratingImages(true);
      setError("");
      setSuccess("");
      setImageGenerationResult(null);

      const result = await generateMenuImages(branchId, menu);

      if (result?.menu) {
        setMenu(result.menu);
      }

      setImageGenerationResult({
        generated: result?.generated_images || 0,
        failed: result?.failed_images || 0,
      });
    } catch (err) {
      console.error("Image generation failed:", err);

      const detail =
        err.response?.data?.detail || "Unable to generate dish images.";

      if (
        err.response?.status === 429 ||
        detail.toLowerCase().includes("rate limit") ||
        detail.toLowerCase().includes("free tier")
      ) {
        setError(
          "AI image generation is currently unavailable on your Gemini plan. Your menu is still safe and can be imported without images.",
        );
      } else {
        setError(detail);
      }
    } finally {
      setGeneratingImages(false);
    }
  }

  // ---------------------------------------------------------
  // Update category
  // ---------------------------------------------------------

  function updateCategory(categoryIndex, field, value) {
    setMenu((current) => {
      if (!current) {
        return current;
      }

      const updated = structuredClone(current);

      if (!updated.categories?.[categoryIndex]) {
        return current;
      }

      updated.categories[categoryIndex][field] = value;

      return updated;
    });
  }

  // ---------------------------------------------------------
  // Update dish
  // ---------------------------------------------------------

  function updateDish(categoryIndex, dishIndex, field, value) {
    setMenu((current) => {
      if (!current) {
        return current;
      }

      const updated = structuredClone(current);

      const category = updated.categories?.[categoryIndex];

      if (!category?.dishes?.[dishIndex]) {
        return current;
      }

      category.dishes[dishIndex][field] = value;

      return updated;
    });
  }

  // ---------------------------------------------------------
  // Remove dish
  // ---------------------------------------------------------

  function removeDish(categoryIndex, dishIndex) {
    setMenu((current) => {
      if (!current) {
        return current;
      }

      const updated = structuredClone(current);

      const category = updated.categories?.[categoryIndex];

      if (!category?.dishes) {
        return current;
      }

      category.dishes.splice(dishIndex, 1);

      return updated;
    });
  }

  // ---------------------------------------------------------
  // Remove category
  // ---------------------------------------------------------

  function removeCategory(categoryIndex) {
    setMenu((current) => {
      if (!current) {
        return current;
      }

      const updated = structuredClone(current);

      if (!updated.categories?.[categoryIndex]) {
        return current;
      }

      updated.categories.splice(categoryIndex, 1);

      return updated;
    });
  }

  // ---------------------------------------------------------
  // Remove dish image
  // ---------------------------------------------------------

  function removeDishImage(categoryIndex, dishIndex) {
    updateDish(categoryIndex, dishIndex, "image_url", null);

    updateDish(categoryIndex, dishIndex, "image_ai_generated", false);
  }

  // ---------------------------------------------------------
  // Add category
  // ---------------------------------------------------------

  function addCategory() {
    setMenu((current) => {
      if (!current) {
        return {
          categories: [
            {
              name: "New Category",
              description: "",
              dishes: [],
            },
          ],
        };
      }

      return {
        ...current,
        categories: [
          ...(current.categories || []),
          {
            name: "New Category",
            description: "",
            dishes: [],
          },
        ],
      };
    });
  }

  // ---------------------------------------------------------
  // Add dish
  // ---------------------------------------------------------

  function addDish(categoryIndex) {
    setMenu((current) => {
      if (!current) {
        return current;
      }

      const updated = structuredClone(current);

      const category = updated.categories?.[categoryIndex];

      if (!category) {
        return current;
      }

      if (!Array.isArray(category.dishes)) {
        category.dishes = [];
      }

      category.dishes.push({
        name: "New Dish",
        description: "",
        description_ai_generated: false,

        price: null,

        image_url: null,
        image_ai_generated: false,

        ingredients: "",
        spice_level: null,
        dietary_type: null,
        allergens: "",
        serving_size: "",
      });

      return updated;
    });
  }

  // ---------------------------------------------------------
  // Validate menu
  // ---------------------------------------------------------

  function validateMenu() {
    if (
      !menu ||
      !Array.isArray(menu.categories) ||
      menu.categories.length === 0
    ) {
      return "No menu data available to import.";
    }

    const categoriesWithoutName = menu.categories.filter(
      (category) => !category.name?.trim(),
    );

    if (categoriesWithoutName.length > 0) {
      return "Every category must have a name.";
    }

    const dishes = menu.categories.flatMap((category) =>
      Array.isArray(category.dishes) ? category.dishes : [],
    );

    const dishesWithoutName = dishes.filter((dish) => !dish.name?.trim());

    if (dishesWithoutName.length > 0) {
      return `${dishesWithoutName.length} dish(es) are missing a name. Please add a name before importing.`;
    }

    const dishesWithoutPrice = dishes.filter(
      (dish) =>
        dish.name?.trim() &&
        (dish.price === null || dish.price === undefined || dish.price === ""),
    );

    if (dishesWithoutPrice.length > 0) {
      return `${dishesWithoutPrice.length} dish(es) are missing a price. Please add a price before importing.`;
    }

    const invalidPrices = dishes.filter((dish) => {
      if (
        dish.price === null ||
        dish.price === undefined ||
        dish.price === ""
      ) {
        return false;
      }

      const price = Number(dish.price);

      return Number.isNaN(price) || price <= 0;
    });

    if (invalidPrices.length > 0) {
      return "All dish prices must be greater than 0.";
    }

    return null;
  }

  // ---------------------------------------------------------
  // Import menu
  // ---------------------------------------------------------

  async function handleImport() {
    const validationError = validateMenu();

    if (validationError) {
      setError(validationError);
      return;
    }

    setImporting(true);
    setError("");
    setSuccess("");

    try {
      const result = await confirmMenuImport(branchId, menu);

      setSuccess(
        result?.message ||
          `Imported ${result?.dishes_created || 0} dishes successfully.`,
      );

      setTimeout(() => {
        goBackToMenu();
      }, 1200);
    } catch (err) {
      console.error("Menu import failed:", err);

      setError(
        err.response?.data?.detail ||
          "Failed to import menu. Please try again.",
      );
    } finally {
      setImporting(false);
    }
  }

  // ---------------------------------------------------------
  // Render
  // ---------------------------------------------------------

  return (
    <div className="management-page">
      {/* =====================================================
          HEADER
      ===================================================== */}

      <header className="management-header">
        <div className="management-header-left">
          <button className="back-button" onClick={goBackToMenu} type="button">
            <ArrowLeft size={18} />
          </button>

          <div className="management-brand">
            <FileText size={22} />

            <div>
              <h1>Import Menu</h1>
              <p>Upload and review your menu</p>
            </div>
          </div>
        </div>

        {menu && (
          <div className="menu-import-actions">
            {/* Generate images */}

            <button
              className="secondary-action"
              onClick={handleGenerateImages}
              disabled={generatingImages || importing}
              type="button"
            >
              {generatingImages ? (
                <>
                  <LoaderCircle size={17} className="spin" />
                  Generating Images...
                </>
              ) : (
                <>
                  <ImageIcon size={17} />
                  Generate Missing Images
                </>
              )}
            </button>

            {/* Approve import */}

            <button
              className="primary-action"
              onClick={handleImport}
              disabled={importing || generatingImages}
              type="button"
            >
              {importing ? (
                <>
                  <LoaderCircle size={17} className="spin" />
                  Importing...
                </>
              ) : (
                <>
                  <Check size={17} />
                  Approve & Import
                </>
              )}
            </button>
          </div>
        )}
      </header>

      {/* =====================================================
          MAIN
      ===================================================== */}

      <main className="menu-import-container">
        {/* ===================================================
            UPLOAD CARD
        =================================================== */}

        {!menu && (
          <section className="menu-upload-card">
            <div className="menu-upload-icon">
              <Upload size={32} />
            </div>

            <h2>Upload your restaurant menu</h2>

            <p>
              Upload a PDF or menu image. Our AI will extract categories,
              dishes, prices and other details.
            </p>

            <label className="menu-file-picker">
              <Upload size={18} />

              {file ? file.name : "Choose menu file"}

              <input
                type="file"
                accept=".pdf,.jpg,.jpeg,.png,.webp"
                onChange={handleFileChange}
                hidden
              />
            </label>

            {file && (
              <button
                className="primary-action"
                onClick={handleExtract}
                disabled={loading}
                type="button"
              >
                {loading ? (
                  <>
                    <LoaderCircle size={17} className="spin" />
                    Extracting...
                  </>
                ) : (
                  <>
                    <FileText size={17} />
                    Extract Menu
                  </>
                )}
              </button>
            )}
          </section>
        )}

        {/* ===================================================
            ERROR
        =================================================== */}

        {error && <div className="menu-import-error">{error}</div>}

        {/* ===================================================
            SUCCESS
        =================================================== */}

        {success && (
          <div className="menu-import-success">
            <Check size={18} />
            {success}
          </div>
        )}

        {/* ===================================================
            IMAGE GENERATION RESULT
        =================================================== */}

        {imageGenerationResult && (
          <div className="menu-import-success">
            <ImageIcon size={18} />
            Generated {imageGenerationResult.generated} image(s).
            {imageGenerationResult.failed > 0 && (
              <>
                {" "}
                {imageGenerationResult.failed} image(s) could not be generated.
              </>
            )}
          </div>
        )}

        {/* ===================================================
            REVIEW
        =================================================== */}

        {menu && Array.isArray(menu.categories) && (
          <section className="menu-review">
            <div className="menu-review-header">
              <div>
                <span>AI EXTRACTION</span>

                <h2>Review your menu</h2>

                <p>Check the extracted information before importing it.</p>
              </div>

              <button
                className="secondary-action"
                onClick={addCategory}
                type="button"
              >
                <Plus size={17} />
                Add Category
              </button>
            </div>

            {/* =============================================
                  CATEGORIES
              ============================================= */}

            {menu.categories.map((category, categoryIndex) => (
              <div className="import-category" key={categoryIndex}>
                {/* Category header */}

                <div className="import-category-header">
                  <input
                    value={category.name || ""}
                    onChange={(event) =>
                      updateCategory(categoryIndex, "name", event.target.value)
                    }
                    className="import-category-name"
                    placeholder="Category name"
                  />

                  <button
                    className="danger-icon-button"
                    onClick={() => removeCategory(categoryIndex)}
                    type="button"
                    title="Remove category"
                  >
                    <Trash2 size={17} />
                  </button>
                </div>

                {/* Category description */}

                <input
                  value={category.description || ""}
                  onChange={(event) =>
                    updateCategory(
                      categoryIndex,
                      "description",
                      event.target.value,
                    )
                  }
                  placeholder="Category description"
                  className="import-category-description"
                />

                {/* =======================================
                        DISHES
                    ======================================= */}

                <div className="import-dishes">
                  {Array.isArray(category.dishes) &&
                    category.dishes.map((dish, dishIndex) => (
                      <div className="import-dish-card" key={dishIndex}>
                        {/* Dish header */}

                        <div className="import-dish-header">
                          <input
                            value={dish.name || ""}
                            onChange={(event) =>
                              updateDish(
                                categoryIndex,
                                dishIndex,
                                "name",
                                event.target.value,
                              )
                            }
                            placeholder="Dish name"
                            className="import-dish-name"
                          />

                          <button
                            className="danger-icon-button"
                            onClick={() => removeDish(categoryIndex, dishIndex)}
                            type="button"
                            title="Remove dish"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>

                        {/* Description */}

                        {dish.description_ai_generated && (
                          <div className="ai-generated-label">
                            ✨ AI-generated description — you can edit this
                          </div>
                        )}

                        <textarea
                          value={dish.description || ""}
                          onChange={(event) =>
                            updateDish(
                              categoryIndex,
                              dishIndex,
                              "description",
                              event.target.value,
                            )
                          }
                          placeholder="Description"
                        />

                        {/* =================================
                                  DISH IMAGE
                              ================================= */}

                        <div className="import-dish-image-section">
                          {dish.image_url ? (
                            <div className="import-dish-image-preview">
                              <img
                                src={dish.image_url}
                                alt={dish.name || "Dish"}
                                loading="lazy"
                              />

                              <div className="import-dish-image-info">
                                {dish.image_ai_generated && (
                                  <span className="ai-generated-label">
                                    ✨ AI-generated image
                                  </span>
                                )}

                                <button
                                  type="button"
                                  className="danger-icon-button"
                                  onClick={() =>
                                    removeDishImage(categoryIndex, dishIndex)
                                  }
                                  title="Remove image"
                                >
                                  <Trash2 size={16} />
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div className="import-dish-image-empty">
                              <ImageIcon size={26} />

                              <span>No dish image</span>

                              <small>
                                Click "Generate Missing Images" to create one.
                              </small>
                            </div>
                          )}
                        </div>

                        {/* =================================
                                  DISH FIELDS
                              ================================= */}

                        <div className="import-form-grid">
                          {/* Price */}

                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={dish.price ?? ""}
                            onChange={(event) =>
                              updateDish(
                                categoryIndex,
                                dishIndex,
                                "price",
                                event.target.value
                                  ? Number(event.target.value)
                                  : null,
                              )
                            }
                            placeholder="Price"
                          />

                          {/* Ingredients */}

                          <input
                            value={dish.ingredients || ""}
                            onChange={(event) =>
                              updateDish(
                                categoryIndex,
                                dishIndex,
                                "ingredients",
                                event.target.value,
                              )
                            }
                            placeholder="Ingredients"
                          />

                          {/* Dietary type */}

                          <select
                            value={dish.dietary_type || ""}
                            onChange={(event) =>
                              updateDish(
                                categoryIndex,
                                dishIndex,
                                "dietary_type",
                                event.target.value || null,
                              )
                            }
                          >
                            <option value="">Dietary type</option>

                            <option value="Vegetarian">Vegetarian</option>

                            <option value="Vegan">Vegan</option>

                            <option value="Non-Vegetarian">
                              Non-Vegetarian
                            </option>

                            <option value="Egg">Egg</option>
                          </select>

                          {/* Spice level */}

                          <select
                            value={dish.spice_level || ""}
                            onChange={(event) =>
                              updateDish(
                                categoryIndex,
                                dishIndex,
                                "spice_level",
                                event.target.value || null,
                              )
                            }
                          >
                            <option value="">Spice level</option>

                            <option value="Mild">Mild</option>

                            <option value="Medium">Medium</option>

                            <option value="Spicy">Spicy</option>

                            <option value="Very Spicy">Very Spicy</option>
                          </select>

                          {/* Allergens */}

                          <input
                            value={dish.allergens || ""}
                            onChange={(event) =>
                              updateDish(
                                categoryIndex,
                                dishIndex,
                                "allergens",
                                event.target.value,
                              )
                            }
                            placeholder="Allergens"
                          />

                          {/* Serving size */}

                          <input
                            value={dish.serving_size || ""}
                            onChange={(event) =>
                              updateDish(
                                categoryIndex,
                                dishIndex,
                                "serving_size",
                                event.target.value,
                              )
                            }
                            placeholder="Serving size"
                          />
                        </div>
                      </div>
                    ))}
                </div>

                {/* Add dish */}

                <button
                  className="add-dish-button"
                  onClick={() => addDish(categoryIndex)}
                  type="button"
                >
                  <Plus size={16} />
                  Add Dish
                </button>
              </div>
            ))}

            {/* Empty menu */}

            {menu.categories.length === 0 && (
              <div className="menu-import-empty">
                <p>No categories found. Add a category to continue.</p>

                <button
                  className="secondary-action"
                  onClick={addCategory}
                  type="button"
                >
                  <Plus size={17} />
                  Add Category
                </button>
              </div>
            )}
          </section>
        )}
      </main>
    </div>
  );
}

export default MenuImport;
