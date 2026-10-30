import { useCallback, useEffect, useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";

import {
  LayoutDashboard,
  Store,
  ChartNoAxesCombined,
  Activity,
  Star,
  ShoppingBag,
  ChefHat,
  ReceiptText,
  LogOut,
  Wallet,
  X,
  Monitor,
  FileBarChart,
  Armchair,
} from "lucide-react";

import { useBranchSelection } from "../context/BranchSelectionContext";
import { getBranchOrders } from "../api/orders";
import { getTables } from "../api/tables";

const navigationItems = [
  { label: "Dashboard", path: "/dashboard", icon: LayoutDashboard, end: true },
  { label: "Restaurants", path: "/dashboard/restaurants", icon: Store },
  { label: "Orders", path: "/dashboard/orders", icon: ShoppingBag },
  { label: "Kitchen Display", path: "/dashboard/kitchen", icon: ChefHat },
  { label: "Bills & Receipts", path: "/dashboard/bills", icon: ReceiptText },
  {
    label: "Sales Analytics",
    path: "/dashboard/sales-analytics",
    icon: ChartNoAxesCombined,
  },
  { label: "Menu Analytics", path: "/dashboard/analytics", icon: Activity },
  { label: "Reviews", path: "/dashboard/reviews", icon: Star },
  {
    label: "Revenue Analytics",
    path: "/dashboard/revenue-analytics",
    icon: Wallet,
  },
  {
    label: "Reports & Operations",
    path: "/dashboard/business-reports",
    icon: FileBarChart,
  },
  {
    label: "POS Reports",
    path: "/dashboard/reports",
    icon: FileBarChart,
  },
  {
    label: "Point of Sale",
    path: "/dashboard/pos",
    icon: Monitor,
  },
  {
    label: "Table Status",
    path: "/dashboard/table-status",
    icon: Armchair,
  },
];

const ACTIVE_STATUSES = ["pending", "confirmed", "preparing", "ready"];

function getAvailableTableCount(tables) {
  return tables.filter(
    (table) =>
      table.is_active !== false &&
      table.is_occupied !== true &&
      table.is_unavailable !== true,
  ).length;
}

export default function Sidebar({ open = false, onNavigate, onClose }) {
  const navigate = useNavigate();

  const [activeOrderCount, setActiveOrderCount] = useState(0);
  const [availableTableCount, setAvailableTableCount] = useState(0);
  const { selectedBranchId: branchId } = useBranchSelection();

  // Refresh active orders every five seconds.
  useEffect(() => {
    if (!branchId) {
      setActiveOrderCount(0);
      return undefined;
    }

    let cancelled = false;

    async function refreshCount() {
      try {
        const result = await getBranchOrders(branchId);
        const orders = Array.isArray(result) ? result : [];

        const count = orders.filter((order) =>
          ACTIVE_STATUSES.includes(String(order.status || "").toLowerCase()),
        ).length;

        if (!cancelled) {
          setActiveOrderCount(count);
        }
      } catch (error) {
        console.error("Unable to refresh kitchen order badge:", error);
      }
    }

    refreshCount();
    const intervalId = window.setInterval(refreshCount, 5000);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [branchId]);

  // Refresh available table count every five seconds.
  const refreshAvailableTables = useCallback(async () => {
    if (!branchId) {
      setAvailableTableCount(0);
      return;
    }

    try {
      const result = await getTables(branchId);
      const tables = Array.isArray(result) ? result : [];

      setAvailableTableCount(getAvailableTableCount(tables));
    } catch (error) {
      console.error("Unable to refresh table status badge:", error);
    }
  }, [branchId]);

  useEffect(() => {
    if (!branchId) {
      setAvailableTableCount(0);
      return undefined;
    }

    refreshAvailableTables();

    const intervalId = window.setInterval(refreshAvailableTables, 5000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [branchId, refreshAvailableTables]);

  function handleLogout() {
    localStorage.removeItem("access_token");
    navigate("/login", { replace: true });
  }

  return (
    <aside id="app-sidebar" className={`app-sidebar ${open ? "open" : ""}`}>
      <div className="sidebar-brand">
        <div className="sidebar-brand-icon">
          <ShoppingBag size={20} />
        </div>

        <div>
          <strong>Smart Menu</strong>
          <span>Restaurant management</span>
        </div>

        <button
          type="button"
          className="dx-sidebar-close"
          onClick={onClose}
          aria-label="Close navigation"
        >
          <X size={20} />
        </button>
      </div>

      <nav className="sidebar-navigation" aria-label="Main navigation">
        <p className="sidebar-section-title">Workspace</p>

        {navigationItems.map((item) => {
          const Icon = item.icon;

          return (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.end || false}
              onClick={onNavigate}
              className={({ isActive }) =>
                `sidebar-nav-item ${isActive ? "active" : ""}`
              }
            >
              <Icon size={18} />
              <span>{item.label}</span>

              {item.path === "/dashboard/kitchen" && activeOrderCount > 0 && (
                <span
                  style={{
                    marginLeft: "auto",
                    minWidth: 22,
                    height: 22,
                    padding: "0 6px",
                    borderRadius: 999,
                    background: "#dc2626",
                    color: "#fff",
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 12,
                    fontWeight: 700,
                  }}
                  aria-label={`${activeOrderCount} active orders`}
                >
                  {activeOrderCount > 99 ? "99+" : activeOrderCount}
                </span>
              )}

              {item.path === "/dashboard/table-status" && (
                <span
                  style={{
                    marginLeft: "auto",
                    minWidth: 22,
                    height: 22,
                    padding: "0 6px",
                    borderRadius: 999,
                    background: "#16a34a",
                    color: "#fff",
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 12,
                    fontWeight: 700,
                  }}
                  aria-label={`${availableTableCount} available tables`}
                  title={`${availableTableCount} available tables`}
                >
                  {availableTableCount > 99 ? "99+" : availableTableCount}
                </span>
              )}
            </NavLink>
          );
        })}
      </nav>

      <div className="sidebar-bottom">
        <button type="button" className="sidebar-logout" onClick={handleLogout}>
          <LogOut size={18} />
          <span>Logout</span>
        </button>
      </div>
    </aside>
  );
}
