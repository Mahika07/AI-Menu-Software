import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import "./BillReceipt.css";

const formatMoney = (amount) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
  }).format(Number(amount || 0));

export default function BillReceipt({ bill, order, restaurant, branch }) {
  const navigate = useNavigate();

  const items = useMemo(() => order?.items || [], [order]);
  const paymentStatus = String(bill?.payment_status || "unpaid").toLowerCase();
  const isPaid = paymentStatus === "paid";

  if (!bill || !order) {
    return (
      <main className="receipt-page">
        <div className="receipt-empty">
          <h2>Receipt unavailable</h2>
          <p>Bill or order details could not be loaded.</p>
          <button onClick={() => navigate(-1)}>Go back</button>
        </div>
      </main>
    );
  }

  return (
    <main className="receipt-page">
      <div className="receipt-toolbar no-print">
        <button className="receipt-back" onClick={() => navigate(-1)}>
          ← Back
        </button>

        <button className="receipt-print" onClick={() => window.print()}>
          <span aria-hidden="true">⎙</span>
          Print Receipt
        </button>
      </div>

      <article className="receipt-paper">
        <header className="receipt-header">
          <div className="receipt-brand-mark">SM</div>

          <h1>{restaurant?.name || "Restaurant"}</h1>

          {branch?.name && <p className="receipt-branch">{branch.name}</p>}

          {branch?.address && <p>{branch.address}</p>}

          {branch?.phone && <p>Phone: {branch.phone}</p>}

          <div className="receipt-badge">
            {isPaid ? "PAYMENT RECEIPT" : "BILL — PAYMENT NOT RECEIVED"}
          </div>
        </header>

        <div className="receipt-meta">
          <div>
            <span>Bill number</span>
            <strong>{bill.bill_number}</strong>
          </div>

          <div>
            <span>Order number</span>
            <strong>{order.order_number || order.id}</strong>
          </div>

          <div>
            <span>Table</span>
            <strong>{order.table_number || "—"}</strong>
          </div>

          <div>
            <span>Date</span>
            <strong>
              {bill.created_at
                ? new Date(bill.created_at).toLocaleString("en-IN", {
                    dateStyle: "medium",
                    timeStyle: "short",
                  })
                : "—"}
            </strong>
          </div>

          {order.customer_name && (
            <div>
              <span>Customer</span>
              <strong>{order.customer_name}</strong>
            </div>
          )}
        </div>

        <div className="receipt-items">
          <div className="receipt-items-heading">
            <span>Item</span>
            <span>Qty</span>
            <span>Price</span>
            <span>Total</span>
          </div>

          {items.map((item, index) => (
            <div
              className="receipt-item"
              key={item.id ?? `${item.dish_name}-${index}`}
            >
              <span>{item.dish_name || "Menu item"}</span>
              <span>{item.quantity}</span>
              <span>{formatMoney(item.unit_price)}</span>
              <span>{formatMoney(item.line_total)}</span>
            </div>
          ))}

          {items.length === 0 && (
            <p className="receipt-no-items">No order items were provided.</p>
          )}
        </div>

        <section className="receipt-totals">
          <div>
            <span>Subtotal</span>
            <strong>{formatMoney(bill.subtotal)}</strong>
          </div>

          {Number(bill.discount_amount) > 0 && (
            <div>
              <span>Discount</span>
              <strong>−{formatMoney(bill.discount_amount)}</strong>
            </div>
          )}

          <div>
            <span>Tax</span>
            <strong>{formatMoney(bill.tax_amount)}</strong>
          </div>

          <div className="receipt-grand-total">
            <span>Total</span>
            <strong>{formatMoney(bill.total_amount)}</strong>
          </div>
        </section>

        <section className="receipt-payment">
          <span>Payment status</span>
          <strong
            className={`payment-status ${isPaid ? "is-paid" : "is-unpaid"}`}
          >
            {paymentStatus.toUpperCase()}
          </strong>
        </section>

        {isPaid && (
          <section className="receipt-payment-details">
            <div>
              <span>Payment method</span>
              <strong>
                {String(bill.payment_method || "").toUpperCase() || "—"}
              </strong>
            </div>
            <div>
              <span>Paid at</span>
              <strong>
                {bill.paid_at
                  ? new Date(bill.paid_at).toLocaleString("en-IN", {
                      dateStyle: "medium",
                      timeStyle: "short",
                    })
                  : "—"}
              </strong>
            </div>
          </section>
        )}

        {!isPaid && (
          <p className="receipt-unpaid-note">
            This document is a bill, not proof of payment. Payment has not been
            recorded as received.
          </p>
        )}

        <footer className="receipt-footer">
          <h2>Thank you for dining with us!</h2>
          <p>We hope to serve you again soon.</p>
          <small>Powered by Smart Menu</small>
        </footer>
      </article>
    </main>
  );
}
