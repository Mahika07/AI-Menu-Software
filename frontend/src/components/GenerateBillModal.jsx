import { useEffect, useState } from "react";
import { X, Receipt } from "lucide-react";
import { createBill } from "../api/bills";
import "./GenerateBillModal.css";

function money(value) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(Number(value || 0));
}

export default function GenerateBillModal({
  order,
  branchId,
  onClose,
  onGenerated,
}) {
  const [discount, setDiscount] = useState("0");
  const [taxRate, setTaxRate] = useState("0");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    function onKeyDown(event) {
      if (event.key === "Escape" && !saving) onClose();
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose, saving]);

  const subtotal = Number(order?.subtotal || 0);
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
  const tax = valid ? Math.round(taxable * rate) / 100 : 0;
  const total = taxable + tax;

  async function handleSubmit(event) {
    event.preventDefault();

    if (!valid || saving || !branchId || !order?.id) return;

    try {
      setSaving(true);
      setError("");

      const bill = await createBill(branchId, order.id, {
        discount_amount: discountAmount.toFixed(2),
        tax_rate: rate.toFixed(2),
      });

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
        if (event.target === event.currentTarget && !saving) onClose();
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
              <h2 id="generate-bill-title">Generate bill</h2>
              <p>Order {order?.order_number || `#${order?.id}`}</p>
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
            <strong>{order?.table_number || "—"}</strong>
            <span>Items</span>
            <strong>
              {(order?.items || []).reduce(
                (sum, item) => sum + Number(item.quantity || 0),
                0,
              )}
            </strong>
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
            disabled={!valid || saving || !branchId}
          >
            {saving ? "Generating..." : "Generate bill"}
          </button>
        </form>
      </section>
    </div>
  );
}
