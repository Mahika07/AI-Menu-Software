import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  ChefHat,
  Clock,
  Maximize2,
  Minimize2,
  RefreshCw,
  Utensils,
} from "lucide-react";
import { getRestaurants } from "../api/restaurants";
import { getBranches } from "../api/branches";
import { getBranchOrders, updateOrderItemStatus } from "../api/orders";

const ORDER_STATUSES = [
  "pending",
  "confirmed",
  "preparing",
  "ready",
  "completed",
  "cancelled",
];

const ITEM_LABELS = {
  pending: "Pending",
  preparing: "Preparing",
  ready: "Ready",
  served: "Served",
  cancelled: "Cancelled",
};

const ORDER_LABELS = {
  pending: "Pending",
  confirmed: "Confirmed",
  preparing: "Preparing",
  ready: "Ready",
  completed: "Completed",
  cancelled: "Cancelled",
};

const NEXT_ITEM_STATUSES = {
  pending: ["preparing", "cancelled"],
  preparing: ["ready", "cancelled"],
  ready: ["served"],
  served: [],
  cancelled: [],
};

const ACTIVE = ["pending", "confirmed", "preparing", "ready"];
const OVERDUE_MINUTES = 15;

function formatMoney(value) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(Number(value || 0));
}

function getElapsedMinutes(value, now) {
  const timestamp = value ? new Date(value).getTime() : NaN;

  return Number.isFinite(timestamp)
    ? Math.max(0, Math.floor((now - timestamp) / 60000))
    : 0;
}

function formatElapsed(minutes) {
  const hours = Math.floor(minutes / 60);
  return hours ? `${hours}h ${minutes % 60}m` : `${minutes}m`;
}

function NEXT_ITEM_STATUSES_SAFE(status) {
  return NEXT_ITEM_STATUSES[status || "pending"] || [];
}

