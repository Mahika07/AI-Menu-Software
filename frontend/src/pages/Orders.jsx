import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import {
  ClipboardList,
  RefreshCw,
  Clock,
  CheckCircle2,
  ChefHat,
  Utensils,
  AlertCircle,
  Printer,
  ReceiptText,
  ExternalLink,
  History,
  Search,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";

import { getRestaurants } from "../api/restaurants";
import { getBranches } from "../api/branches";
import {
  getBranchOrders,
  getBranchOrderHistory,
  updateOrderStatus,
} from "../api/orders";
import { getBranchBills } from "../api/bills";
import GenerateBillModal from "../components/GenerateBillModal";

const HISTORY_PAGE_SIZE = 20;

const STATUS_LABELS = {
  pending: "Pending",
  confirmed: "Confirmed",
  preparing: "Preparing",
  ready: "Ready",
  completed: "Completed",
  cancelled: "Cancelled",
};

const NEXT_ACTIONS = {
  pending: { status: "confirmed", label: "Accept order" },
  confirmed: { status: "preparing", label: "Start preparing" },
  preparing: { status: "ready", label: "Mark ready" },
  ready: { status: "completed", label: "Complete order" },
};

const formatMoney = (value) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(Number(value || 0));

const formatDate = (value) => {
  if (!value) return "Time unavailable";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Time unavailable";
  }

  return date.toLocaleString("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  });
};

function escapeHtml(value) {
  const entities = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  };

  return String(value ?? "").replace(/[&<>"']/g, (char) => entities[char]);
}

function printOrderReceipt(order, restaurant, branch) {
  const itemsHtml = (order.items || [])
    .map(
      (item) => `
        <div class="item">
          <div class="item-info">
            <strong>${escapeHtml(item.dish_name)}</strong>
            <span>
              ${Number(item.quantity || 0)} ×
              ${formatMoney(item.unit_price)}
            </span>
            ${
              item.special_instructions
                ? `<small>Note: ${escapeHtml(item.special_instructions)}</small>`
                : ""
            }
          </div>
          <strong>${formatMoney(item.line_total)}</strong>
        </div>
      `,
    )
    .join("");

  const receiptWindow = window.open("", "_blank", "width=460,height=720");

  if (!receiptWindow) {
    window.alert("Please allow pop-ups in your browser to print the receipt.");
    return;
  }

  receiptWindow.document.write(`
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>Receipt - ${escapeHtml(order.order_number)}</title>
        <style>
          * { box-sizing: border-box; }
          body {
            margin: 0;
            padding: 28px;
            color: #202a35;
            font-family: Arial, Helvetica, sans-serif;
            font-size: 13px;
          }
          .receipt { width: 100%; max-width: 380px; margin: 0 auto; }
          .center { text-align: center; }
          h1 { margin: 0 0 6px; font-size: 23px; overflow-wrap: anywhere; }
          h3 { margin: 0 0 10px; }
          .muted { color: #687482; line-height: 1.6; overflow-wrap: anywhere; }
          .divider { margin: 18px 0; border: 0; border-top: 1px dashed #aeb6bf; }
          .details {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 14px 10px;
          }
          .detail-label { display: block; margin-bottom: 4px; color: #687482; font-size: 11px; }
          .details strong { overflow-wrap: anywhere; }
          .item {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            gap: 12px;
            padding: 12px 0;
            border-bottom: 1px solid #edf0f2;
          }
          .item-info { display: flex; flex-direction: column; gap: 5px; min-width: 0; }
          .item-info small { color: #687482; overflow-wrap: anywhere; }
          .item > strong { white-space: nowrap; }
          .total {
            display: flex;
            justify-content: space-between;
            gap: 12px;
            margin-top: 16px;
            font-size: 18px;
            font-weight: 700;
          }
          .status {
            margin-top: 16px;
            text-align: center;
            text-transform: uppercase;
            font-weight: 700;
            letter-spacing: 1px;
          }
          .actions { display: flex; justify-content: center; gap: 10px; margin-top: 28px; }
          button {
            padding: 10px 16px;
            border: 0;
            border-radius: 7px;
            background: #14344a;
            color: white;
            cursor: pointer;
          }
          button.secondary { background: #e9edf0; color: #202a35; }
          @media print {
            body { padding: 0; }
            .actions { display: none; }
            @page { margin: 10mm; }
          }
        </style>
      </head>
      <body>
        <main class="receipt">
          <header class="center">
            <h1>${escapeHtml(restaurant?.name || "Restaurant")}</h1>
            <div class="muted">
              ${escapeHtml(branch?.name || "")}<br />
              ${escapeHtml(branch?.address || "")}
              ${branch?.phone ? `<br />${escapeHtml(branch.phone)}` : ""}
            </div>
          </header>

          <hr class="divider" />

          <div class="details">
            <div>
              <span class="detail-label">Order number</span>
              <strong>#${escapeHtml(order.order_number)}</strong>
            </div>
            <div>
              <span class="detail-label">Table</span>
              <strong>${escapeHtml(order.table_number || "N/A")}</strong>
            </div>
            <div>
              <span class="detail-label">Order date</span>
              <strong>${escapeHtml(formatDate(order.created_at))}</strong>
            </div>
            <div>
              <span class="detail-label">Customer</span>
              <strong>${escapeHtml(order.customer_name || "Walk-in")}</strong>
            </div>
          </div>

          <hr class="divider" />
          <h3>Order items</h3>
          ${itemsHtml}

          <div class="total">
            <span>Total</span>
            <span>${formatMoney(order.total_amount)}</span>
          </div>

          <div class="status">
            ${escapeHtml(STATUS_LABELS[order.status] || order.status || "Pending")}
          </div>

          ${
            order.customer_note
              ? `<hr class="divider" /><strong>Customer note</strong><p>${escapeHtml(order.customer_note)}</p>`
              : ""
          }

          <hr class="divider" />
          <p class="center muted">Thank you for dining with us!</p>

          <div class="actions">
            <button onclick="window.print()">Print receipt</button>
            <button class="secondary" onclick="window.close()">Close</button>
          </div>
        </main>
      </body>
    </html>
  `);

  receiptWindow.document.close();
}

function Orders() {
  const navigate = useNavigate();

  const [restaurants, setRestaurants] = useState([]);
  const [branches, setBranches] = useState([]);
  const [orders, setOrders] = useState([]);
  const [bills, setBills] = useState([]);

  const [restaurantId, setRestaurantId] = useState("");
  const [branchId, setBranchId] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  const [loadingRestaurants, setLoadingRestaurants] = useState(true);
  const [loadingBranches, setLoadingBranches] = useState(false);
  const [loadingOrders, setLoadingOrders] = useState(false);
  const [loadingBills, setLoadingBills] = useState(false);
  const [updatingOrderId, setUpdatingOrderId] = useState(null);

  const [billingOrder, setBillingOrder] = useState(null);
  const [error, setError] = useState("");
  const [lastUpdated, setLastUpdated] = useState(null);

  const [activeTab, setActiveTab] = useState("live");

  const [historyOrders, setHistoryOrders] = useState([]);
  const [historySearch, setHistorySearch] = useState("");
  const [historyStatus, setHistoryStatus] = useState("");
  const [historyTable, setHistoryTable] = useState("");
  const [historyStartDate, setHistoryStartDate] = useState("");
  const [historyEndDate, setHistoryEndDate] = useState("");
  const [historyPage, setHistoryPage] = useState(0);
  const [historyTotal, setHistoryTotal] = useState(0);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [historyError, setHistoryError] = useState("");

  // Load restaurants.
  useEffect(() => {
    let cancelled = false;

    async function loadRestaurants() {
      try {
        setLoadingRestaurants(true);
        setError("");

        const data = await getRestaurants();

        if (cancelled) return;

        setRestaurants(data);

        if (data.length > 0) {
          setRestaurantId(String(data[0].id));
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err.response?.data?.detail || "Unable to load your restaurants.",
          );
        }
      } finally {
        if (!cancelled) setLoadingRestaurants(false);
      }
    }

    loadRestaurants();

    return () => {
      cancelled = true;
    };
  }, []);

  // Load branches when the restaurant changes.
  useEffect(() => {
    let cancelled = false;

    async function loadBranches() {
      setBranches([]);
      setBranchId("");
      setOrders([]);
      setBills([]);
      setHistoryOrders([]);
      setHistoryTotal(0);
      setHistoryPage(0);

      if (!restaurantId) {
        setLoadingBranches(false);
        return;
      }

      try {
        setLoadingBranches(true);
        setError("");

        const data = await getBranches(restaurantId);

        if (cancelled) return;

        setBranches(data);

        if (data.length > 0) {
          setBranchId(String(data[0].id));
        }
      } catch (err) {
        if (!cancelled) {
          setError(err.response?.data?.detail || "Unable to load branches.");
        }
      } finally {
        if (!cancelled) setLoadingBranches(false);
      }
    }

    loadBranches();

    return () => {
      cancelled = true;
    };
  }, [restaurantId]);

  // Load live orders.
  const loadOrders = useCallback(
    async (showLoader = false) => {
      if (!branchId) {
        setOrders([]);
        return;
      }

      try {
        if (showLoader) setLoadingOrders(true);

        const data = await getBranchOrders(branchId, statusFilter);

        setOrders(Array.isArray(data) ? data : []);
        setLastUpdated(new Date());
      } catch (err) {
        setError(
          err.response?.data?.detail ||
            "Unable to load orders. Please try again.",
        );
      } finally {
        if (showLoader) setLoadingOrders(false);
      }
    },
    [branchId, statusFilter],
  );

  // Load paginated order history.
  const loadOrderHistory = useCallback(async () => {
    if (!branchId) {
      setHistoryOrders([]);
      setHistoryTotal(0);
      return;
    }

    try {
      setLoadingHistory(true);
      setHistoryError("");

      const result = await getBranchOrderHistory(branchId, {
        search: historySearch,
        status: historyStatus,
        tableNumber: historyTable,
        startDate: historyStartDate,
        endDate: historyEndDate,
        limit: HISTORY_PAGE_SIZE,
        offset: historyPage * HISTORY_PAGE_SIZE,
      });

      setHistoryOrders(Array.isArray(result.items) ? result.items : []);
      setHistoryTotal(Number(result.total || 0));
    } catch (err) {
      setHistoryError(
        err.response?.data?.detail ||
          "Unable to load order history. Please try again.",
      );
    } finally {
      setLoadingHistory(false);
    }
  }, [
    branchId,
    historySearch,
    historyStatus,
    historyTable,
    historyStartDate,
    historyEndDate,
    historyPage,
  ]);

  useEffect(() => {
    if (activeTab === "history") {
      loadOrderHistory();
    }
  }, [activeTab, loadOrderHistory]);

  // Load bills for the selected branch.
  const loadBills = useCallback(
    async (showLoader = false) => {
      if (!branchId) {
        setBills([]);
        return;
      }

      try {
        if (showLoader) setLoadingBills(true);

        const data = await getBranchBills(branchId);

        const billList = Array.isArray(data)
          ? data
          : Array.isArray(data?.items)
            ? data.items
            : Array.isArray(data?.results)
              ? data.results
              : [];

        setBills(billList);
      } catch (err) {
        setError(
          err.response?.data?.detail ||
            "Unable to load existing bills. Billing status may be outdated.",
        );
      } finally {
        if (showLoader) setLoadingBills(false);
      }
    },
    [branchId],
  );

  // Refresh live orders and bills every 15 seconds.
  useEffect(() => {
    if (!branchId) {
      setOrders([]);
      setBills([]);
      return undefined;
    }

    loadOrders(true);
    loadBills(true);

    const intervalId = window.setInterval(() => {
      loadOrders(false);
      loadBills(false);
    }, 15000);

    return () => window.clearInterval(intervalId);
  }, [branchId, loadOrders, loadBills]);

  function getBillForOrder(orderId) {
    return bills.find((bill) => String(bill.order_id) === String(orderId));
  }

  async function handleStatusChange(order, nextStatus) {
    if (!branchId || updatingOrderId !== null) return;

    if (order.id == null) {
      setError(
        "This order is missing its database ID. Check the owner order API response.",
      );
      return;
    }

    const actionLabel = STATUS_LABELS[nextStatus] || nextStatus;
    const orderLabel = String(order.order_number || order.id).slice(0, 8);

    const confirmed = window.confirm(
      `Change order ${orderLabel} to "${actionLabel}"?`,
    );

    if (!confirmed) return;

    try {
      setUpdatingOrderId(order.id);
      setError("");

      await updateOrderStatus(branchId, order.id, nextStatus);
      await loadOrders(false);
    } catch (err) {
      setError(err.response?.data?.detail || "Could not update this order.");
    } finally {
      setUpdatingOrderId(null);
    }
  }

  function handleGenerateBill(order) {
    if (!branchId || order.id == null) {
      setError("A valid branch and order are required to generate a bill.");
      return;
    }

    const existingBill = getBillForOrder(order.id);

    if (existingBill) {
      handleViewBill(existingBill, order);
      return;
    }

    setError("");
    setBillingOrder(order);
  }

  function handleViewBill(bill, fallbackOrder = null) {
    if (!bill) return;

    localStorage.setItem("selected_branch_id", String(branchId));

    navigate(`/dashboard/bills/${bill.id}`, {
      state: {
        bill,
        order: bill.order || fallbackOrder,
        restaurant: {
          name:
            bill.restaurant_name || selectedRestaurant?.name || "Restaurant",
        },
        branch: {
          name: bill.branch_name || selectedBranch?.name || "",
        },
      },
    });
  }

  async function handleBillGenerated(bill) {
    const order = bill.order || billingOrder;

    setBillingOrder(null);
    setError("");

    await loadBills(false);

    localStorage.setItem("selected_branch_id", String(branchId));

    navigate(`/dashboard/bills/${bill.id}`, {
      state: {
        bill,
        order,
        restaurant: {
          name:
            bill.restaurant_name || selectedRestaurant?.name || "Restaurant",
        },
        branch: {
          name: bill.branch_name || selectedBranch?.name || "",
        },
      },
    });
  }

  const activeCount = orders.filter((order) =>
    ["pending", "confirmed", "preparing", "ready"].includes(order.status),
  ).length;

  const selectedRestaurant = restaurants.find(
    (item) => String(item.id) === String(restaurantId),
  );

  const selectedBranch = branches.find(
    (item) => String(item.id) === String(branchId),
  );

  if (loadingRestaurants) {
    return (
      <div className="page">
        <div className="loading">Loading restaurants...</div>
      </div>
    );
  }

  return (
    <div className="page orders-page">
      <div className="page-header">
        <div>
          <h1>Orders</h1>
          <p>Manage dine-in orders and review previous transactions.</p>
        </div>

        <button
          type="button"
          className="secondary-button"
          onClick={() => {
            if (activeTab === "history") {
              loadOrderHistory();
            } else {
              loadOrders(true);
              loadBills(true);
            }
          }}
          disabled={
            !branchId ||
            (activeTab === "history"
              ? loadingHistory
              : loadingOrders || loadingBills)
          }
        >
          <RefreshCw size={17} />
          Refresh
        </button>
      </div>

      <section className="orders-toolbar">
        <label>
          Restaurant
          <select
            value={restaurantId}
            onChange={(event) => setRestaurantId(event.target.value)}
            disabled={restaurants.length === 0}
          >
            {restaurants.length === 0 && (
              <option value="">No restaurants found</option>
            )}

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
            onChange={(event) => {
              setBranchId(event.target.value);
              setHistoryPage(0);
            }}
            disabled={loadingBranches || branches.length === 0}
          >
            {branches.length === 0 && (
              <option value="">
                {loadingBranches ? "Loading branches..." : "No branches found"}
              </option>
            )}

            {branches.map((branch) => (
              <option key={branch.id} value={branch.id}>
                {branch.name}
              </option>
            ))}
          </select>
        </label>
      </section>

      <div className="orders-tabs" role="tablist" aria-label="Order views">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "live"}
          className={`orders-tab ${activeTab === "live" ? "active" : ""}`}
          onClick={() => setActiveTab("live")}
        >
          <ClipboardList size={17} />
          Live Orders
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "history"}
          className={`orders-tab ${activeTab === "history" ? "active" : ""}`}
          onClick={() => setActiveTab("history")}
        >
          <History size={17} />
          Order History
          <span className="orders-tab-count">{historyTotal}</span>
        </button>
      </div>

      {activeTab === "live" && (
        <>
          {error && (
            <div className="error-message" role="alert">
              <AlertCircle size={18} />
              {error}
            </div>
          )}

          <section className="orders-toolbar">
            <label>
              Status
              <select
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value)}
              >
                <option value="">All orders</option>
                <option value="pending">Pending</option>
                <option value="confirmed">Confirmed</option>
                <option value="preparing">Preparing</option>
                <option value="ready">Ready</option>
                <option value="completed">Completed</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </label>
          </section>

          <section className="orders-summary-row">
            <div className="orders-summary-card">
              <span>Orders shown</span>
              <strong>{orders.length}</strong>
            </div>

            <div className="orders-summary-card">
              <span>Active orders shown</span>
              <strong>{activeCount}</strong>
            </div>

            <div className="orders-last-updated">
              {lastUpdated
                ? `Updated ${lastUpdated.toLocaleTimeString("en-IN")}`
                : "Waiting for orders"}
              <span>Auto-refreshes every 15 seconds</span>
            </div>
          </section>

          {!branchId && !loadingBranches ? (
            <div className="empty-state">
              <ClipboardList size={38} />
              <h2>No branch selected</h2>
              <p>Create a restaurant branch before managing orders.</p>
            </div>
          ) : loadingOrders ? (
            <div className="loading">Loading orders...</div>
          ) : orders.length === 0 ? (
            <div className="empty-state">
              <ClipboardList size={40} />
              <h2>No orders found</h2>
              <p>
                New customer orders placed through this branch&apos;s table QR
                codes will appear here.
              </p>
            </div>
          ) : (
            <div className="orders-grid">
              {orders.map((order) => {
                const nextAction = NEXT_ACTIONS[order.status];
                const updating = updatingOrderId === order.id;
                const existingBill = getBillForOrder(order.id);
                const billCheckPending = loadingBills && !existingBill;

                return (
                  <article
                    className="owner-order-card"
                    key={order.id ?? order.order_number}
                  >
                    <header className="owner-order-header">
                      <div>
                        <span className="owner-order-number">
                          Order #
                          {String(order.order_number || order.id).slice(0, 8)}
                        </span>

                        <h2>
                          {order.table_number
                            ? `Table ${order.table_number}`
                            : "Takeaway / No table"}
                        </h2>

                        <span className="owner-order-time">
                          <Clock size={14} />
                          {formatDate(order.created_at)}
                        </span>
                      </div>

                      <span
                        className={`order-status-badge status-${order.status}`}
                      >
                        {STATUS_LABELS[order.status] || order.status}
                      </span>
                    </header>

                    {order.customer_name && (
                      <p className="owner-order-customer">
                        Customer: <strong>{order.customer_name}</strong>
                      </p>
                    )}

                    {order.customer_note && (
                      <div className="owner-order-note">
                        <strong>Customer note</strong>
                        <p>{order.customer_note}</p>
                      </div>
                    )}

                    <div className="owner-order-items">
                      {(order.items || []).map((item, index) => (
                        <div
                          className="owner-order-item"
                          key={item.id ?? `${item.dish_name}-${index}`}
                        >
                          <div>
                            <strong>
                              {item.quantity} × {item.dish_name}
                            </strong>

                            {item.special_instructions && (
                              <p>{item.special_instructions}</p>
                            )}
                          </div>

                          <span>{formatMoney(item.line_total)}</span>
                        </div>
                      ))}
                    </div>

                    <div className="owner-order-total">
                      <span>Total</span>
                      <strong>{formatMoney(order.total_amount)}</strong>
                    </div>

                    {existingBill && (
                      <div className="owner-order-note">
                        <strong>Bill generated</strong>
                        <p>
                          {existingBill.bill_number} ·{" "}
                          {formatMoney(existingBill.total_amount)} ·{" "}
                          {existingBill.payment_status || "unpaid"}
                        </p>
                      </div>
                    )}

                    <footer className="owner-order-actions">
                      {order.status === "completed" &&
                        (existingBill ? (
                          <button
                            type="button"
                            className="primary-button"
                            onClick={() => handleViewBill(existingBill, order)}
                          >
                            <ExternalLink size={16} />
                            View Bill
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="primary-button"
                            onClick={() => handleGenerateBill(order)}
                            disabled={
                              updatingOrderId !== null ||
                              loadingBills ||
                              billCheckPending
                            }
                          >
                            <ReceiptText size={16} />
                            {loadingBills
                              ? "Checking bill..."
                              : "Generate Bill"}
                          </button>
                        ))}

                      <button
                        type="button"
                        className="secondary-button"
                        onClick={() =>
                          printOrderReceipt(
                            order,
                            selectedRestaurant,
                            selectedBranch,
                          )
                        }
                      >
                        <Printer size={16} />
                        Print receipt
                      </button>

                      {nextAction && (
                        <button
                          type="button"
                          className="primary-button"
                          disabled={updating || updatingOrderId !== null}
                          onClick={() =>
                            handleStatusChange(order, nextAction.status)
                          }
                        >
                          {updating ? (
                            "Updating..."
                          ) : (
                            <>
                              {order.status === "pending" && (
                                <CheckCircle2 size={16} />
                              )}

                              {order.status === "confirmed" && (
                                <ChefHat size={16} />
                              )}

                              {order.status === "preparing" && (
                                <Utensils size={16} />
                              )}

                              {nextAction.label}
                            </>
                          )}
                        </button>
                      )}

                      {["pending", "confirmed", "preparing"].includes(
                        order.status,
                      ) && (
                        <button
                          type="button"
                          className="danger-button"
                          disabled={updating || updatingOrderId !== null}
                          onClick={() => handleStatusChange(order, "cancelled")}
                        >
                          Cancel
                        </button>
                      )}
                    </footer>
                  </article>
                );
              })}
            </div>
          )}

          {billingOrder && branchId && (
            <GenerateBillModal
              order={billingOrder}
              branchId={branchId}
              onClose={() => setBillingOrder(null)}
              onGenerated={handleBillGenerated}
            />
          )}
        </>
      )}

      {activeTab === "history" && (
        <section className="order-history">
          <div className="order-history-heading">
            <div>
              <h2>Order History</h2>
              <p>Search and review previous orders for the selected branch.</p>
            </div>

            <button
              type="button"
              className="secondary-button"
              onClick={loadOrderHistory}
              disabled={!branchId || loadingHistory}
            >
              <RefreshCw size={16} />
              Refresh
            </button>
          </div>

          {historyError && (
            <div className="error-message" role="alert">
              <AlertCircle size={18} />
              {historyError}
            </div>
          )}

          <div className="order-history-filters">
            <label>
              Search orders
              <div className="order-history-search">
                <Search size={17} />
                <input
                  type="search"
                  placeholder="Order number or customer"
                  value={historySearch}
                  onChange={(event) => {
                    setHistorySearch(event.target.value);
                    setHistoryPage(0);
                  }}
                />
              </div>
            </label>

            <label>
              Status
              <select
                value={historyStatus}
                onChange={(event) => {
                  setHistoryStatus(event.target.value);
                  setHistoryPage(0);
                }}
              >
                <option value="">All statuses</option>
                <option value="pending">Pending</option>
                <option value="confirmed">Confirmed</option>
                <option value="preparing">Preparing</option>
                <option value="ready">Ready</option>
                <option value="completed">Completed</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </label>

            <label>
              Table number
              <input
                type="text"
                placeholder="Any table"
                value={historyTable}
                onChange={(event) => {
                  setHistoryTable(event.target.value);
                  setHistoryPage(0);
                }}
              />
            </label>

            <label>
              From date
              <input
                type="date"
                value={historyStartDate}
                max={historyEndDate || undefined}
                onChange={(event) => {
                  setHistoryStartDate(event.target.value);
                  setHistoryPage(0);
                }}
              />
            </label>

            <label>
              To date
              <input
                type="date"
                value={historyEndDate}
                min={historyStartDate || undefined}
                onChange={(event) => {
                  setHistoryEndDate(event.target.value);
                  setHistoryPage(0);
                }}
              />
            </label>

            <button
              type="button"
              className="secondary-button"
              onClick={() => {
                setHistorySearch("");
                setHistoryStatus("");
                setHistoryTable("");
                setHistoryStartDate("");
                setHistoryEndDate("");
                setHistoryPage(0);
              }}
            >
              Clear filters
            </button>
          </div>

          <div className="order-history-summary">
            <span>
              {historyTotal} {historyTotal === 1 ? "order" : "orders"} found
            </span>
            <span>Page {historyPage + 1}</span>
          </div>

          {loadingHistory ? (
            <div className="loading">Loading order history...</div>
          ) : historyOrders.length === 0 ? (
            <div className="empty-state">
              <History size={38} />
              <h2>No matching orders</h2>
              <p>Try changing your search or filters.</p>
            </div>
          ) : (
            <div className="order-history-list">
              {historyOrders.map((order) => (
                <article
                  className="order-history-card"
                  key={order.id ?? order.order_number}
                >
                  <div className="order-history-card-top">
                    <div>
                      <strong>
                        Order #
                        {String(order.order_number || order.id).slice(0, 8)}
                      </strong>
                      <p>{formatDate(order.created_at)}</p>
                    </div>

                    <span
                      className={`order-status-badge status-${order.status}`}
                    >
                      {STATUS_LABELS[order.status] || order.status}
                    </span>
                  </div>

                  <div className="order-history-card-details">
                    <span>
                      Table: {order.table_number || "Takeaway / No table"}
                    </span>
                    <span>Customer: {order.customer_name || "Walk-in"}</span>
                    <strong>{formatMoney(order.total_amount)}</strong>
                  </div>

                  <div className="order-history-items">
                    {(order.items || []).map((item, index) => (
                      <div
                        key={item.id ?? `${item.dish_name}-${index}`}
                        className="order-history-item"
                      >
                        <span>
                          {item.quantity} × {item.dish_name}
                        </span>
                        <span>{formatMoney(item.line_total)}</span>
                      </div>
                    ))}
                  </div>

                  {order.customer_note && (
                    <p className="order-history-note">
                      <strong>Note:</strong> {order.customer_note}
                    </p>
                  )}

                  <div className="order-history-actions">
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={() =>
                        printOrderReceipt(
                          order,
                          selectedRestaurant,
                          selectedBranch,
                        )
                      }
                    >
                      <Printer size={16} />
                      Print receipt
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}

          <div className="order-history-pagination">
            <button
              type="button"
              className="secondary-button"
              disabled={historyPage === 0 || loadingHistory}
              onClick={() => setHistoryPage((page) => Math.max(0, page - 1))}
            >
              <ChevronLeft size={17} />
              Previous
            </button>

            <span>
              {historyTotal === 0
                ? "0 orders"
                : `${historyPage * HISTORY_PAGE_SIZE + 1}–${Math.min(
                    (historyPage + 1) * HISTORY_PAGE_SIZE,
                    historyTotal,
                  )} of ${historyTotal}`}
            </span>

            <button
              type="button"
              className="secondary-button"
              disabled={
                loadingHistory ||
                (historyPage + 1) * HISTORY_PAGE_SIZE >= historyTotal
              }
              onClick={() => setHistoryPage((page) => page + 1)}
            >
              Next
              <ChevronRight size={17} />
            </button>
          </div>
        </section>
      )}
    </div>
  );
}

export default Orders;
