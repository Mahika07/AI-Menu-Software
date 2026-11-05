import { useEffect, useMemo, useState } from "react";
import { X, Receipt, ShoppingBag } from "lucide-react";
import { createBill, createSessionBill } from "../api/bills";
import "./GenerateBillModal.css";

const money = (value) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(value || 0));

const roundMoney = (value) =>
  Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;

const isCancelled = (item) =>
  String(item.status || "pending").toLowerCase() === "cancelled";

const getItemTotal = (item) =>
  item.line_total != null
    ? Number(item.line_total)
    : Number(item.unit_price || 0) * Number(item.quantity || 0);

export default function GenerateBillModal({
  order,
  orders: ordersProp,
  diningSessionId,
  branchId,
  onClose,
  onGenerated,
}) {
  const [discount, setDiscount] = useState("0");
  const [taxRate, setTaxRate] = useState("0");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const orders = useMemo(() => {
    if (Array.isArray(ordersProp) && ordersProp.length) return ordersProp;
    return order ? [order] : [];
  }, [ordersProp, order]);

  const isSessionBill = Boolean(diningSessionId);

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === "Escape" && !saving) onClose?.();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose, saving]);

  // Cancelled items are removed from the bill view and all bill calculations.
  const billOrders = useMemo(
    () =>
      orders
        .map((currentOrder, index) => ({
          ...currentOrder,
          displayLabel: `Order ${index + 1}`,
          billItems: (currentOrder.items || []).filter(
            (item) => !isCancelled(item),
          ),
        }))
        .filter((currentOrder) => currentOrder.billItems.length > 0),
    [orders],
  );

  const { subtotal, itemCount } = useMemo(() => {
    let amount = 0;
    let quantity = 0;
    billOrders.forEach((currentOrder) => {
      currentOrder.billItems.forEach((item) => {
        amount += getItemTotal(item);
        quantity += Number(item.quantity || 0);
      });
    });
    return { subtotal: roundMoney(amount), itemCount: quantity };
  }, [billOrders]);

  const discountAmount = discount.trim() === "" ? NaN : Number(discount);
  const rate = taxRate.trim() === "" ? NaN : Number(taxRate);
  const valid =
    Number.isFinite(discountAmount) &&
    Number.isFinite(rate) &&
    discountAmount >= 0 &&
    discountAmount <= subtotal &&
    rate >= 0 &&
    rate <= 100;

  const taxable = Math.max(0, subtotal - (valid ? discountAmount : 0));
  const tax = valid ? roundMoney((taxable * rate) / 100) : 0;
  const total = roundMoney(taxable + tax);

  async function handleSubmit(event) {
    event.preventDefault();
    if (!valid || saving || !branchId || orders.length === 0 || itemCount === 0)
      return;

    if (isSessionBill && !orders.some((currentOrder) => currentOrder.id)) {
      setError("No valid orders found in this dining session.");
      return;
    }

    try {
      setSaving(true);
      setError("");
      const payload = {
        discount_amount: discountAmount.toFixed(2),
        tax_rate: rate.toFixed(2),
      };
      const bill = isSessionBill
        ? await createSessionBill(branchId, diningSessionId, payload)
        : await createBill(branchId, orders[0].id, payload);
      onGenerated?.(bill);
    } catch (err) {
      setError(
        err.response?.data?.detail ||
          "Could not generate the bill. Please try again.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="generate-bill-overlay"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !saving) onClose?.();
      }}
    >
      <section
        className="generate-bill-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="generate-bill-title"
      >
        <header className="generate-bill-header">
          <div className="generate-bill-heading">
            <span className="generate-bill-icon">
              <Receipt size={22} />
            </span>
            <div>
              <h2 id="generate-bill-title">
                {isSessionBill ? "Consolidated bill" : "Generate bill"}
              </h2>
              <p>
                {isSessionBill
                  ? `Dining session #${diningSessionId}`
                  : orders[0]?.order_number || `Order #${orders[0]?.id || ""}`}
              </p>
            </div>
          </div>
          <button
            type="button"
            className="generate-bill-close"
            onClick={onClose}
            disabled={saving}
            aria-label="Close bill"
          >
            <X size={20} />
          </button>
        </header>

        <form className="generate-bill-form" onSubmit={handleSubmit}>
          <div className="generate-bill-stats">
            <div>
              <span>Table</span>
              <strong>{orders[0]?.table_number || "—"}</strong>
            </div>
            <div>
              <span>Orders</span>
              <strong>{orders.length}</strong>
            </div>
            <div>
              <span>Items</span>
              <strong>{itemCount}</strong>
            </div>
          </div>

          <section className="generate-bill-section">
            <div className="generate-bill-section-title">
              <div>
                <h3>Bill items</h3>
                <p>Only active items are included in this bill.</p>
              </div>
              <span className="generate-bill-item-count">
                <ShoppingBag size={15} /> {itemCount} items
              </span>
            </div>

            {billOrders.length === 0 ? (
              <div className="generate-bill-empty">
                No active items are available to bill.
              </div>
            ) : (
              billOrders.map((currentOrder) => (
                <div
                  className="generate-bill-order-entry"
                  key={currentOrder.id}
                >
                  {orders.length > 1 && (
                    <div className="generate-bill-order-heading">
                      {currentOrder.displayLabel}
                    </div>
                  )}
                  {currentOrder.billItems.map((item, index) => (
                    <div
                      className="generate-bill-item"
                      key={item.id ?? `${currentOrder.id}-${index}`}
                    >
                      <div className="generate-bill-item-info">
                        <strong>
                          {item.dish_name || item.name || "Menu item"}
                        </strong>
                        <span>
                          {item.quantity} × {money(item.unit_price)}
                        </span>
                      </div>
                      <strong className="generate-bill-item-price">
                        {money(getItemTotal(item))}
                      </strong>
                    </div>
                  ))}
                </div>
              ))
            )}
          </section>

          <section className="generate-bill-adjustments">
            <label className="generate-bill-field">
              <span>
                Discount <small>(₹)</small>
              </span>
              <input
                type="number"
                min="0"
                max={subtotal}
                step="0.01"
                value={discount}
                onChange={(event) => setDiscount(event.target.value)}
                required
              />
            </label>
            <label className="generate-bill-field">
              <span>
                Tax rate <small>(%)</small>
              </span>
              <input
                type="number"
                min="0"
                max="100"
                step="0.01"
                value={taxRate}
                onChange={(event) => setTaxRate(event.target.value)}
                required
              />
            </label>
          </section>

          <section className="generate-bill-totals">
            <div>
              <span>Subtotal</span>
              <strong>{money(subtotal)}</strong>
            </div>
            <div>
              <span>Discount</span>
              <strong>− {money(valid ? discountAmount : 0)}</strong>
            </div>
            <div>
              <span>Tax ({valid ? rate : 0}%)</span>
              <strong>{money(tax)}</strong>
            </div>
            <div className="generate-bill-grand-total">
              <span>Total due</span>
              <strong>{money(total)}</strong>
            </div>
          </section>

          {!valid && (
            <p className="generate-bill-error">
              Enter a discount between ₹0 and the subtotal, and a tax rate
              between 0% and 100%.
            </p>
          )}
          {error && <p className="generate-bill-error">{error}</p>}

          <footer className="generate-bill-footer">
            <button
              type="button"
              className="generate-bill-cancel"
              onClick={onClose}
              disabled={saving}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="generate-bill-submit"
              disabled={!valid || saving || !branchId || itemCount === 0}
            >
              {saving ? "Generating bill…" : `Generate bill · ${money(total)}`}
            </button>
          </footer>
        </form>
      </section>
    </div>
  );
}
