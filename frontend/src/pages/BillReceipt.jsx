import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import "./BillReceipt.css";

const formatMoney = (amount) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(amount || 0));

const formatDate = (value) =>
  value
    ? new Date(value).toLocaleString("en-IN", {
        dateStyle: "medium",
        timeStyle: "short",
      })
    : "—";

const isCancelled = (item) =>
  String(item.status || "pending").toLowerCase() === "cancelled";

const getItemTotal = (item) =>
  item.line_total != null
    ? Number(item.line_total)
    : Number(item.unit_price || 0) * Number(item.quantity || 0);

export default function BillReceipt({ bill, order, restaurant, branch }) {
  const navigate = useNavigate();

  const orders = useMemo(() => {
    if (Array.isArray(bill?.orders) && bill.orders.length > 0)
      return bill.orders;
    const legacyOrder = bill?.order || order;
    return legacyOrder ? [legacyOrder] : [];
  }, [bill, order]);

  // A receipt contains payable items only. Cancelled items remain in order history.
  const billOrders = useMemo(
    () =>
      orders
        .map((currentOrder) => ({
          ...currentOrder,
          items: (currentOrder.items || []).filter(
            (item) => !isCancelled(item),
          ),
        }))
        .filter((currentOrder) => currentOrder.items.length > 0),
    [orders],
  );

  const paymentStatus = String(bill?.payment_status || "unpaid").toLowerCase();
  const isPaid = paymentStatus === "paid";
  const firstOrder = orders[0];

  const customerNames = [
    ...new Set(
      orders.map((currentOrder) => currentOrder.customer_name).filter(Boolean),
    ),
  ];

  if (!bill || orders.length === 0) {
    return (
      <main className="receipt-page">
        <div className="receipt-empty">
          <h2>Bill unavailable</h2>
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
          <span aria-hidden="true">⎙</span> Print Receipt
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
            <span>{orders.length > 1 ? "Orders" : "Order number"}</span>
            <strong>
              {orders.length > 1
                ? orders.length
                : firstOrder.order_number || firstOrder.id}
            </strong>
          </div>
          <div>
            <span>Table</span>
            <strong>{firstOrder.table_number || "—"}</strong>
          </div>
          <div>
            <span>Date</span>
            <strong>{formatDate(bill.created_at)}</strong>
          </div>
          {customerNames.length > 0 && (
            <div>
              <span>Customer</span>
              <strong>{customerNames.join(", ")}</strong>
            </div>
          )}
          {bill.dining_session_id && (
            <div>
              <span>Dining session</span>
              <strong>#{bill.dining_session_id}</strong>
            </div>
          )}
        </div>

        <div className="receipt-items">
          {billOrders.map((currentOrder, orderIndex) => (
            <section className="receipt-order-section" key={currentOrder.id}>
              {orders.length > 1 && (
                <div className="receipt-order-title">
                  <strong>Order {orderIndex + 1}</strong>
                </div>
              )}
              <div className="receipt-items-heading">
                <span>Item</span>
                <span>Qty</span>
                <span>Price</span>
                <span>Total</span>
              </div>
              {currentOrder.items.map((item, index) => (
                <div
                  className="receipt-item"
                  key={item.id ?? `${currentOrder.id}-${index}`}
                >
                  <span>
                    {item.dish_name || "Menu item"}
                    {item.special_instructions && (
                      <small style={{ display: "block" }}>
                        Note: {item.special_instructions}
                      </small>
                    )}
                  </span>
                  <span>{item.quantity}</span>
                  <span>{formatMoney(item.unit_price)}</span>
                  <span>{formatMoney(getItemTotal(item))}</span>
                </div>
              ))}
            </section>
          ))}

          {billOrders.length === 0 && (
            <p className="receipt-no-items">
              There are no payable items in this bill.
            </p>
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
            <span>Total due</span>
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
              <strong>{formatDate(bill.paid_at)}</strong>
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
