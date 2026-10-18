import { useEffect, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Printer, RefreshCw, AlertCircle } from "lucide-react";

import { getBillById } from "../api/bills";
import BillReceipt from "./BillReceipt";

function BillReceiptPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const { billId } = useParams();

  const [bill, setBill] = useState(location.state?.bill || null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const branchId = localStorage.getItem("selected_branch_id");

  useEffect(() => {
    let cancelled = false;

    async function loadBill() {
      if (!branchId || !billId) {
        if (!cancelled) {
          setError(
            "Bill or branch information is missing. Please open the bill from the Bills page.",
          );
        }
        return;
      }

      try {
        setLoading(true);
        setError("");

        const data = await getBillById(branchId, billId);

        if (!cancelled) {
          setBill(data);
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err.response?.data?.detail ||
              "Unable to load this bill. Please return to the Bills page and try again.",
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadBill();

    return () => {
      cancelled = true;
    };
  }, [branchId, billId]);

  if (loading && !bill) {
    return (
      <div className="page">
        <div className="loading">Loading bill...</div>
      </div>
    );
  }

  if (error && !bill) {
    return (
      <div className="page">
        <div className="error-message" role="alert">
          <AlertCircle size={18} />
          {error}
        </div>

        <button
          type="button"
          className="secondary-button"
          onClick={() => navigate("/dashboard/bills")}
        >
          <ArrowLeft size={16} />
          Back to Bills
        </button>
      </div>
    );
  }

  if (!bill) {
    return (
      <div className="page">
        <p>No bill selected.</p>
        <button
          type="button"
          className="secondary-button"
          onClick={() => navigate("/dashboard/bills")}
        >
          <ArrowLeft size={16} />
          Back to Bills
        </button>
      </div>
    );
  }

  const order = bill.order || location.state?.order;
  const restaurant = {
    name:
      bill.restaurant_name || location.state?.restaurant?.name || "Restaurant",
  };
  const branch = {
    name: bill.branch_name || location.state?.branch?.name || "",
  };

  return (
    <div className="page bill-receipt-page">
      <div className="page-header">
        <div>
          <h1>Bill Receipt</h1>
          <p>{bill.bill_number}</p>
        </div>

        <div className="bill-receipt-actions">
          <button
            type="button"
            className="secondary-button"
            onClick={() => navigate("/dashboard/bills")}
          >
            <ArrowLeft size={16} />
            Back to Bills
          </button>

          <button
            type="button"
            className="secondary-button"
            onClick={() => window.location.reload()}
            disabled={loading}
          >
            <RefreshCw size={16} />
            Refresh
          </button>

          <button
            type="button"
            className="primary-button"
            onClick={() => window.print()}
          >
            <Printer size={16} />
            Print Bill
          </button>
        </div>
      </div>

      {error && (
        <div className="error-message" role="alert">
          <AlertCircle size={18} />
          {error}
        </div>
      )}

      <BillReceipt
        bill={bill}
        order={order}
        restaurant={restaurant}
        branch={branch}
      />
    </div>
  );
}

export default BillReceiptPage;
