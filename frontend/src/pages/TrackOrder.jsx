import { useCallback, useEffect, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  ChefHat,
  ClipboardList,
  RefreshCw,
  Search,
  Utensils,
} from "lucide-react";

import { getOrderStatus } from "../api/orders";

const ORDER_STEPS = [
  { status: "pending", label: "Order placed", icon: ClipboardList },
  { status: "confirmed", label: "Order accepted", icon: CheckCircle2 },
  { status: "preparing", label: "Preparing", icon: ChefHat },
  { status: "ready", label: "Ready to serve", icon: Utensils },
  { status: "completed", label: "Completed", icon: CheckCircle2 },
];

const STATUS_LABELS = {
  pending: "Order placed",
  confirmed: "Order accepted",
  preparing: "Being prepared",
  ready: "Ready to serve",
  completed: "Completed",
  cancelled: "Cancelled",
};

const ITEM_STATUS_LABELS = {
  pending: "Waiting for preparation",
  preparing: "Being prepared",
  ready: "Ready to serve",
  served: "Served",
  cancelled: "Cancelled",
};

function formatMoney(value) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(Number(value || 0));
}

function formatDate(value) {
  if (!value) return "Not available";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "Not available";

  return date.toLocaleString("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function getStepIndex(status) {
  return ORDER_STEPS.findIndex((step) => step.status === status);
}

function TrackOrder() {
  const [orderNumber, setOrderNumber] = useState("");
  const [searchedOrderNumber, setSearchedOrderNumber] = useState("");
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(false);
  const [searchAttempted, setSearchAttempted] = useState(false);
  const [error, setError] = useState("");
  const [lastUpdated, setLastUpdated] = useState(null);

  const loadOrder = useCallback(async (number, showLoader = false) => {
    const normalizedNumber = String(number || "").trim();

    if (!normalizedNumber) {
      setError("Please enter your order number.");
      return;
    }

    try {
      if (showLoader) setLoading(true);

      const data = await getOrderStatus(normalizedNumber);

      setOrder(data);
      setSearchedOrderNumber(normalizedNumber);
      setLastUpdated(new Date());
      setError("");
    } catch (err) {
      if (err.response?.status === 404) {
        setOrder(null);
        setSearchedOrderNumber("");
        setError(
          "We couldn't find this order. Check the order number and try again.",
        );
      } else {
        setError(
          err.response?.data?.detail ||
            "Unable to retrieve your order. Please try again.",
        );
      }
    } finally {
      if (showLoader) setLoading(false);
    }
  }, []);

  function handleSubmit(event) {
    event.preventDefault();

    const number = orderNumber.trim();

    setSearchAttempted(true);
    setError("");
    setOrder(null);
    setLastUpdated(null);
    setSearchedOrderNumber("");

    if (!number) {
      setError("Please enter your order number.");
      return;
    }

    loadOrder(number, true);
  }

  // Refresh the currently searched order every five seconds.
  useEffect(() => {
    if (!order || !searchedOrderNumber) return undefined;

    if (["completed", "cancelled"].includes(order.status)) {
      return undefined;
    }

    let cancelled = false;

    const refresh = async () => {
      try {
        const data = await getOrderStatus(searchedOrderNumber);

        if (cancelled) return;

        setOrder(data);
        setLastUpdated(new Date());
        setError("");
      } catch (err) {
        if (cancelled) return;

        // Keep the last successfully loaded order visible if a
        // temporary network problem occurs.
        setError(
          err.response?.data?.detail ||
            "Live update failed. Your displayed order may be out of date.",
        );
      }
    };

    const intervalId = window.setInterval(refresh, 5000);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [order?.status, searchedOrderNumber]);

  const status = order?.status || "pending";
  const activeStepIndex = getStepIndex(status);
  const isCancelled = status === "cancelled";
  const isCompleted = status === "completed";
  const isTerminal = isCompleted || isCancelled;

  return (
    <main className="track-order-page">
      <div className="track-order-container">
        <header className="track-order-heading">
          <div className="track-order-brand-icon">
            <Utensils size={25} />
          </div>

          <span className="track-order-eyebrow">SMART MENU</span>
          <h1>Track your order</h1>
          <p>Follow your order from confirmation to preparation and serving.</p>
        </header>

        <form className="track-order-search" onSubmit={handleSubmit}>
          <label htmlFor="track-order-number">Order number</label>

          <div className="track-order-input-row">
            <input
              id="track-order-number"
              type="text"
              value={orderNumber}
              onChange={(event) => setOrderNumber(event.target.value)}
              placeholder="Enter your order number"
              autoComplete="off"
              required
            />

            <button type="submit" disabled={loading}>
              {loading ? (
                <RefreshCw size={17} className="track-order-spin" />
              ) : (
                <Search size={17} />
              )}
              Track
            </button>
          </div>

          <small>Use the order number shown after you placed your order.</small>
        </form>

        {error && (
          <div className="track-order-error" role="alert">
            <AlertCircle size={19} />
            <span>{error}</span>
          </div>
        )}

        {!order && !loading && !error && (
          <section className="track-order-empty">
            <ClipboardList size={36} />
            <h2>Your order journey starts here</h2>
            <p>Enter your order number above to see its current status.</p>
          </section>
        )}

        {searchAttempted && loading && !order && (
          <section className="track-order-empty">
            <RefreshCw size={30} className="track-order-spin" />
            <p>Looking up your order...</p>
          </section>
        )}

        {order && (
          <section className="track-order-result">
            <div className="track-order-result-header">
              <div>
                <span className="track-order-label">ORDER NUMBER</span>
                <h2>{order.order_number}</h2>
                <p>Placed {formatDate(order.created_at)}</p>
                {order.table_number != null && (
                  <p>Table {order.table_number}</p>
                )}
              </div>

              <span className={`track-order-status status-${order.status}`}>
                {STATUS_LABELS[order.status] || order.status}
              </span>
            </div>

            {isCancelled ? (
              <div className="track-order-cancelled">
                <AlertCircle size={24} />
                <div>
                  <h3>Order cancelled</h3>
                  <p>
                    This order has been cancelled. Please contact the restaurant
                    if you need assistance.
                  </p>
                </div>
              </div>
            ) : (
              <div className="track-order-timeline">
                {ORDER_STEPS.map((step, index) => {
                  const StepIcon = step.icon;
                  const isCurrent = index === activeStepIndex;
                  const isPast =
                    activeStepIndex >= 0 && index < activeStepIndex;
                  const isReached = isCurrent || isPast || isCompleted;

                  return (
                    <div
                      key={step.status}
                      className={`track-order-step ${
                        isReached ? "is-reached" : ""
                      } ${isCurrent ? "is-current" : ""}`}
                    >
                      <div className="track-order-step-marker">
                        <StepIcon size={18} />
                      </div>

                      <div className="track-order-step-content">
                        <strong>{step.label}</strong>

                        {isCurrent && (
                          <span>
                            {isCompleted
                              ? "Thank you for ordering!"
                              : "Current status"}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {Array.isArray(order.items) && order.items.length > 0 && (
              <div className="track-order-items">
                <h3>Your items</h3>

                {order.items.map((item, index) => {
                  const itemStatus = item.status || "pending";

                  return (
                    <div
                      className="track-order-item"
                      key={item.id ?? `${item.dish_name}-${index}`}
                    >
                      <div>
                        <strong>{item.dish_name}</strong>
                        <span>Quantity: {item.quantity}</span>

                        <span
                          className={`track-item-status item-status-${itemStatus}`}
                        >
                          {ITEM_STATUS_LABELS[itemStatus] || itemStatus}
                        </span>

                        {item.special_instructions && (
                          <small>{item.special_instructions}</small>
                        )}
                      </div>

                      <strong>{formatMoney(item.line_total)}</strong>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="track-order-total">
              <span>Total amount</span>
              <strong>{formatMoney(order.total_amount)}</strong>
            </div>

            <footer className="track-order-footer">
              <Clock size={15} />
              {lastUpdated
                ? `Last checked at ${lastUpdated.toLocaleTimeString("en-IN")}`
                : "Waiting for updates"}
              {!isTerminal && (
                <span> · Updates automatically every 5 seconds</span>
              )}
            </footer>

            <button
              type="button"
              className="track-order-refresh"
              onClick={() => loadOrder(searchedOrderNumber, true)}
              disabled={loading}
            >
              <RefreshCw
                size={16}
                className={loading ? "track-order-spin" : ""}
              />
              Refresh status
            </button>
          </section>
        )}
      </div>
    </main>
  );
}

export default TrackOrder;
