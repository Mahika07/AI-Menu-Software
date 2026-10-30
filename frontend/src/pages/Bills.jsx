import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import {
  FileText,
  Search,
  RefreshCw,
  Receipt,
  Eye,
  AlertCircle,
  CheckCircle2,
  Clock3,
  Download,
  Banknote,
  CreditCard,
} from "lucide-react";

import {
  getBranchBillsPage,
  getAllBranchBills,
  markBillPaid,
} from "../api/bills";

import { useBranchSelection } from "../context/BranchSelectionContext";
import "./Bills.css";

function formatCurrency(value) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(Number(value || 0));
}

function formatDate(value) {
  if (!value) return "—";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "—";

  return date.toLocaleString("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function normalizeStatus(value) {
  return String(value || "unpaid").toLowerCase();
}

const PAYMENT_METHODS = [
  { value: "cash", label: "Cash" },
  { value: "upi", label: "UPI" },
  { value: "card", label: "Card" },
  { value: "other", label: "Other" },
];

function formatPaymentMethod(value) {
  const method = PAYMENT_METHODS.find(
    (item) => item.value === String(value || "").toLowerCase(),
  );

  return method?.label || value || "—";
}

export default function Bills() {
  const navigate = useNavigate();

  const {
    selectedBranch,
    selectedBranchId,
    loading: branchLoading,
  } = useBranchSelection();

  const branchId = selectedBranchId || selectedBranch?.id || "";

  const requestIdRef = useRef(0);

  const [bills, setBills] = useState([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [paymentMethodFilter, setPaymentMethodFilter] = useState("all");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(20);
  const [totalBills, setTotalBills] = useState(0);

  const [paymentMethods, setPaymentMethods] = useState({});
  const [payingBillId, setPayingBillId] = useState(null);
  const [paymentError, setPaymentError] = useState("");
  const [paymentSuccess, setPaymentSuccess] = useState("");

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState("");

  const loadBills = useCallback(
    async (manualRefresh = false) => {
      const requestId = ++requestIdRef.current;

      if (!branchId) {
        setBills([]);
        setTotalBills(0);
        setError("No branch selected. Select a branch before viewing bills.");
        setLoading(false);
        setRefreshing(false);
        return;
      }

      try {
        if (manualRefresh) {
          setRefreshing(true);
        } else {
          setLoading(true);
        }

        setError("");

        const data = await getBranchBillsPage(
          branchId,
          pageSize,
          page * pageSize,
          search,
          statusFilter,
          {
            paymentMethod: paymentMethodFilter,
            startDate,
            endDate,
          },
        );

        if (requestId !== requestIdRef.current) return;

        setBills(Array.isArray(data?.items) ? data.items : []);
        setTotalBills(Number(data?.total) || 0);
      } catch (err) {
        if (requestId !== requestIdRef.current) return;

        console.error("Failed to load bills:", err);

        setError(
          err.response?.data?.detail ||
            "Could not load bills. Check your connection and try again.",
        );
      } finally {
        if (requestId === requestIdRef.current) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [
      branchId,
      page,
      pageSize,
      search,
      statusFilter,
      paymentMethodFilter,
      startDate,
      endDate,
    ],
  );

  useEffect(() => {
    if (branchLoading) return;

    loadBills();

    return () => {
      requestIdRef.current += 1;
    };
  }, [loadBills, branchLoading]);

  const filteredBills = bills;

  const summary = useMemo(() => {
    const total = bills.reduce(
      (sum, bill) => sum + Number(bill.total_amount || 0),
      0,
    );

    const paidBills = bills.filter(
      (bill) => normalizeStatus(bill.payment_status) === "paid",
    );

    const paid = paidBills.reduce(
      (sum, bill) => sum + Number(bill.total_amount || 0),
      0,
    );

    const unpaidBills = bills.filter(
      (bill) =>
        !["paid", "refunded"].includes(normalizeStatus(bill.payment_status)),
    );

    const outstanding = unpaidBills.reduce(
      (sum, bill) => sum + Number(bill.total_amount || 0),
      0,
    );

    return {
      total,
      paid,
      unpaidCount: unpaidBills.length,
      outstanding,
    };
  }, [bills]);

  function openReceipt(bill) {
    navigate(`/dashboard/bills/${bill.id}`, {
      state: {
        bill,
        order: bill.order,
        restaurant: { name: bill.restaurant_name },
        branch: { name: bill.branch_name },
      },
    });
  }

  function clearFilters() {
    setPage(0);
    setSearch("");
    setStatusFilter("all");
    setPaymentMethodFilter("all");
    setStartDate("");
    setEndDate("");
  }

  async function exportBillsCsv() {
    if (!branchId || loading || exporting) return;

    try {
      setExporting(true);

      const allBills = await getAllBranchBills(branchId, 100, {
        search,
        paymentStatus: statusFilter,
        paymentMethod: paymentMethodFilter,
        startDate,
        endDate,
      });

      if (!allBills || allBills.length === 0) {
        alert("No bills match the selected filters.");
        return;
      }

      const headers = [
        "Bill Number",
        "Restaurant",
        "Branch",
        "Order ID",
        "Order Number",
        "Table Number",
        "Bill Date",
        "Subtotal (INR)",
        "Discount (INR)",
        "Tax (INR)",
        "Total Amount (INR)",
        "Payment Status",
        "Payment Method",
        "Paid At",
      ];

      const escapeCsv = (value) => {
        let text = String(value ?? "");

        if (/^[\s]*[=+\-@]/.test(text)) {
          text = `'${text}`;
        }

        return `"${text.replace(/"/g, '""')}"`;
      };

      const rows = allBills.map((bill) => [
        bill.bill_number,
        bill.restaurant_name,
        bill.branch_name,
        bill.order_id,
        bill.order?.order_number,
        bill.order?.table_number,
        bill.created_at,
        bill.subtotal,
        bill.discount_amount,
        bill.tax_amount,
        bill.total_amount,
        bill.payment_status,
        bill.payment_method,
        bill.paid_at,
      ]);

      const csv = [headers, ...rows]
        .map((row) => row.map(escapeCsv).join(","))
        .join("\r\n");

      const blob = new Blob(["\uFEFF", csv], {
        type: "text/csv;charset=utf-8;",
      });

      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");

      link.href = url;
      link.download = `bills-register-${new Date()
        .toISOString()
        .slice(0, 10)}.csv`;

      document.body.appendChild(link);
      link.click();
      link.remove();

      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) {
      console.error("Bills export failed:", err);

      alert(
        err.response?.data?.detail ||
          err.message ||
          "Unable to export bills. Please try again.",
      );
    } finally {
      setExporting(false);
    }
  }

  function handlePaymentMethodChange(billId, paymentMethod) {
    setPaymentMethods((previous) => ({
      ...previous,
      [billId]: paymentMethod,
    }));

    setPaymentError("");
    setPaymentSuccess("");
  }

  async function handleMarkAsPaid(bill) {
    if (!branchId) {
      setPaymentError("Select a branch before recording a payment.");
      return;
    }

    if (normalizeStatus(bill.payment_status) === "paid") {
      setPaymentError("This bill has already been marked as paid.");
      return;
    }

    if (normalizeStatus(bill.payment_status) === "refunded") {
      setPaymentError("A refunded bill cannot be marked as paid.");
      return;
    }

    if (payingBillId !== null) return;

    const paymentMethod = paymentMethods[bill.id] || "cash";

    const confirmed = window.confirm(
      `Mark bill ${bill.bill_number} as paid via ${formatPaymentMethod(
        paymentMethod,
      )}?\n\nAmount: ${formatCurrency(
        bill.total_amount,
      )}\n\nOnly confirm if the payment has actually been received.`,
    );

    if (!confirmed) return;

    try {
      setPayingBillId(bill.id);
      setPaymentError("");
      setPaymentSuccess("");

      const updatedBill = await markBillPaid(branchId, bill.id, paymentMethod);

      setBills((previous) =>
        previous.map((item) =>
          String(item.id) === String(updatedBill.id)
            ? { ...item, ...updatedBill }
            : item,
        ),
      );

      setPaymentSuccess(
        `Payment recorded for ${bill.bill_number}. Method: ${formatPaymentMethod(
          updatedBill.payment_method || paymentMethod,
        )}.`,
      );
    } catch (err) {
      if (err.response?.status === 409) {
        setPaymentError(
          "This bill may already be paid or cannot transition to paid. Refresh the list to see the latest status.",
        );
      } else {
        setPaymentError(
          err.response?.data?.detail ||
            "Could not record this payment. Please try again.",
        );
      }
    } finally {
      setPayingBillId(null);
    }
  }

  const filtersAreActive =
    Boolean(search.trim()) ||
    statusFilter !== "all" ||
    paymentMethodFilter !== "all" ||
    Boolean(startDate) ||
    Boolean(endDate);

  const pageCount = Math.ceil(totalBills / pageSize);

  return (
    <main className="bills-page">
      <header className="bills-header">
        <div>
          <p className="bills-eyebrow">RESTAURANT MANAGEMENT</p>
          <h1>Bills &amp; Receipts</h1>
          <p className="bills-subtitle">
            Search billing history, filter transactions, record payments, and
            open printable receipts.
          </p>

          {selectedBranch && (
            <p className="bills-selected-branch">
              Branch: <strong>{selectedBranch.name}</strong>
            </p>
          )}
        </div>

        <div className="bills-header-actions">
          <button
            type="button"
            className="bills-export-button"
            onClick={exportBillsCsv}
            disabled={loading || exporting || !branchId}
          >
            <Download size={17} />
            {exporting ? "Exporting..." : "Export CSV"}
          </button>

          <button
            type="button"
            className="bills-refresh-button"
            onClick={() => loadBills(true)}
            disabled={loading || refreshing || !branchId}
          >
            <RefreshCw size={17} className={refreshing ? "bills-spin" : ""} />
            {refreshing ? "Refreshing..." : "Refresh"}
          </button>
        </div>
      </header>

      {branchLoading ? (
        <div className="bills-empty-state">
          <RefreshCw size={25} className="bills-spin" />
          <h3>Loading branch information...</h3>
        </div>
      ) : !branchId ? (
        <div className="bills-empty-state">
          <Receipt size={34} />
          <h3>No branch selected</h3>
          <p>Select a branch from the dashboard header to view bills.</p>
        </div>
      ) : (
        <>
          <section className="bills-summary-grid">
            <article className="bills-summary-card">
              <span className="bills-summary-icon">
                <FileText size={20} />
              </span>
              <div>
                <p>Matching bills</p>
                <h2>{totalBills}</h2>
              </div>
            </article>

            <article className="bills-summary-card">
              <span className="bills-summary-icon">
                <Receipt size={20} />
              </span>
              <div>
                <p>Page billed</p>
                <h2>{formatCurrency(summary.total)}</h2>
              </div>
            </article>

            <article className="bills-summary-card">
              <span className="bills-summary-icon">
                <CheckCircle2 size={20} />
              </span>
              <div>
                <p>Page paid amount</p>
                <h2>{formatCurrency(summary.paid)}</h2>
              </div>
            </article>

            <article className="bills-summary-card">
              <span className="bills-summary-icon">
                <Clock3 size={20} />
              </span>
              <div>
                <p>Unpaid on page</p>
                <h2>{summary.unpaidCount}</h2>
              </div>
            </article>

            <article className="bills-summary-card">
              <span className="bills-summary-icon">
                <Banknote size={20} />
              </span>
              <div>
                <p>Page outstanding</p>
                <h2>{formatCurrency(summary.outstanding)}</h2>
              </div>
            </article>
          </section>

          <section className="bills-panel">
            <div className="bills-toolbar">
              <label className="bills-search">
                <Search size={18} />
                <input
                  type="search"
                  value={search}
                  onChange={(event) => {
                    setPage(0);
                    setSearch(event.target.value);
                  }}
                  placeholder="Search bill, order, or customer..."
                  aria-label="Search bills"
                />
              </label>

              <select
                className="bills-status-filter"
                value={statusFilter}
                onChange={(event) => {
                  setPage(0);
                  setStatusFilter(event.target.value);
                }}
                aria-label="Filter by payment status"
              >
                <option value="all">All payment statuses</option>
                <option value="paid">Paid</option>
                <option value="unpaid">Unpaid</option>
                <option value="pending">Pending</option>
                <option value="refunded">Refunded</option>
              </select>

              <select
                className="bills-status-filter"
                value={paymentMethodFilter}
                onChange={(event) => {
                  setPage(0);
                  setPaymentMethodFilter(event.target.value);
                }}
                aria-label="Filter by payment method"
              >
                <option value="all">All payment methods</option>
                <option value="cash">Cash</option>
                <option value="upi">UPI</option>
                <option value="card">Card</option>
                <option value="other">Other</option>
              </select>

              <label className="bills-date-filter">
                <span>From date</span>
                <input
                  type="date"
                  value={startDate}
                  max={endDate || undefined}
                  onChange={(event) => {
                    setPage(0);
                    setStartDate(event.target.value);
                  }}
                  aria-label="Filter bills from date"
                />
              </label>

              <label className="bills-date-filter">
                <span>To date</span>
                <input
                  type="date"
                  value={endDate}
                  min={startDate || undefined}
                  onChange={(event) => {
                    setPage(0);
                    setEndDate(event.target.value);
                  }}
                  aria-label="Filter bills to date"
                />
              </label>

              <button
                type="button"
                className="bills-refresh-button"
                onClick={clearFilters}
                disabled={!filtersAreActive}
              >
                Clear filters
              </button>
            </div>

            {error && (
              <div className="bills-message bills-error" role="alert">
                <AlertCircle size={19} />
                <span>{error}</span>
                <button type="button" onClick={() => loadBills(true)}>
                  Try again
                </button>
              </div>
            )}

            {paymentError && (
              <div className="bills-message bills-error" role="alert">
                <AlertCircle size={19} />
                <span>{paymentError}</span>
                <button
                  type="button"
                  onClick={() => {
                    setPaymentError("");
                    loadBills(true);
                  }}
                >
                  Refresh bills
                </button>
              </div>
            )}

            {paymentSuccess && (
              <div
                className="bills-message"
                role="status"
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "10px",
                  padding: "12px 16px",
                  marginBottom: "16px",
                  borderRadius: "10px",
                  background: "#ecfdf3",
                  color: "#166534",
                }}
              >
                <CheckCircle2 size={19} />
                <span>{paymentSuccess}</span>
                <button
                  type="button"
                  onClick={() => setPaymentSuccess("")}
                  style={{
                    marginLeft: "auto",
                    border: 0,
                    background: "transparent",
                    cursor: "pointer",
                    color: "inherit",
                  }}
                >
                  Dismiss
                </button>
              </div>
            )}

            {loading ? (
              <div className="bills-empty-state">
                <RefreshCw size={25} className="bills-spin" />
                <h3>Loading bills...</h3>
                <p>Fetching billing records for this branch.</p>
              </div>
            ) : !error && filteredBills.length === 0 ? (
              <div className="bills-empty-state">
                <Receipt size={34} />
                <h3>
                  {filtersAreActive ? "No matching bills" : "No bills yet"}
                </h3>
                <p>
                  {filtersAreActive
                    ? "Try changing your search or clearing one or more filters."
                    : "Bills will appear here after they are generated for orders."}
                </p>
              </div>
            ) : (
              !error && (
                <div className="bills-table-wrap">
                  <table className="bills-table">
                    <thead>
                      <tr>
                        <th>Bill</th>
                        <th>Order</th>
                        <th>Table</th>
                        <th>Date</th>
                        <th>Amount</th>
                        <th>Payment</th>
                        <th>Record payment</th>
                        <th>Receipt</th>
                      </tr>
                    </thead>

                    <tbody>
                      {filteredBills.map((bill) => {
                        const paymentStatus = normalizeStatus(
                          bill.payment_status,
                        );

                        const isPaid = paymentStatus === "paid";
                        const isRefunded = paymentStatus === "refunded";
                        const isPaying = payingBillId === bill.id;
                        const selectedMethod =
                          paymentMethods[bill.id] || "cash";

                        return (
                          <tr key={bill.id}>
                            <td>
                              <strong>{bill.bill_number}</strong>
                              <small>
                                {bill.restaurant_name || "Restaurant"}
                              </small>

                              {bill.payment_method && (
                                <small>
                                  Method:{" "}
                                  {formatPaymentMethod(bill.payment_method)}
                                </small>
                              )}

                              {bill.paid_at && (
                                <small>Paid: {formatDate(bill.paid_at)}</small>
                              )}
                            </td>

                            <td>
                              {bill.order?.order_number ||
                                `Order #${bill.order_id}`}
                            </td>

                            <td>
                              {bill.order?.table_number
                                ? `Table ${bill.order.table_number}`
                                : "—"}
                            </td>

                            <td>{formatDate(bill.created_at)}</td>

                            <td>
                              <strong>
                                {formatCurrency(bill.total_amount)}
                              </strong>
                            </td>

                            <td>
                              <span
                                className={`bills-status bills-status-${paymentStatus}`}
                              >
                                {paymentStatus}
                              </span>
                            </td>

                            <td>
                              {isPaid ? (
                                <span
                                  style={{
                                    display: "inline-flex",
                                    alignItems: "center",
                                    gap: "6px",
                                    color: "#15803d",
                                    fontWeight: 600,
                                  }}
                                >
                                  <CheckCircle2 size={16} />
                                  Paid
                                </span>
                              ) : isRefunded ? (
                                <span>Refunded</span>
                              ) : (
                                <div
                                  style={{
                                    display: "flex",
                                    flexDirection: "column",
                                    alignItems: "stretch",
                                    gap: "8px",
                                    minWidth: "140px",
                                  }}
                                >
                                  <select
                                    className="bills-status-filter"
                                    value={selectedMethod}
                                    onChange={(event) =>
                                      handlePaymentMethodChange(
                                        bill.id,
                                        event.target.value,
                                      )
                                    }
                                    disabled={payingBillId !== null}
                                    aria-label={`Payment method for ${bill.bill_number}`}
                                  >
                                    {PAYMENT_METHODS.map((method) => (
                                      <option
                                        key={method.value}
                                        value={method.value}
                                      >
                                        {method.label}
                                      </option>
                                    ))}
                                  </select>

                                  <button
                                    type="button"
                                    className="bills-view-button"
                                    onClick={() => handleMarkAsPaid(bill)}
                                    disabled={payingBillId !== null}
                                  >
                                    <CreditCard size={16} />
                                    {isPaying ? "Saving..." : "Mark as Paid"}
                                  </button>
                                </div>
                              )}
                            </td>

                            <td>
                              <button
                                type="button"
                                className="bills-view-button"
                                onClick={() => openReceipt(bill)}
                                title={`Open receipt ${bill.bill_number}`}
                              >
                                <Eye size={16} />
                                View
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )
            )}

            <div className="bills-pagination">
              <p className="bills-pagination-info">
                {totalBills === 0
                  ? "No bills found"
                  : `Showing ${page * pageSize + 1}–${Math.min(
                      page * pageSize + bills.length,
                      totalBills,
                    )} of ${totalBills} bills`}
              </p>

              <div className="bills-pagination-controls">
                <label className="bills-page-size">
                  Rows:
                  <select
                    value={pageSize}
                    onChange={(event) => {
                      setPage(0);
                      setPageSize(Number(event.target.value));
                    }}
                    disabled={loading}
                  >
                    <option value={20}>20</option>
                    <option value={50}>50</option>
                    <option value={100}>100</option>
                  </select>
                </label>

                <button
                  type="button"
                  onClick={() => setPage((current) => Math.max(0, current - 1))}
                  disabled={loading || page === 0}
                >
                  Previous
                </button>

                <span>
                  Page {totalBills === 0 ? 0 : page + 1} of {pageCount}
                </span>

                <button
                  type="button"
                  onClick={() => setPage((current) => current + 1)}
                  disabled={loading || (page + 1) * pageSize >= totalBills}
                >
                  Next
                </button>
              </div>
            </div>
          </section>
        </>
      )}
    </main>
  );
}
