import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  CircleDollarSign,
  ClipboardList,
  Minus,
  Plus,
  ReceiptText,
  Search,
  ShoppingBag,
  Trash2,
  Utensils,
} from "lucide-react";

import { getRestaurants } from "../api/restaurants";
import { getBranches } from "../api/branches";
import { getDishes } from "../api/dishes";
import { getCategories } from "../api/categories";
import { getTables } from "../api/tables";
import { createPOSOrder } from "../api/pos";
import { createCustomer, getCustomers } from "../api/customers";
import { createBill, markBillPaid } from "../api/bills";
import { getBranchOrders } from "../api/orders";

import "./POS.css";

const money = (value) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(Number(value || 0));

const toAmount = (value) =>
  Math.round((Number(value) + Number.EPSILON) * 100) / 100;

export default function POS() {
  const navigate = useNavigate();

  const [branches, setBranches] = useState([]);
  const [branchId, setBranchId] = useState(
    localStorage.getItem("selected_branch_id") || "",
  );

  const [dishes, setDishes] = useState([]);
  const [menuCategories, setMenuCategories] = useState([]);
  const [tables, setTables] = useState([]);
  const [orders, setOrders] = useState([]);
  const [cart, setCart] = useState([]);

  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [tableId, setTableId] = useState("");

  const [customerName, setCustomerName] = useState("");
  const [customerNumber, setCustomerNumber] = useState("");
  const [customerNote, setCustomerNote] = useState("");
  const [customerId, setCustomerId] = useState(null);
  const [customerSearch, setCustomerSearch] = useState("");
  const [customerResults, setCustomerResults] = useState([]);
  const [customerSearchLoading, setCustomerSearchLoading] = useState(false);
  const [customerSaving, setCustomerSaving] = useState(false);

  const [discount, setDiscount] = useState("0");
  const [taxRate, setTaxRate] = useState("0");

  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [collectPayment, setCollectPayment] = useState(false);

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  // Load restaurants and branches belonging to the signed-in account.
  useEffect(() => {
    let cancelled = false;

    async function loadBranches() {
      try {
        const restaurants = await getRestaurants();

        const groups = await Promise.all(
          (Array.isArray(restaurants) ? restaurants : []).map(
            async (restaurant) => {
              const rows = await getBranches(restaurant.id);

              return (Array.isArray(rows) ? rows : []).map((branch) => ({
                ...branch,
                restaurant_name: restaurant.name,
              }));
            },
          ),
        );

        const allBranches = groups.flat();

        if (cancelled) return;

        setBranches(allBranches);

        const saved = localStorage.getItem("selected_branch_id") || "";

        const initial = allBranches.some((item) => String(item.id) === saved)
          ? saved
          : String(allBranches[0]?.id || "");

        setBranchId(initial);

        if (initial) {
          localStorage.setItem("selected_branch_id", initial);
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err.response?.data?.detail ||
              "Could not load your restaurant branches.",
          );
        }
      }
    }

    loadBranches();

    return () => {
      cancelled = true;
    };
  }, []);

  // Search saved customers only within the currently selected branch.
  useEffect(() => {
    if (!branchId || !customerSearch.trim()) {
      setCustomerResults([]);
      setCustomerSearchLoading(false);
      return undefined;
    }

    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setCustomerSearchLoading(true);
      try {
        const rows = await getCustomers(branchId, {
          search: customerSearch.trim(),
          limit: 10,
          offset: 0,
        });
        const customers = Array.isArray(rows)
          ? rows
          : Array.isArray(rows?.items)
            ? rows.items
            : Array.isArray(rows?.customers)
              ? rows.customers
              : [];
        if (!cancelled) setCustomerResults(customers);
      } catch {
        if (!cancelled) setCustomerResults([]);
      } finally {
        if (!cancelled) setCustomerSearchLoading(false);
      }
    }, 300);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [branchId, customerSearch]);

  function selectCustomer(customer) {
    setCustomerId(customer.id);
    setCustomerName(customer.name || "");
    setCustomerNumber(String(customer.phone || "").replace(/\D/g, "").slice(0, 10));
    setCustomerSearch(customer.name || customer.phone || "");
    setCustomerResults([]);
    setNotice(`Selected saved customer: ${customer.name}.`);
    setError("");
  }

  async function saveCurrentCustomer() {
    if (!branchId) return;
    const normalizedPhone = customerNumber.replace(/\D/g, "");
    if (!customerName.trim()) {
      setError("Enter the customer's name before saving the customer record.");
      return;
    }
    if (!/^[6-9]\d{9}$/.test(normalizedPhone)) {
      setError("Enter a valid 10-digit Indian mobile number before saving.");
      return;
    }

    setCustomerSaving(true);
    setError("");
    try {
      const customer = await createCustomer(branchId, {
        name: customerName.trim(),
        phone: normalizedPhone,
      });
      setCustomerId(customer.id);
      setCustomerSearch(customer.name || customerName.trim());
      setCustomerResults([]);
      setNotice(`Customer ${customer.name || customerName.trim()} saved successfully.`);
    } catch (err) {
      const detail = err.response?.data?.detail;
      setError(
        err.response?.status === 409
          ? "A customer with this mobile number already exists in this branch. Search and select that customer."
          : typeof detail === "string"
            ? detail
            : "Could not save this customer. Please try again.",
      );
    } finally {
      setCustomerSaving(false);
    }
  }

  // Load menu, tables and recent orders for the selected branch.
  const refreshBranchData = useCallback(async () => {
    if (!branchId) {
      setDishes([]);
      setMenuCategories([]);
      setTables([]);
      setOrders([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError("");

    try {
      const [dishRows, categoryRows, tableRows, orderRows] = await Promise.all([
        getDishes(branchId),
        getCategories(branchId),
        getTables(branchId),
        getBranchOrders(branchId),
      ]);

      const safeCategories = Array.isArray(categoryRows) ? categoryRows : [];

      const categoryNames = new Map(
        safeCategories.map((item) => [item.id, item.name]),
      );

      setMenuCategories(safeCategories);

      setDishes(
        (Array.isArray(dishRows) ? dishRows : []).map((dish) => ({
          ...dish,
          category_name: categoryNames.get(dish.category_id) || "",
        })),
      );

      const activeTables = (Array.isArray(tableRows) ? tableRows : []).filter(
        (table) => table.is_active !== false,
      );

      setTables(activeTables);

      setTableId((currentId) => {
        if (!currentId) return "";

        const selectedTable = activeTables.find(
          (table) => String(table.id) === currentId,
        );

        return selectedTable && !selectedTable.is_occupied ? currentId : "";
      });

      setOrders((Array.isArray(orderRows) ? orderRows : []).slice(0, 6));
    } catch (err) {
      setError(
        err.response?.data?.detail ||
          "Could not load the POS menu. Please refresh and try again.",
      );
    } finally {
      setLoading(false);
    }
  }, [branchId]);

  useEffect(() => {
    if (!tableId) return;

    const selectedTable = tables.find(
      (table) => String(table.id) === String(tableId),
    );

    if (selectedTable?.is_occupied === true) {
      setTableId("");
      setError(
        "The selected table is now occupied. Please choose another table or takeaway.",
      );
    }
  }, [tableId, tables]);

  useEffect(() => {
    refreshBranchData();
  }, [refreshBranchData]);

  useEffect(() => {
    const handleFocus = () => {
      refreshBranchData();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        refreshBranchData();
      }
    };

    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [refreshBranchData]);

  const categories = useMemo(
    () =>
      menuCategories
        .filter((item) => item.is_active !== false)
        .map((item) => item.name)
        .sort((a, b) => a.localeCompare(b)),
    [menuCategories],
  );

  const filteredDishes = useMemo(
    () =>
      dishes.filter((dish) => {
        if (dish.is_available === false) return false;

        const dishCategory = dish.category?.name || dish.category_name || "";

        const matchesCategory = category === "all" || dishCategory === category;

        const term = search.trim().toLowerCase();

        const matchesSearch =
          !term ||
          [
            dish.name,
            dish.description,
            dish.ingredients,
            dish.category?.name,
            dish.category_name,
          ].some((value) =>
            String(value || "")
              .toLowerCase()
              .includes(term),
          );

        return matchesCategory && matchesSearch;
      }),
    [dishes, category, search],
  );

  const subtotal = useMemo(
    () =>
      toAmount(
        cart.reduce((sum, item) => sum + Number(item.price) * item.quantity, 0),
      ),
    [cart],
  );

  const discountAmount = Math.min(subtotal, Math.max(0, Number(discount) || 0));

  const taxableAmount = Math.max(0, subtotal - discountAmount);

  const taxAmount = toAmount(
    (taxableAmount * Math.min(100, Math.max(0, Number(taxRate) || 0))) / 100,
  );

  const total = toAmount(taxableAmount + taxAmount);

  function addDish(dish) {
    setCart((current) => {
      const existing = current.find((item) => item.id === dish.id);

      if (existing) {
        return current.map((item) =>
          item.id === dish.id
            ? {
                ...item,
                quantity: Math.min(20, item.quantity + 1),
              }
            : item,
        );
      }

      return [
        ...current,
        {
          id: dish.id,
          name: dish.name,
          price: Number(dish.price),
          image_url: dish.image_url,
          quantity: 1,
        },
      ];
    });

    setNotice("");
  }

  function changeQuantity(dishId, amount) {
    setCart((current) =>
      current
        .map((item) =>
          item.id === dishId
            ? {
                ...item,
                quantity: item.quantity + amount,
              }
            : item,
        )
        .filter((item) => item.quantity > 0),
    );
  }

  async function submitOrder(event) {
    event.preventDefault();

    if (!branchId) {
      setError("Create a restaurant branch before using POS.");
      return;
    }

    if (!cart.length) {
      setError("Add at least one dish to the order.");
      return;
    }
    const normalizedCustomerNumber = customerNumber.replace(/\D/g, "");

    if (!/^[6-9]\d{9}$/.test(normalizedCustomerNumber)) {
      setError("Enter a valid 10-digit Indian mobile number.");
      return;
    }

    if (
      !Number.isFinite(Number(discount)) ||
      Number(discount) < 0 ||
      Number(discount) > subtotal
    ) {
      setError("Discount must be between ₹0 and the subtotal.");
      return;
    }

    if (
      !Number.isFinite(Number(taxRate)) ||
      Number(taxRate) < 0 ||
      Number(taxRate) > 100
    ) {
      setError("Tax rate must be between 0% and 100%.");
      return;
    }

    if (
      collectPayment &&
      !window.confirm(
        `Confirm that you have actually received ${money(
          total,
        )} by ${paymentMethod.toUpperCase()}?`,
      )
    ) {
      return;
    }

    setSubmitting(true);
    setError("");
    setNotice("");

    let createdOrder = null;
    let createdBill = null;

    try {
      // The backend must calculate authoritative order prices.
      createdOrder = await createPOSOrder(branchId, {
        ...(tableId ? { table_id: Number(tableId) } : {}),
        ...(customerId ? { customer_id: customerId } : {}),
        customer_name: customerName.trim() || null,
        customer_number: normalizedCustomerNumber,
        customer_note: customerNote.trim() || null,
        items: cart.map((item) => ({
          dish_id: item.id,
          quantity: item.quantity,
        })),
      });

      createdBill = await createBill(branchId, createdOrder.id, {
        discount_amount: Number(discount).toFixed(2),
        tax_rate: Number(taxRate).toFixed(2),
      });

      if (collectPayment) {
        await markBillPaid(branchId, createdBill.id, paymentMethod);
      }

      setCart([]);
      setCustomerName("");
      setCustomerNumber("");
      setCustomerNote("");
      setCustomerId(null);
      setCustomerSearch("");
      setCustomerResults([]);
      setDiscount("0");
      setTaxRate("0");
      setTableId("");
      setCollectPayment(false);

      setNotice(
        collectPayment
          ? "Order created, bill generated, and staff-confirmed payment recorded."
          : "Order created and bill generated successfully.",
      );

      await refreshBranchData();

      navigate(`/dashboard/bills/${createdBill.id}`, {
        state: {
          bill: {
            ...createdBill,
            payment_status: collectPayment
              ? "paid"
              : createdBill.payment_status,
            payment_method: collectPayment
              ? paymentMethod
              : createdBill.payment_method,
          },
          order: createdBill.order || createdOrder,
          restaurant: {
            name: createdBill.restaurant_name,
          },
          branch: {
            name: createdBill.branch_name,
          },
        },
      });
    } catch (err) {
      const detail =
        err.response?.data?.detail ||
        err.message ||
        "Unable to complete the POS transaction.";

      if (createdOrder && !createdBill) {
        setError(
          `Order ${
            createdOrder.order_number || `#${createdOrder.id}`
          } was created, but bill creation failed. Check Bills & Receipts before retrying. Details: ${detail}`,
        );
      } else if (createdBill) {
        setError(
          `Bill ${createdBill.bill_number || createdBill.id} was created, but a later step failed. Check the bill's payment status before retrying. Details: ${detail}`,
        );
      } else {
        setError(detail);
      }

      await refreshBranchData();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="pos-page">
      <header className="pos-header">
        <div>
          <p className="pos-eyebrow">RESTAURANT OPERATIONS</p>
          <h1>Point of Sale</h1>
          <p className="pos-subtitle">
            Create dine-in or takeaway orders, generate bills, and record
            received payments.
          </p>
        </div>

        <label className="pos-branch-picker">
          <span>Branch</span>
          <select
            value={branchId}
            onChange={(event) => {
              const value = event.target.value;

              setBranchId(value);

              if (value) {
                localStorage.setItem("selected_branch_id", value);
              }

              setCart([]);
              setTableId("");
              setCustomerId(null);
              setCustomerSearch("");
              setCustomerResults([]);
              setError("");
              setNotice("");
            }}
          >
            <option value="">Select a branch</option>

            {branches.map((branch) => (
              <option key={branch.id} value={String(branch.id)}>
                {branch.restaurant_name} · {branch.name}
              </option>
            ))}
          </select>
        </label>
      </header>

      {error && (
        <div className="pos-alert pos-alert-error" role="alert">
          <AlertCircle size={18} />
          <span>{error}</span>
        </div>
      )}

      {notice && (
        <div className="pos-alert pos-alert-success" role="status">
          <CheckCircle2 size={18} />
          <span>{notice}</span>
        </div>
      )}

      {!loading && !branches.length && (
        <section className="pos-empty">
          <Utensils size={32} />
          <h2>No branch available</h2>
          <p>Create a restaurant and branch before using the POS.</p>
        </section>
      )}

      <div className="pos-workspace">
        <section className="pos-menu-panel">
          <div className="pos-panel-heading">
            <div>
              <h2>Menu</h2>
              <p>{filteredDishes.length} available dishes</p>
            </div>

            <span className="pos-pill">
              <Utensils size={14} />
              Quick order
            </span>
          </div>

          <div className="pos-search">
            <Search size={18} />

            <input
              aria-label="Search dishes"
              placeholder="Search dishes or ingredients…"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>

          <div className="pos-categories">
            <button
              className={category === "all" ? "active" : ""}
              onClick={() => setCategory("all")}
              type="button"
            >
              All items
            </button>

            {categories.map((name) => (
              <button
                key={name}
                type="button"
                className={category === name ? "active" : ""}
                onClick={() => setCategory(name)}
              >
                {name}
              </button>
            ))}
          </div>

          {loading ? (
            <div className="pos-loading">Loading menu…</div>
          ) : !filteredDishes.length ? (
            <div className="pos-empty-inline">
              No available dishes match your search.
            </div>
          ) : (
            <div className="pos-dish-grid">
              {filteredDishes.map((dish) => (
                <button
                  className="pos-dish-card"
                  key={dish.id}
                  type="button"
                  onClick={() => addDish(dish)}
                >
                  {dish.image_url ? (
                    <img src={dish.image_url} alt="" loading="lazy" />
                  ) : (
                    <div className="pos-dish-placeholder">
                      <Utensils size={26} />
                    </div>
                  )}

                  <span className="pos-dish-card-body">
                    <strong>{dish.name}</strong>
                    <span>
                      {dish.category?.name || dish.category_name || "Menu item"}
                    </span>
                    <b>{money(dish.price)}</b>
                  </span>

                  <span className="pos-add-icon">
                    <Plus size={18} />
                  </span>
                </button>
              ))}
            </div>
          )}
        </section>

        <aside className="pos-checkout-panel">
          <div className="pos-panel-heading">
            <div>
              <h2>Current order</h2>
              <p>{cart.reduce((sum, item) => sum + item.quantity, 0)} items</p>
            </div>

            <span className="pos-cart-icon">
              <ShoppingBag size={19} />
            </span>
          </div>

          <form onSubmit={submitOrder}>
            <label className="pos-field">
              <span>Table / service type</span>

              <span className="pos-select-wrap">
                <select
                  value={tableId}
                  onChange={(event) => setTableId(event.target.value)}
                >
                  <option value="">Takeaway / counter order</option>

                  {tables.map((table) => (
                    <option
                      key={table.id}
                      value={String(table.id)}
                      disabled={table.is_occupied === true}
                    >
                      Table {table.table_number}
                      {table.is_occupied
                        ? " — Occupied (unpaid bill)"
                        : " — Available"}
                    </option>
                  ))}
                </select>

                <ChevronDown size={16} />
              </span>
            </label>

            <div className="pos-field">
              <span>Find saved customer</span>
              <div className="pos-search">
                <Search size={16} />
                <input
                  value={customerSearch}
                  onChange={(event) => {
                    setCustomerSearch(event.target.value);
                    setCustomerId(null);
                    setNotice("");
                  }}
                  placeholder="Search name, phone, or email…"
                  autoComplete="off"
                  aria-label="Search saved customers"
                />
              </div>
              {customerSearchLoading && (
                <small className="pos-field-help">Searching customers…</small>
              )}
              {!customerSearchLoading && customerSearch.trim() && customerResults.length > 0 && (
                <div className="pos-customer-results" role="listbox" aria-label="Customer search results">
                  {customerResults.map((customer) => (
                    <button
                      key={customer.id}
                      className="pos-customer-result"
                      type="button"
                      onClick={() => selectCustomer(customer)}
                    >
                      <strong>{customer.name}</strong>
                      <span>{customer.phone}{customer.email ? ` · ${customer.email}` : ""}</span>
                    </button>
                  ))}
                </div>
              )}
              {!customerSearchLoading && customerSearch.trim() && !customerResults.length && (
                <small className="pos-field-help">No saved customer found. You can enter their details below and save them.</small>
              )}
              {customerId && (
                <small className="pos-field-help">Saved customer selected — this order will be linked to their history.</small>
              )}
            </div>

            <label className="pos-field">
              <span>Customer name (optional)</span>
              <input
                value={customerName}
                onChange={(event) => {
                  setCustomerName(event.target.value);
                  setCustomerId(null);
                }}
                maxLength={100}
                placeholder="Customer name"
              />
            </label>

            <label className="pos-field">
              <span>Customer mobile number *</span>
              <input
                type="tel"
                inputMode="numeric"
                autoComplete="tel-national"
                value={customerNumber}
                onChange={(event) => {
                  setCustomerNumber(event.target.value.replace(/\D/g, "").slice(0, 10));
                  setCustomerId(null);
                }}
                placeholder="10-digit mobile number"
                required
                minLength={10}
                maxLength={10}
                pattern="[6-9][0-9]{9}"
                title="Enter a valid 10-digit Indian mobile number"
                aria-label="Required customer mobile number"
              />
              <small className="pos-field-help">
                Required for every POS order.
              </small>
            </label>

            {!customerId && customerName.trim() && /^[6-9]\d{9}$/.test(customerNumber) && (
              <button
                className="pos-link-button"
                type="button"
                onClick={saveCurrentCustomer}
                disabled={customerSaving}
              >
                {customerSaving ? "Saving customer…" : "Save as a customer record"}
              </button>
            )}

            <label className="pos-field">
              <span>Order note (optional)</span>
              <input
                value={customerNote}
                onChange={(event) => setCustomerNote(event.target.value)}
                maxLength={1000}
                placeholder="Special requests"
              />
            </label>

            <div className="pos-cart-items">
              {!cart.length ? (
                <div className="pos-cart-empty">
                  <ShoppingBag size={28} />
                  <strong>Your order is empty</strong>
                  <span>Tap a menu item to add it.</span>
                </div>
              ) : (
                cart.map((item) => (
                  <div className="pos-cart-item" key={item.id}>
                    <div className="pos-cart-item-info">
                      <strong>{item.name}</strong>
                      <span>{money(item.price)} each</span>
                      <b>{money(item.price * item.quantity)}</b>
                    </div>

                    <div className="pos-quantity-control">
                      <button
                        type="button"
                        aria-label={`Decrease ${item.name}`}
                        onClick={() => changeQuantity(item.id, -1)}
                      >
                        <Minus size={14} />
                      </button>

                      <span>{item.quantity}</span>

                      <button
                        type="button"
                        aria-label={`Increase ${item.name}`}
                        disabled={item.quantity >= 20}
                        onClick={() => changeQuantity(item.id, 1)}
                      >
                        <Plus size={14} />
                      </button>

                      <button
                        className="pos-remove"
                        type="button"
                        aria-label={`Remove ${item.name}`}
                        onClick={() =>
                          setCart((current) =>
                            current.filter((row) => row.id !== item.id),
                          )
                        }
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="pos-adjustments">
              <label className="pos-field">
                <span>Discount (₹)</span>
                <input
                  type="number"
                  min="0"
                  max={subtotal}
                  step="0.01"
                  value={discount}
                  onChange={(event) => setDiscount(event.target.value)}
                />
              </label>

              <label className="pos-field">
                <span>Tax rate (%)</span>
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  value={taxRate}
                  onChange={(event) => setTaxRate(event.target.value)}
                />
              </label>
            </div>

            <div className="pos-totals">
              <div>
                <span>Subtotal</span>
                <strong>{money(subtotal)}</strong>
              </div>

              <div>
                <span>Discount</span>
                <strong>−{money(discountAmount)}</strong>
              </div>

              <div>
                <span>Tax</span>
                <strong>{money(taxAmount)}</strong>
              </div>

              <div className="pos-grand-total">
                <span>Total due</span>
                <strong>{money(total)}</strong>
              </div>
            </div>

            <label className="pos-payment-toggle">
              <input
                type="checkbox"
                checked={collectPayment}
                onChange={(event) => setCollectPayment(event.target.checked)}
              />

              <span>
                <strong>Record payment now</strong>
                <small>
                  Only check this after money has actually been received.
                </small>
              </span>
            </label>

            {collectPayment && (
              <label className="pos-field">
                <span>Payment method</span>

                <select
                  value={paymentMethod}
                  onChange={(event) => setPaymentMethod(event.target.value)}
                >
                  <option value="cash">Cash</option>
                  <option value="upi">UPI</option>
                  <option value="card">Card</option>
                  <option value="other">Other</option>
                </select>
              </label>
            )}

            <button
              className="pos-submit"
              type="submit"
              disabled={
                submitting ||
                loading ||
                !branchId ||
                !cart.length ||
                !/^[6-9]\d{9}$/.test(customerNumber)
              }
            >
              {submitting ? (
                "Processing…"
              ) : (
                <>
                  <ReceiptText size={18} />
                  Create order &amp; bill
                </>
              )}
            </button>

            <p className="pos-payment-note">
              <CircleDollarSign size={14} />
              Payment recording is a staff confirmation, not automatic bank or
              UPI verification.
            </p>
          </form>
        </aside>
      </div>

      <section className="pos-recent-orders">
        <div className="pos-panel-heading">
          <div>
            <h2>Recent orders</h2>
            <p>Latest activity for this branch</p>
          </div>

          <button
            className="pos-link-button"
            type="button"
            onClick={() => navigate("/dashboard/orders")}
          >
            <ClipboardList size={16} />
            View all
          </button>
        </div>

        {!orders.length ? (
          <p className="pos-empty-inline">No orders yet for this branch.</p>
        ) : (
          <div className="pos-recent-grid">
            {orders.map((order) => (
              <article
                className="pos-recent-card"
                key={order.id || order.order_number}
              >
                <div>
                  <strong>
                    #{String(order.order_number || order.id).slice(-8)}
                  </strong>

                  <span>
                    {order.table_number === "Takeaway"
                      ? "Takeaway"
                      : `Table ${order.table_number}`}
                  </span>
                </div>

                <b>{money(order.total_amount)}</b>

                <span
                  className={`pos-status pos-status-${String(
                    order.status || "pending",
                  ).toLowerCase()}`}
                >
                  {order.status || "pending"}
                </span>
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
