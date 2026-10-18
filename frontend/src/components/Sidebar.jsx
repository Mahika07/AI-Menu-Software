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

const navigationItems = [
  {
    label: "Dashboard",
    path: "/dashboard",
    icon: LayoutDashboard,
    end: true,
  },
  {
    label: "Restaurants",
    path: "/dashboard/restaurants",
    icon: Store,
  },
  {
    label: "Orders",
    path: "/dashboard/orders",
    icon: ShoppingBag,
  },
  {
    label: "Kitchen Display",
    path: "/dashboard/kitchen",
    icon: ChefHat,
  },
  {
    label: "Bills & Receipts",
    path: "/dashboard/bills",
    icon: ReceiptText,
  },
  {
    label: "Sales Analytics",
    path: "/dashboard/sales-analytics",
    icon: ChartNoAxesCombined,
  },
  {
    label: "Menu Analytics",
    path: "/dashboard/analytics",
    icon: Activity,
  },
  {
    label: "Reviews",
    path: "/dashboard/reviews",
    icon: Star,
  },

  {
    label: "Revenue Analytics",
    path: "/dashboard/revenue-analytics",
    icon: Wallet,
  },
];

export default function Sidebar({ open = false, onNavigate, onClose }) {
  const navigate = useNavigate();

  function handleLogout() {
    localStorage.removeItem("access_token");
    navigate("/login", { replace: true });
  }

  return (
    <aside
      id="app-sidebar"
      className={`app-sidebar ${open ? "open" : ""}`}
    >
      <div className="sidebar-brand">
        <div className="sidebar-brand-icon">
          <UtensilsIcon />
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

function UtensilsIcon() {
  return <ShoppingBag size={20} />;
}
