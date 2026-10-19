import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import {
  Search,
  SlidersHorizontal,
  X,
  Utensils,
  Leaf,
  Flame,
  ShoppingBag,
  Plus,
  Minus,
  Trash2,
  ClipboardCheck,
  Clock,
  RefreshCw,
  ArrowRight,
} from "lucide-react";

import { getPublicMenu } from "../api/menu";
import {
  createDineInOrder,
  getOrderStatus,
  getTableOrders,
  getOrCreateDiningSession,
  startNewDiningSession,
} from "../api/orders";
import DishDetails from "../components/DishDetails";
import AIAssistant from "../components/AIAssistant";
import { useAnalytics } from "../hooks/useAnalytics";

const formatMoney = (value) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(Number(value || 0));

const formatDishPrice = (value) => formatMoney(value).replace(/\.00$/, "");

const ORDER_STATUS_LABELS = {
  pending: "Order received",
  confirmed: "Order confirmed",
  preparing: "Being prepared",
  ready: "Ready to serve",
  completed: "Completed",
  cancelled: "Cancelled",
};

function dietMarkClass(type) {
  if (type === "Non-Vegetarian") return "nonveg";
  if (type === "Egg") return "egg";
  if (type === "Vegetarian" || type === "Vegan") return "veg";
  return "";
}