function KitchenDisplay() {
  const [restaurants, setRestaurants] = useState([]);
  const [branches, setBranches] = useState([]);
  const [orders, setOrders] = useState([]);
  const [restaurantId, setRestaurantId] = useState("");
  const [branchId, setBranchId] = useState("");
  const [statusFilter, setStatusFilter] = useState("active");
  const [tableFilter, setTableFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadingOrders, setLoadingOrders] = useState(false);
  const [updatingItemId, setUpdatingItemId] = useState(null);
  const [error, setError] = useState("");
  const [lastUpdated, setLastUpdated] = useState(null);
  const [now, setNow] = useState(Date.now());
  const [isFullscreen, setIsFullscreen] = useState(
    Boolean(document.fullscreenElement),
  );

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);

    const onFullscreen = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };

    document.addEventListener("fullscreenchange", onFullscreen);

    return () => {
      window.clearInterval(timer);
      document.removeEventListener("fullscreenchange", onFullscreen);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadRestaurants() {
      try {
        const data = await getRestaurants();

        if (!cancelled) {
          const list = Array.isArray(data) ? data : [];
          setRestaurants(list);

          if (list.length) {
            setRestaurantId(String(list[0].id));
          }
        }
      } catch (err) {
        if (!cancelled) {
          setError(err.response?.data?.detail || "Unable to load restaurants.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadRestaurants();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    setBranches([]);
    setBranchId("");
    setOrders([]);
    setTableFilter("");

    if (!restaurantId) return undefined;

    async function loadBranches() {
      try {
        const data = await getBranches(restaurantId);

        if (!cancelled) {
          const list = Array.isArray(data) ? data : [];
          setBranches(list);

          if (list.length) {
            setBranchId(String(list[0].id));
          }
        }
      } catch (err) {
        if (!cancelled) {
          setError(err.response?.data?.detail || "Unable to load branches.");
        }
      }
    }

    loadBranches();

    return () => {
      cancelled = true;
    };
  }, [restaurantId]);

  const loadOrders = useCallback(
    async (showLoader = false) => {
      if (!branchId) {
        setOrders([]);
        return;
      }

      try {
        if (showLoader) setLoadingOrders(true);

        const data = await getBranchOrders(branchId, "");
        const list = Array.isArray(data) ? data : [];

        const sortedOrders = [...list].sort((a, b) => {
          const dateA = new Date(a.created_at || 0).getTime();
          const dateB = new Date(b.created_at || 0).getTime();
          return dateB - dateA;
        });

        setOrders(sortedOrders);
        setLastUpdated(new Date());
        setError("");
      } catch (err) {
        setError(
          err.response?.data?.detail || "Unable to load kitchen orders.",
        );
      } finally {
        if (showLoader) setLoadingOrders(false);
      }
    },
    [branchId],
  );

  useEffect(() => {
    if (!branchId) return undefined;

    loadOrders(true);

    const interval = window.setInterval(() => loadOrders(false), 5000);

    return () => window.clearInterval(interval);
  }, [branchId, loadOrders]);

  async function changeItemStatus(order, item, nextStatus) {
    if (!branchId || updatingItemId !== null) return;

    const currentStatus = item.status || "pending";

    if (!NEXT_ITEM_STATUSES_SAFE(currentStatus).includes(nextStatus)) {
      setError("That status change is not allowed.");
      return;
    }

    if (nextStatus === "cancelled") {
      const confirmed = window.confirm(
        `Cancel "${item.dish_name}" (${item.quantity} ×)? This action cannot be undone from the kitchen display.`,
      );

      if (!confirmed) return;
    }

    try {
      setUpdatingItemId(item.id);
      setError("");

      await updateOrderItemStatus(branchId, order.id, item.id, nextStatus);

      await loadOrders(false);
    } catch (err) {
      setError(err.response?.data?.detail || "Unable to update this item.");
    } finally {
      setUpdatingItemId(null);
    }
  }

  async function toggleFullscreen() {
    try {
      const page = document.querySelector(".kitchen-page");

      if (!document.fullscreenElement) {
        await (page || document.documentElement).requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
    } catch {
      setError(
        "Fullscreen could not be opened. Use your browser's fullscreen shortcut instead.",
      );
    }
  }

  const tableOptions = useMemo(
    () =>
      [
        ...new Set(
          orders
            .map((order) => String(order.table_number ?? ""))
            .filter(Boolean),
        ),
      ].sort((a, b) => a.localeCompare(b, undefined, { numeric: true })),
    [orders],
  );

  const visibleOrders = useMemo(
    () =>
      orders
        .filter((order) => {
          const statusMatches =
            statusFilter === "all" ||
            (statusFilter === "active"
              ? ACTIVE.includes(order.status)
              : order.status === statusFilter);

          const tableMatches =
            !tableFilter || String(order.table_number ?? "") === tableFilter;

          return statusMatches && tableMatches;
        })
        .sort(
          (a, b) =>
            new Date(b.created_at || 0).getTime() -
            new Date(a.created_at || 0).getTime(),
        ),
    [orders, statusFilter, tableFilter],
  );

  const groupedOrders = useMemo(
    () =>
      visibleOrders.reduce((groups, order) => {
        const key = String(order.table_number || "Unknown table");

        if (!groups[key]) groups[key] = [];
        groups[key].push(order);

        return groups;
      }, {}),
    [visibleOrders],
  );

  const activeCount = orders.filter((order) =>
    ACTIVE.includes(order.status),
  ).length;

  const preparingItems = orders.reduce(
    (count, order) =>
      count +
      (order.items || []).filter((item) => item.status === "preparing").length,
    0,
  );

  const readyItems = orders.reduce(
    (count, order) =>
      count +
      (order.items || []).filter((item) => item.status === "ready").length,
    0,
  );

  const overdueItems = orders.reduce(
    (count, order) =>
      count +
      (order.items || []).filter(
        (item) =>
          item.status === "preparing" &&
          getElapsedMinutes(item.status_updated_at || order.created_at, now) >=
            OVERDUE_MINUTES,
      ).length,
    0,
  );

  if (loading) {
    return (
      <div className="page kitchen-page">
        <div className="loading">Loading restaurants...</div>
      </div>
    );
  }

  return (
    <main className="page kitchen-page">
      <header className="kitchen-header">
        <div className="kitchen-heading">
          <div className="kitchen-heading-icon">
            <ChefHat size={26} />
          </div>

          <div>
            <h1>Kitchen Display</h1>
            <p>Manage each dish separately and group orders by table.</p>
          </div>
        </div>

        <div className="kitchen-header-actions">
          <button
            type="button"
            className="kitchen-toolbar-button"
            onClick={() => loadOrders(true)}
            disabled={!branchId || loadingOrders}
          >
            <RefreshCw
              size={17}
              className={loadingOrders ? "kitchen-spinning" : ""}
            />
            Refresh
          </button>

          <button
            type="button"
            className="kitchen-toolbar-button"
            onClick={toggleFullscreen}
          >
            {isFullscreen ? <Minimize2 size={17} /> : <Maximize2 size={17} />}
            {isFullscreen ? "Exit Full Screen" : "Full Screen"}
          </button>
        </div>
      </header>

      {error && (
        <div className="kitchen-error" role="alert">
          <AlertCircle size={18} />
          <span>{error}</span>
        </div>
      )}

      <section className="kitchen-toolbar kitchen-toolbar-enhanced">
        <label>
          Restaurant
          <select
            value={restaurantId}
            onChange={(e) => setRestaurantId(e.target.value)}
          >
            <option value="">Choose restaurant</option>
            {restaurants.map((restaurant) => (
              <option key={restaurant.id} value={restaurant.id}>
                {restaurant.name}
              </option>
            ))}
          </select>
        </label>

        <label>
          Branch
          <select
            value={branchId}
            onChange={(e) => setBranchId(e.target.value)}
            disabled={!branches.length}
          >
            <option value="">Choose branch</option>
            {branches.map((branch) => (
              <option key={branch.id} value={branch.id}>
                {branch.name}
              </option>
            ))}
          </select>
        </label>

        <label>
          Order status
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="active">Active orders</option>
            <option value="all">All statuses</option>
            {ORDER_STATUSES.map((status) => (
              <option key={status} value={status}>
                {ORDER_LABELS[status]}
              </option>
            ))}
          </select>
        </label>

        <label>
          Table
          <select
            value={tableFilter}
            onChange={(e) => setTableFilter(e.target.value)}
          >
            <option value="">All tables</option>
            {tableOptions.map((table) => (
              <option key={table} value={table}>
                Table {table}
              </option>
            ))}
          </select>
        </label>

        <div className="kitchen-refresh-info">
          <span className="kitchen-live-dot" />
          Auto-refresh every 5 seconds
          <small>
            {lastUpdated
              ? `Updated ${lastUpdated.toLocaleTimeString("en-IN")}`
              : "Waiting for orders"}
          </small>
        </div>
      </section>

      <section className="kitchen-stats kitchen-stats-enhanced">
        <div className="kitchen-stat">
          <span>Active orders</span>
          <strong>{activeCount}</strong>
        </div>

        <div className="kitchen-stat">
          <span>Items preparing</span>
          <strong>{preparingItems}</strong>
        </div>

        <div className="kitchen-stat">
          <span>Items ready</span>
          <strong>{readyItems}</strong>
        </div>

        <div
          className={`kitchen-stat ${
            overdueItems ? "kitchen-stat-overdue" : ""
          }`}
        >
          <span>Overdue items</span>
          <strong>{overdueItems}</strong>
        </div>
      </section>

      {loadingOrders && orders.length === 0 ? (
        <div className="kitchen-empty">Loading orders…</div>
      ) : Object.keys(groupedOrders).length === 0 ? (
        <div className="kitchen-empty">
          <Utensils size={32} />
          <h2>No matching orders</h2>
          <p>Try another status or table filter.</p>
        </div>
      ) : (
        <div className="kitchen-table-groups">
          {Object.entries(groupedOrders).map(([tableNumber, tableOrders]) => (
            <section className="kitchen-table-group" key={tableNumber}>
              <header className="kitchen-table-group-header">
                <div>
                  <span className="kitchen-table-eyebrow">TABLE</span>
                  <h2>{tableNumber}</h2>
                </div>

                <span>
                  {tableOrders.length}{" "}
                  {tableOrders.length === 1 ? "order" : "orders"}
                </span>
              </header>

              <div className="kitchen-orders kitchen-orders-enhanced">
                {tableOrders.map((order) => (
                  <article
                    className={`kitchen-order kitchen-order-enhanced ${
                      order.status === "cancelled" ? "is-cancelled" : ""
                    }`}
                    key={order.id || order.order_number}
                  >
                    <header className="kitchen-order-header">
                      <div>
                        <span className="kitchen-order-number">
                          #{String(order.order_number || "").slice(0, 8)}
                        </span>

                        <p>
                          {order.customer_name || "Guest"} ·{" "}
                          {order.created_at
                            ? new Date(order.created_at).toLocaleTimeString(
                                "en-IN",
                                {
                                  hour: "2-digit",
                                  minute: "2-digit",
                                },
                              )
                            : "Time unavailable"}
                        </p>
                      </div>

                      <span
                        className={`kitchen-order-status status-${order.status}`}
                      >
                        {ORDER_LABELS[order.status] || order.status}
                      </span>
                    </header>

                    {order.customer_note && (
                      <p className="kitchen-customer-note">
                        Note: {order.customer_note}
                      </p>
                    )}

                    <div className="kitchen-item-list">
                      {(order.items || []).map((item) => {
                        const itemStatus = item.status || "pending";
                        const elapsed = getElapsedMinutes(
                          item.status_updated_at || order.created_at,
                          now,
                        );

                        const overdue =
                          itemStatus === "preparing" &&
                          elapsed >= OVERDUE_MINUTES;

                        const nextStatuses =
                          NEXT_ITEM_STATUSES_SAFE(itemStatus);

                        const isUpdating = updatingItemId === item.id;

                        return (
                          <div
                            className={`kitchen-item-row ${
                              overdue ? "is-overdue" : ""
                            }`}
                            key={item.id}
                          >
                            <div className="kitchen-item-main">
                              <div className="kitchen-item-title">
                                <strong>
                                  {item.quantity} × {item.dish_name}
                                </strong>

                                <span
                                  className={`kitchen-item-status item-status-${itemStatus}`}
                                >
                                  {ITEM_LABELS[itemStatus] || "Pending"}
                                </span>
                              </div>

                              {item.special_instructions && (
                                <p className="kitchen-item-instructions">
                                  {item.special_instructions}
                                </p>
                              )}

                              <small className="kitchen-item-timer">
                                <Clock size={13} />{" "}
                                {itemStatus === "preparing"
                                  ? `Preparing ${formatElapsed(elapsed)}`
                                  : `Updated ${formatElapsed(elapsed)} ago`}
                                {overdue && <b> · OVERDUE</b>}
                              </small>
                            </div>

                            <div className="kitchen-item-controls">
                              <select
                                aria-label={`Status for ${item.dish_name}`}
                                value={itemStatus}
                                disabled={!nextStatuses.length || isUpdating}
                                onChange={(e) =>
                                  changeItemStatus(order, item, e.target.value)
                                }
                              >
                                <option value={itemStatus}>
                                  {isUpdating
                                    ? "Updating…"
                                    : ITEM_LABELS[itemStatus] || "Pending"}
                                </option>

                                {nextStatuses.map((status) => (
                                  <option value={status} key={status}>
                                    {status === "cancelled"
                                      ? "Cancel dish…"
                                      : ITEM_LABELS[status]}
                                  </option>
                                ))}
                              </select>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    <footer className="kitchen-order-footer">
                      <span>{(order.items || []).length} line items</span>
                      <strong>{formatMoney(order.total_amount)}</strong>
                    </footer>
                  </article>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </main>
  );
}

export default KitchenDisplay;
