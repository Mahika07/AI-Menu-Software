import { useEffect, useMemo, useState } from "react";
import { X, Receipt } from "lucide-react";
import { createBill, createSessionBill } from "../api/bills";
import "./GenerateBillModal.css";

function money(value) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(Number(value || 0));
}

function roundMoney(value) {
  return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
}

function getItemTotal(item) {
  if (item.line_total != null) {
    return Number(item.line_total);
  }

  return Number(item.unit_price || 0) * Number(item.quantity || 0);
}

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
    if (Array.isArray(ordersProp) && ordersProp.length > 0) {
      return ordersProp;
    }

    return order ? [order] : [];
  }, [ordersProp, order]);

  const isSessionBill = Boolean(diningSessionId);

  useEffect(() => {
    function onKeyDown(event) {
      if (event.key === "Escape" && !saving) {
        onClose();
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose, saving]);

  const { subtotal, cancelledAmount, itemCount } = useMemo(() => {
    let activeTotal = 0;
    let cancelledTotal = 0;
    let quantity = 0;

    orders.forEach((currentOrder) => {
      (currentOrder.items || []).forEach((item) => {
        const itemQuantity = Number(item.quantity || 0);
        quantity += itemQuantity;

        if ((item.status || "pending").toLowerCase() === "cancelled") {
          cancelledTotal += getItemTotal(item);
        } else {
          activeTotal += getItemTotal(item);
        }
      });
    });

    return {
      subtotal: roundMoney(activeTotal),
      cancelledAmount: roundMoney(cancelledTotal),
      itemCount: quantity,
    };
  }, [orders]);

  const discountAmount = Number(discount);
  const rate = Number(taxRate);

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

    if (!valid || saving || !branchId || orders.length === 0) {
      return;
    }

    if (isSessionBill && !orders.some((item) => item.id)) {
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

      let bill;

      if (isSessionBill) {
        bill = await createSessionBill(branchId, diningSessionId, payload);
      } else {
        bill = await createBill(branchId, orders[0].id, payload);
      }

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
        if (event.target === event.currentTarget && !saving) {
          onClose();
        }
      }}
    >
      <section
        className="generate-bill-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="generate-bill-title"
      >
        <header className="generate-bill-header">
          <div>
            <span className="generate-bill-icon">
              <Receipt size={21} />
            </span>

            <div>
              <h2 id="generate-bill-title">
                Generate {isSessionBill ? "consolidated " : ""}bill
              </h2>

              <p>
                {isSessionBill
                  ? `Dining session #${diningSessionId}`
                  : `Order ${
                      orders[0]?.order_number || `#${orders[0]?.id || ""}`
                    }`}
              </p>
            </div>
          </div>

          <button
            type="button"
            className="generate-bill-close"
            onClick={onClose}
            disabled={saving}
            aria-label="Close"
          >
            <X size={20} />
          </button>
        </header>

        <form onSubmit={handleSubmit}>
          <div className="generate-bill-order">
            <span>Table</span>
            <strong>{orders[0]?.table_number || "—"}</strong>

            <span>Orders</span>
            <strong>{orders.length}</strong>

            <span>Items</span>
            <strong>{itemCount}</strong>
          </div>

          <div className="generate-bill-order-list">
            <h3>Order summary</h3>

            {orders.map((currentOrder) => (
              <div className="generate-bill-order-entry" key={currentOrder.id}>
                <div className="generate-bill-order-heading">
                  <strong>
                    {currentOrder.order_number || `Order #${currentOrder.id}`}
                  </strong>

                  <span>
                    {money(
                      (currentOrder.items || []).reduce(
                        (sum, item) =>
                          sum +
                          ((item.status || "pending").toLowerCase() ===
                          "cancelled"
                            ? 0
                            : getItemTotal(item)),
                        0,
                      ),
                    )}
                  </span>
                </div>

                {(currentOrder.items || []).map((item) => (
                  <div className="generate-bill-item" key={item.id}>
                    <span>
                      {item.dish_name || item.name || "Item"} × {item.quantity}
                      {(item.status || "").toLowerCase() === "cancelled" && (
                        <small> (Cancelled)</small>
                      )}
                    </span>

                    <span>{money(getItemTotal(item))}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>

          <label className="generate-bill-field">
            <span>Discount (₹)</span>

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
            <span>Tax rate (%)</span>

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

          <div className="generate-bill-totals">
            <div>
              <span>Subtotal</span>
              <strong>{money(subtotal)}</strong>
            </div>

            {cancelledAmount > 0 && (
              <div>
                <span>Cancelled items (excluded)</span>
                <strong>{money(cancelledAmount)}</strong>
              </div>
            )}

            <div>
              <span>Discount</span>
              <strong>−{money(valid ? discountAmount : 0)}</strong>
            </div>

            <div>
              <span>Tax</span>
              <strong>{money(tax)}</strong>
            </div>

            <div className="generate-bill-grand-total">
              <span>Total due</span>
              <strong>{money(total)}</strong>
            </div>
          </div>

          {!valid && (
            <p className="generate-bill-error">
              Enter a valid discount not exceeding the subtotal and a tax rate
              between 0% and 100%.
            </p>
          )}

          {error && <p className="generate-bill-error">{error}</p>}

          <button
            type="submit"
            className="generate-bill-submit"
            disabled={!valid || saving || !branchId || orders.length === 0}
          >
            {saving ? "Generating..." : "Generate bill"}
          </button>
        </form>
      </section>
    </div>
  );
}