function PublicMenu() {
  const { qrToken } = useParams();

  const [menu, setMenu] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [search, setSearch] = useState("");
  const [dietaryFilter, setDietaryFilter] = useState("");
  const [spiceFilter, setSpiceFilter] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [selectedDish, setSelectedDish] = useState(null);

  const [analyticsBranchId, setAnalyticsBranchId] = useState(null);
  const [analyticsTableId, setAnalyticsTableId] = useState(null);

  const [cart, setCart] = useState([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [checkoutOpen, setCheckoutOpen] = useState(false);

  const [customerName, setCustomerName] = useState("");
  const [customerNote, setCustomerNote] = useState("");
  const [checkoutError, setCheckoutError] = useState("");
  const [submittingOrder, setSubmittingOrder] = useState(false);

  const [activeOrder, setActiveOrder] = useState(null);
  const [tableOrders, setTableOrders] = useState([]);
  const [tableOrdersError, setTableOrdersError] = useState("");
  const [trackingError, setTrackingError] = useState("");

  const { track } = useAnalytics(analyticsBranchId, analyticsTableId, qrToken);

  const [diningSessionReady, setDiningSessionReady] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadMenu() {
      try {
        setLoading(true);
        setError("");

        const data = await getPublicMenu(qrToken);

        if (cancelled) return;

        setMenu(data);
        setAnalyticsBranchId(data?.branch_id ?? null);
        setAnalyticsTableId(data?.table_id ?? null);
      } catch (err) {
        if (!cancelled) {
          setError(
            err.response?.data?.detail || "This menu is currently unavailable.",
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    if (qrToken) loadMenu();

    return () => {
      cancelled = true;
    };
  }, [qrToken]);
  // Create or restore the current table's dining session.
  useEffect(() => {
    if (!qrToken) {
      setDiningSessionReady(false);
      return undefined;
    }

    let cancelled = false;

    async function initializeDiningSession() {
      setDiningSessionReady(false);
      setTableOrdersError("");

      try {
        await getOrCreateDiningSession(qrToken);

        if (!cancelled) {
          setDiningSessionReady(true);
        }
      } catch (err) {
        if (!cancelled) {
          setDiningSessionReady(false);
          setTableOrdersError(
            err.response?.data?.detail ||
              err.message ||
              "Unable to start your dining session. Please try again.",
          );
        }
      }
    }

    initializeDiningSession();

    return () => {
      cancelled = true;
    };
  }, [qrToken]);

  // Refresh the public order status while the order is in progress.
  useEffect(() => {
    if (!activeOrder?.order_number) return;

    const terminalStatuses = ["completed", "cancelled"];

    if (terminalStatuses.includes(activeOrder.status)) return;

    let cancelled = false;

    const refreshStatus = async () => {
      try {
        const latest = await getOrderStatus(activeOrder.order_number);

        if (!cancelled) {
          setActiveOrder(latest);
          setTrackingError("");
        }
      } catch {
        if (!cancelled) {
          setTrackingError(
            "We couldn't refresh your order status. Please try again.",
          );
        }
      }
    };

    const intervalId = window.setInterval(refreshStatus, 10000);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [activeOrder?.order_number, activeOrder?.status]);

  // Refresh orders only while the current dining session is ready.
  useEffect(() => {
    if (!qrToken || !diningSessionReady) return undefined;

    let cancelled = false;

    const refreshTableOrders = async () => {
      try {
        const data = await getTableOrders(qrToken);

        if (!cancelled) {
          setTableOrders(Array.isArray(data) ? data : []);
          setTableOrdersError("");
        }
      } catch (err) {
        if (cancelled) return;

        setTableOrdersError(
          err.response?.data?.detail ||
            err.message ||
            "Unable to load orders for this dining session.",
        );
        setDiningSessionReady(false);
      }
    };

    refreshTableOrders();
    const intervalId = window.setInterval(refreshTableOrders, 10000);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [qrToken, diningSessionReady]);

  function handleDishClick(dish) {
    setSelectedDish(dish);

    track({
      eventType: "DISH_VIEW",
      dishId: dish?.id ?? null,
      metadata: {
        source: "public_menu",
        dish_name: dish?.name ?? null,
      },
    });
  }

  function addToCart(dish) {
    if (!dish.is_available) return;

    setCart((current) => {
      const existing = current.find((item) => item.dish.id === dish.id);

      if (existing) {
        return current.map((item) =>
          item.dish.id === dish.id
            ? { ...item, quantity: Math.min(item.quantity + 1, 20) }
            : item,
        );
      }

      return [
        ...current,
        {
          dish,
          quantity: 1,
          special_instructions: "",
        },
      ];
    });

    setCheckoutError("");

    track({
      eventType: "ADD_TO_CART",
      dishId: dish.id,
      metadata: {
        source: "public_menu",
        dish_name: dish.name,
      },
    });
  }

  function updateQuantity(dishId, change) {
    setCart((current) =>
      current
        .map((item) =>
          item.dish.id === dishId
            ? {
                ...item,
                quantity: Math.min(20, item.quantity + change),
              }
            : item,
        )
        .filter((item) => item.quantity > 0),
    );
  }

  function updateInstructions(dishId, value) {
    setCart((current) =>
      current.map((item) =>
        item.dish.id === dishId
          ? {
              ...item,
              special_instructions: value.slice(0, 500),
            }
          : item,
      ),
    );
  }

  function removeFromCart(dishId) {
    setCart((current) => current.filter((item) => item.dish.id !== dishId));
  }

  const cartCount = cart.reduce((total, item) => total + item.quantity, 0);

  const cartSubtotal = cart.reduce(
    (total, item) => total + Number(item.dish.price) * item.quantity,
    0,
  );

  const filteredCategories = useMemo(() => {
    if (!menu?.categories) return [];

    const searchTerm = search.trim().toLowerCase();

    return menu.categories
      .map((category) => ({
        ...category,
        dishes: category.dishes.filter((dish) => {
          const matchesSearch =
            !searchTerm ||
            dish.name.toLowerCase().includes(searchTerm) ||
            dish.description?.toLowerCase().includes(searchTerm) ||
            dish.ingredients?.toLowerCase().includes(searchTerm);

          const matchesDietary =
            !dietaryFilter || dish.dietary_type === dietaryFilter;

          const matchesSpice = !spiceFilter || dish.spice_level === spiceFilter;

          return matchesSearch && matchesDietary && matchesSpice;
        }),
      }))
      .filter((category) => category.dishes.length > 0);
  }, [menu, search, dietaryFilter, spiceFilter]);

  const totalDishes =
    menu?.categories?.reduce(
      (total, category) => total + category.dishes.length,
      0,
    ) || 0;

  const filteredDishCount = filteredCategories.reduce(
    (total, category) => total + category.dishes.length,
    0,
  );

  const hasFilters = Boolean(search || dietaryFilter || spiceFilter);

  function clearFilters() {
    setSearch("");
    setDietaryFilter("");
    setSpiceFilter("");
  }

  useEffect(() => {
    const searchTerm = search.trim();

    if (!analyticsBranchId || !searchTerm) return;

    const timeout = window.setTimeout(() => {
      track({
        eventType: "SEARCH",
        metadata: {
          query: searchTerm,
          result_count: filteredDishCount,
        },
      });
    }, 500);

    return () => window.clearTimeout(timeout);
  }, [search, analyticsBranchId, filteredDishCount, track]);

  const [activeCategory, setActiveCategory] = useState(null);

  function scrollToCategory(categoryId) {
    setActiveCategory(categoryId);

    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;

    document.getElementById(`category-${categoryId}`)?.scrollIntoView({
      behavior: reduceMotion ? "auto" : "smooth",
      block: "start",
    });
  }

  // Highlight the category chip that matches the section being read.
  useEffect(() => {
    if (!filteredCategories.length || !("IntersectionObserver" in window)) {
      return undefined;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.find((entry) => entry.isIntersecting);
        if (visible) {
          setActiveCategory(Number(visible.target.dataset.categoryId));
        }
      },
      { rootMargin: "-35% 0px -55% 0px" },
    );

    filteredCategories.forEach((category) => {
      const node = document.getElementById(`category-${category.id}`);
      if (node) observer.observe(node);
    });

    return () => observer.disconnect();
  }, [filteredCategories]);

  async function submitOrder(event) {
    event.preventDefault();

    if (!qrToken || cart.length === 0 || submittingOrder) return;

    if (!diningSessionReady) {
      setCheckoutError(
        tableOrdersError ||
          "Your dining session is not ready. Start a new dining session before placing an order.",
      );
      return;
    }

    setSubmittingOrder(true);
    setCheckoutError("");

    try {
      const payload = {
        customer_name: customerName.trim() || null,
        customer_note: customerNote.trim() || null,
        items: cart.map((item) => ({
          dish_id: item.dish.id,
          quantity: item.quantity,
          special_instructions: item.special_instructions.trim() || null,
        })),
      };

      const order = await createDineInOrder(qrToken, payload);

      setActiveOrder(order);
      setTableOrders((current) => [
        order,
        ...current.filter((entry) => entry.order_number !== order.order_number),
      ]);
      setCart([]);
      setCheckoutOpen(false);
      setCartOpen(false);
      setCustomerName("");
      setCustomerNote("");
      setTrackingError("");

      track({
        eventType: "ORDER_PLACED",
        metadata: {
          source: "public_menu",
          order_number: order.order_number,
          item_count: order.items?.length ?? payload.items.length,
          total_amount: order.total_amount,
        },
      });
    } catch (err) {
      setCheckoutError(
        err.response?.data?.detail ||
          "We couldn't place your order. Please check your connection and try again.",
      );
    } finally {
      setSubmittingOrder(false);
    }
  }

  async function refreshOrderStatus() {
    if (!activeOrder?.order_number) return;

    setTrackingError("");

    try {
      const latest = await getOrderStatus(activeOrder.order_number);
      setActiveOrder(latest);
    } catch (err) {
      setTrackingError(
        err.response?.data?.detail || "Unable to refresh your order status.",
      );
    }
  }

  if (loading) {
    return (
      <div className="public-menu-page">
        <div className="public-menu-loading">
          <div className="loading-spinner" />
          <p>Loading menu...</p>
        </div>
      </div>
    );
  }

  if (error || !menu) {
    return (
      <div className="public-menu-page">
        <div className="public-menu-error">
          <div className="error-icon">
            <Utensils size={32} />
          </div>
          <h2>Menu unavailable</h2>
          <p>{error || "This menu is currently unavailable."}</p>
        </div>
      </div>
    );
  }

  const heroDishes = (menu.categories || [])
    .flatMap((category) => category.dishes)
    .filter((dish) => dish.image_url)
    .slice(0, 3);

  const showCartBar = cartCount > 0 && !cartOpen && !checkoutOpen;

  return (
    <div className={`public-menu-page ${showCartBar ? "has-cart-bar" : ""}`}>
      <header className="public-menu-header">
        <div className="public-menu-header-content">
          <div className="restaurant-brand">
            {menu.logo_url ? (
              <img
                src={menu.logo_url}
                alt={menu.restaurant_name || "Restaurant"}
                className="restaurant-logo"
              />
            ) : (
              <div className="restaurant-logo-placeholder">
                <Utensils size={24} />
              </div>
            )}

            <div>
              <h1>{menu.restaurant_name || "Restaurant Menu"}</h1>
              {menu.branch_name && <p>{menu.branch_name}</p>}
            </div>
          </div>

          <button
            type="button"
            className="order-header-button"
            onClick={() => setCartOpen(true)}
          >
            <ShoppingBag size={19} />
            <span className="order-header-label">My order</span>
            <span className="order-count">
              {tableOrders.length > 0 ? tableOrders.length : cartCount}
            </span>
          </button>
        </div>
      </header>

      {trackingError && <p className="order-inline-error">{trackingError}</p>}


      {tableOrdersError && (
        <section className="table-orders-error" role="alert">
          <p>{tableOrdersError}</p>
          <button
            type="button"
            className="order-secondary-button"
            disabled={!qrToken}
            onClick={async () => {
              try {
                setTableOrdersError("");
                setDiningSessionReady(false);

                await startNewDiningSession(qrToken);

                setTableOrders([]);
                setDiningSessionReady(true);
              } catch (err) {
                setDiningSessionReady(false);
                setTableOrdersError(
                  err.response?.data?.detail ||
                    err.message ||
                    "Unable to start a new dining session. Please try again.",
                );
              }
            }}
          >
            Start new dining session
          </button>
        </section>
      )}

      {!hasFilters && filteredCategories.length > 0 && (
        <section className="menu-hero">
          <div className="menu-hero-copy">
            <span className="menu-hero-eyebrow">
              Welcome{menu.table_number ? ` · Table ${menu.table_number}` : ""}
            </span>
            <h2>Fresh from our kitchen to your table</h2>
            <p>Pick your favourites and order right from your seat.</p>
            <button
              type="button"
              className="menu-hero-button"
              onClick={() => scrollToCategory(filteredCategories[0].id)}
            >
              Browse menu
              <ArrowRight size={17} />
            </button>
          </div>

          <div className="menu-hero-art" aria-hidden="true">
            {heroDishes.length > 0 ? (
              heroDishes.map((dish) => (
                <img key={dish.id} src={dish.image_url} alt="" />
              ))
            ) : (
              <span className="menu-hero-art-icon">
                <Utensils size={44} />
              </span>
            )}
          </div>
        </section>
      )}

      <section className="public-menu-controls">
        <div className="public-menu-search">
          <Search size={20} />
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search dishes or ingredients..."
          />

          {search && (
            <button
              type="button"
              className="search-clear-button"
              onClick={() => setSearch("")}
              aria-label="Clear search"
            >
              <X size={18} />
            </button>
          )}
        </div>

        <button
          type="button"
          className={`filter-button ${showFilters ? "active" : ""}`}
          onClick={() => setShowFilters((current) => !current)}
        >
          <SlidersHorizontal size={18} />
          <span className="filter-button-label">Filters</span>
        </button>
      </section>

      {showFilters && (
        <section className="public-menu-filters">
          <div className="filter-group">
            <label htmlFor="dietary-filter">Dietary</label>
            <select
              id="dietary-filter"
              value={dietaryFilter}
              onChange={(event) => setDietaryFilter(event.target.value)}
            >
              <option value="">All</option>
              <option value="Vegetarian">Vegetarian</option>
              <option value="Vegan">Vegan</option>
              <option value="Non-Vegetarian">Non-Vegetarian</option>
              <option value="Egg">Egg</option>
            </select>
          </div>

          <div className="filter-group">
            <label htmlFor="spice-filter">Spice level</label>
            <select
              id="spice-filter"
              value={spiceFilter}
              onChange={(event) => setSpiceFilter(event.target.value)}
            >
              <option value="">All</option>
              <option value="Mild">Mild</option>
              <option value="Medium">Medium</option>
              <option value="Spicy">Spicy</option>
              <option value="Very Spicy">Very Spicy</option>
            </select>
          </div>

          {hasFilters && (
            <button
              type="button"
              className="clear-filters-button"
              onClick={clearFilters}
            >
              Clear filters
            </button>
          )}
        </section>
      )}

      {filteredCategories.length > 1 && (
        <nav className="category-chips" aria-label="Menu categories">
          {filteredCategories.map((category) => {
            const cover = category.dishes.find((dish) => dish.image_url);

            return (
              <button
                type="button"
                key={category.id}
                className={`category-chip ${
                  activeCategory === category.id ? "active" : ""
                }`}
                onClick={() => scrollToCategory(category.id)}
                aria-current={activeCategory === category.id}
              >
                <span className="category-chip-icon">
                  {cover ? (
                    <img src={cover.image_url} alt="" />
                  ) : (
                    <Utensils size={22} />
                  )}
                </span>
                <span className="category-chip-label">{category.name}</span>
              </button>
            );
          })}
        </nav>
      )}

      <div className="public-menu-summary">
        <span>
          {filteredDishCount} {filteredDishCount === 1 ? "dish" : "dishes"}
        </span>
        {hasFilters ? (
          <span className="filter-result-text">Showing filtered results</span>
        ) : (
          <span>{totalDishes} total</span>
        )}
      </div>

      <main className="public-menu-content">
        {filteredCategories.length === 0 ? (
          <div className="empty-menu-state">
            <Utensils size={36} />
            <h2>No dishes found</h2>
            <p>Try changing your search or filters.</p>
            {hasFilters && (
              <button type="button" onClick={clearFilters}>
                Clear filters
              </button>
            )}
          </div>
        ) : (
          filteredCategories.map((category) => (
            <section
              className="menu-category"
              key={category.id}
              id={`category-${category.id}`}
              data-category-id={category.id}
            >
              <div className="menu-category-header">
                <div>
                  <h2>{category.name}</h2>
                  {category.description && <p>{category.description}</p>}
                </div>
                <span>{category.dishes.length}</span>
              </div>

              <div className="dish-grid">
                {category.dishes.map((dish) => (
                  <article
                    key={dish.id}
                    className="dish-card"
                    role="button"
                    tabIndex={0}
                    onClick={() => handleDishClick(dish)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        handleDishClick(dish);
                      }
                    }}
                  >
                    <div className="dish-image-wrapper">
                      {dish.image_url ? (
                        <img
                          src={dish.image_url}
                          alt={dish.name}
                          className="dish-image"
                          loading="lazy"
                        />
                      ) : (
                        <div className="dish-image-placeholder">
                          <Utensils size={28} />
                        </div>
                      )}

                      {dietMarkClass(dish.dietary_type) && (
                        <span
                          className={`dish-diet-mark ${dietMarkClass(dish.dietary_type)}`}
                          title={dish.dietary_type}
                        />
                      )}

                      {!dish.is_available && (
                        <div className="dish-unavailable">Unavailable</div>
                      )}
                    </div>

                    <div className="dish-card-content">
                      <h3>{dish.name}</h3>

                      {dish.description && (
                        <p className="dish-description">{dish.description}</p>
                      )}

                      <div className="dish-tags">
                        {dish.dietary_type === "Vegan" && (
                          <span className="dish-tag vegan">
                            <Leaf size={12} />
                            Vegan
                          </span>
                        )}

                        {dish.spice_level && (
                          <span className="dish-tag spice">
                            <Flame size={12} />
                            {dish.spice_level}
                          </span>
                        )}

                        {dish.serving_size && (
                          <span className="dish-tag serving">
                            {dish.serving_size}
                          </span>
                        )}
                      </div>

                      <div className="dish-card-actions">
                        <span className="dish-price">
                          {formatDishPrice(dish.price)}
                        </span>

                        <button
                          type="button"
                          className="dish-add-button"
                          disabled={!dish.is_available}
                          aria-label={`Add ${dish.name} to order`}
                          onClick={(event) => {
                            event.stopPropagation();
                            addToCart(dish);
                          }}
                        >
                          <Plus size={18} />
                        </button>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          ))
        )}
      </main>

      {selectedDish && (
        <DishDetails
          dish={selectedDish}
          onClose={() => setSelectedDish(null)}
          branchId={analyticsBranchId}
          tableId={analyticsTableId}
          qrToken={qrToken}
        />
      )}

      <AIAssistant
        qrToken={qrToken}
        branchId={analyticsBranchId}
        tableId={analyticsTableId}
      />

      {showCartBar && (
        <button
          type="button"
          className="cart-bar"
          onClick={() => setCartOpen(true)}
        >
          <span className="cart-bar-info">
            <span className="cart-bar-count">
              {cartCount} {cartCount === 1 ? "item" : "items"}
            </span>
            <strong>{formatMoney(cartSubtotal)}</strong>
          </span>
          <span className="cart-bar-action">
            View order
            <ArrowRight size={18} />
          </span>
        </button>
      )}

      <footer className="public-menu-footer">
        <p>Powered by Smart Menu</p>
      </footer>

      {cartOpen && (
        <div
          className="order-overlay"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setCartOpen(false);
            }
          }}
        >
          <section
            className="order-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="cart-title"
          >
            <div className="order-panel-header">
              <div>
                <h2 id="cart-title">Your order</h2>
                <p>
                  {tableOrders.length > 0
                    ? `${tableOrders.length} ${tableOrders.length === 1 ? "order" : "orders"}`
                    : `${cartCount} ${cartCount === 1 ? "item" : "items"}`}
                </p>
              </div>

              <button
                type="button"
                className="order-close-button"
                onClick={() => setCartOpen(false)}
                aria-label="Close cart"
              >
                <X size={22} />
              </button>
            </div>

            {tableOrders.length > 0 ? (
              <div className="my-order-details">
                {tableOrders.map((order) => (
                  <article className="my-table-order" key={order.order_number}>
                    <div className="my-order-summary">
                      <span>Order number</span>
                      <strong>#{order.order_number}</strong>

                      <span>Table</span>
                      <strong>{order.table_number || menu.table_number || "—"}</strong>

                      <span>Order status</span>
                      <strong>
                        {ORDER_STATUS_LABELS[order.status] || order.status}
                      </strong>

                      <span>Total</span>
                      <strong>{formatMoney(order.total_amount)}</strong>
                    </div>

                    <h3>Items in this order</h3>
                    {(order.items || []).map((item) => (
                      <article className="my-order-item" key={item.id}>
                        <div>
                          <strong>{item.dish_name}</strong>
                          <p>
                            {item.quantity} × {formatMoney(item.unit_price)}
                          </p>
                          {item.special_instructions && <p>{item.special_instructions}</p>}
                        </div>
                        <div className="my-order-item-right">
                          <strong>{formatMoney(item.line_total)}</strong>
                          <span className={`my-item-status status-${item.status || "pending"}`}>
                            {(item.status || "pending").replaceAll("_", " ")}
                          </span>
                        </div>
                      </article>
                    ))}

                    <button
                      type="button"
                      className="order-secondary-button"
                      onClick={async () => {
                        try {
                          const latest = await getOrderStatus(order.order_number);
                          setTableOrders((current) => current.map((entry) =>
                            entry.order_number === latest.order_number ? latest : entry
                          ));
                          if (activeOrder?.order_number === latest.order_number) {
                            setActiveOrder(latest);
                          }
                          setTrackingError("");
                        } catch (err) {
                          setTrackingError(
                            err.response?.data?.detail || "Unable to refresh order status."
                          );
                        }
                      }}
                    >
                      <RefreshCw size={16} />
                      Refresh this order
                    </button>
                  </article>
                ))}

                {trackingError && <p className="order-inline-error">{trackingError}</p>}
              </div>
            ) : cart.length === 0 ? (
              <div className="order-empty-state">
                <ShoppingBag size={38} />
                <h3>No order placed yet</h3>
                <p>
                  Add dishes from the menu and place your order to track it
                  here.
                </p>
                <button type="button" onClick={() => setCartOpen(false)}>
                  Browse menu
                </button>
              </div>
            ) : (
              // Keep your existing cart-items and checkout JSX here.
              <div className="order-cart-items">
                {cart.map((item) => (
                  <article className="order-cart-item" key={item.dish.id}>
                    <div className="order-cart-item-top">
                      <div className="order-cart-item-info">
                        <strong>{item.dish.name}</strong>
                        <span>{formatMoney(item.dish.price)} each</span>
                      </div>

                      <button
                        type="button"
                        className="order-remove-button"
                        onClick={() => removeFromCart(item.dish.id)}
                        aria-label={`Remove ${item.dish.name}`}
                      >
                        <Trash2 size={17} />
                      </button>
                    </div>

                    <div className="order-cart-item-bottom">
                      <div className="order-quantity-control">
                        <button
                          type="button"
                          onClick={() => updateQuantity(item.dish.id, -1)}
                          aria-label={`Decrease ${item.dish.name} quantity`}
                        >
                          <Minus size={15} />
                        </button>

                        <span>{item.quantity}</span>

                        <button
                          type="button"
                          disabled={item.quantity >= 20}
                          onClick={() => updateQuantity(item.dish.id, 1)}
                          aria-label={`Increase ${item.dish.name} quantity`}
                        >
                          <Plus size={15} />
                        </button>
                      </div>

                      <strong>
                        {formatMoney(Number(item.dish.price) * item.quantity)}
                      </strong>
                    </div>

                    <label className="order-instructions-label">
                      Special instructions
                      <textarea
                        rows={2}
                        maxLength={500}
                        placeholder="e.g. Less spicy, no onions"
                        value={item.special_instructions}
                        onChange={(event) =>
                          updateInstructions(item.dish.id, event.target.value)
                        }
                      />
                    </label>
                  </article>
                ))}

                <div className="order-cart-summary">
                  <div>
                    <span>Subtotal</span>
                    <strong>{formatMoney(cartSubtotal)}</strong>
                  </div>
                  <p>Taxes or additional charges are not included.</p>

                  <button
                    type="button"
                    className="order-primary-button"
                    onClick={() => {
                      setCheckoutError("");
                      setCartOpen(false);
                      setCheckoutOpen(true);
                    }}
                  >
                    Continue to checkout
                  </button>
                </div>
              </div>
            )}
          </section>
        </div>
      )}

      {checkoutOpen && (
        <div className="order-overlay">
          <section
            className="order-panel checkout-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="checkout-title"
          >
            <div className="order-panel-header">
              <div>
                <h2 id="checkout-title">Checkout</h2>
                <p>Dining at {menu.branch_name || "this branch"}</p>
              </div>

              <button
                type="button"
                className="order-close-button"
                onClick={() => {
                  if (!submittingOrder) {
                    setCheckoutOpen(false);
                    setCartOpen(true);
                  }
                }}
                disabled={submittingOrder}
                aria-label="Back to cart"
              >
                <X size={22} />
              </button>
            </div>

            <form className="order-checkout-form" onSubmit={submitOrder}>
              <label>
                Your name <span>(optional)</span>
                <input
                  type="text"
                  maxLength={100}
                  value={customerName}
                  onChange={(event) => setCustomerName(event.target.value)}
                  placeholder="Enter your name"
                  autoComplete="name"
                />
              </label>

              <label>
                Note for the restaurant <span>(optional)</span>
                <textarea
                  rows={3}
                  maxLength={1000}
                  value={customerNote}
                  onChange={(event) => setCustomerNote(event.target.value)}
                  placeholder="Any additional requests?"
                />
              </label>

              <div className="order-checkout-summary">
                <span>{cartCount} items</span>
                <strong>{formatMoney(cartSubtotal)}</strong>
              </div>

              <p className="order-payment-note">
                Dine-in order · Pay at the counter or as instructed by staff.
              </p>

              {checkoutError && (
                <div className="order-form-error" role="alert">
                  {typeof checkoutError === "string"
                    ? checkoutError
                    : "One or more items are unavailable. Refresh the menu and try again."}
                </div>
              )}

              <button
                type="submit"
                className="order-primary-button"
                disabled={submittingOrder || cart.length === 0}
              >
                {submittingOrder ? (
                  <>
                    <Clock size={17} />
                    Placing order...
                  </>
                ) : (
                  <>
                    <ClipboardCheck size={18} />
                    Place order · {formatMoney(cartSubtotal)}
                  </>
                )}
              </button>

              <button
                type="button"
                className="order-secondary-button"
                disabled={submittingOrder}
                onClick={() => {
                  setCheckoutOpen(false);
                  setCartOpen(true);
                }}
              >
                Back to cart
              </button>
            </form>
          </section>
        </div>
      )}

    </div>
  );
}

export default PublicMenu;
