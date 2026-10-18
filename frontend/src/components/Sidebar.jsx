import { useEffect, useState } from "react";
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
} from "lucide-react";

import { getRestaurants } from "../api/restaurants";
import { getBranches } from "../api/branches";
import { getBranchOrders } from "../api/orders";

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
];

const ACTIVE_STATUSES = ["pending", "confirmed", "preparing", "ready"];

export default function Sidebar({ open = false, onNavigate, onClose }) {
  const navigate = useNavigate();
  const [activeOrderCount, setActiveOrderCount] = useState(0);
  const [branchId, setBranchId] = useState("");

  // Load the first available branch.
  useEffect(() => {
    let cancelled = false;

    async function loadBranch() {
      try {
        const restaurants = await getRestaurants();
        if (cancelled || !Array.isArray(restaurants) || !restaurants.length) {
          return;
        }

        const restaurantId = restaurants[0].id;
        const branches = await getBranches(restaurantId);

        if (!cancelled && Array.isArray(branches) && branches.length) {
          setBranchId(String(branches[0].id));
        }
      } catch (error) {
        console.error("Unable to load kitchen notification branch:", error);
      }
    }

    loadBranch();

    return () => {
      cancelled = true;
    };
  }, []);

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
