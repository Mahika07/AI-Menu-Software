import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Store,
  GitBranch,
  Utensils,
  Tags,
  Table2,
  CheckCircle,
  ArrowRight,
  RefreshCw,
  Wallet,
  ReceiptText,
  ShoppingBag,
} from "lucide-react";

import { getCurrentUser } from "../api/auth";
import { getDashboardStats } from "../api/dashboard";

function Dashboard() {
  const navigate = useNavigate();

  const [user, setUser] = useState(null);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function loadDashboard() {
    try {
      setLoading(true);
      setError("");

      const [userData, statsData] = await Promise.all([
        getCurrentUser(),
        getDashboardStats(),
      ]);

      setUser(userData);
      setStats(statsData);
    } catch (err) {
      console.error(err);

      if (err.response?.status === 401) {
        localStorage.removeItem("access_token");
        navigate("/login", { replace: true });
        return;
      }

      setError("Unable to load dashboard.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadDashboard();
  }, []);

  const statCards = [
    {
      label: "Restaurants",
      value: stats?.restaurants ?? 0,
      icon: Store,
      description: "Your restaurants",
    },
    {
      label: "Branches",
      value: stats?.branches ?? 0,
      icon: GitBranch,
      description: "Active locations",
    },
    {
      label: "Categories",
      value: stats?.categories ?? 0,
      icon: Tags,
      description: "Menu categories",
    },
    {
      label: "Dishes",
      value: stats?.dishes ?? 0,
      icon: Utensils,
      description: "Total dishes",
    },
    {
      label: "Available Dishes",
      value: stats?.available_dishes ?? 0,
      icon: CheckCircle,
      description: "Currently available",
    },
    {
      label: "Tables",
      value: stats?.tables ?? 0,
      icon: Table2,
      description: "QR-enabled tables",
    },
  ];

  const quickActions = [
    {
      title: "Add Restaurant",
      description: "Create a new restaurant",
      icon: Store,
      action: () => navigate("/dashboard/restaurants"),
    },
    {
      title: "Manage Branches",
      description: "Add and manage locations",
      icon: GitBranch,
      action: () => navigate("/dashboard/restaurants"),
    },
    {
      title: "Manage Menu",
      description: "Manage categories and dishes",
      icon: Utensils,
      action: () => navigate("/dashboard/restaurants"),
    },
    {
      title: "Generate QR",
      description: "Manage table QR codes",
      icon: Table2,
      action: () => navigate("/dashboard/restaurants"),
    },
    {
      title: "Manage Orders",
      description: "View and manage customer orders",
      icon: ShoppingBag,
      action: () => navigate("/dashboard/orders"),
    },
    {
      title: "Bills & Receipts",
      description: "View bills and payment statuses",
      icon: ReceiptText,
      action: () => navigate("/dashboard/bills"),
    },
    {
      title: "Revenue Analytics",
      description: "Track collections and outstanding bills",
      icon: Wallet,
      action: () => navigate("/dashboard/revenue-analytics"),
    },
  ];

  const firstName = user?.full_name ? user.full_name.split(" ")[0] : "";
  const totalDishes = stats?.dishes ?? 0;
  const availableDishes = stats?.available_dishes ?? 0;
  const unavailableDishes = Math.max(totalDishes - availableDishes, 0);
  const availablePct = totalDishes
    ? Math.round((availableDishes / totalDishes) * 100)
    : 0;
  const show = (value) => (loading ? "—" : value);

  return (
    <div className="dx-page" aria-busy={loading}>
      {/* Top bar */}
      <header className="dx-top">
        <div className="dx-greeting">
          <small>Welcome back{firstName ? `, ${firstName}` : ""}</small>
          <h1>Dashboard</h1>
        </div>

        <div className="dx-top-right">
          <button
            type="button"
            className="dx-icon-btn"
            onClick={loadDashboard}
            disabled={loading}
            aria-label="Refresh dashboard"
            title="Refresh"
          >
            <RefreshCw size={18} className={loading ? "spin" : ""} />
          </button>

          {user && (
            <div className="dx-user">
              <div className="dx-avatar">
                {(user.full_name || user.email || "U").charAt(0).toUpperCase()}
              </div>

              <div className="dx-user-text">
                <strong>{user.full_name || "Restaurant Owner"}</strong>
                <span>{user.email}</span>
              </div>
            </div>
          )}
        </div>
      </header>

      {error && (
        <div className="dx-error" role="alert">
          {error}
        </div>
      )}

      <div className="dx-grid">
        {/* Left column */}
        <div className="dx-col">
          <section className="dx-card dx-card--avail">
            <div className="dx-card-head">
              <h2>Menu availability</h2>
              <p>{show(`${availablePct}% of dishes available`)}</p>
            </div>

            <div
              className="dx-bar"
              role="progressbar"
              aria-label="Available dishes"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={availablePct}
            >
              <div
                className="dx-bar-fill"
                style={{ "--pct": `${loading ? 0 : availablePct}%` }}
              />
            </div>

            <div className="dx-figures">
              <div className="dx-figure">
                <span>Total dishes</span>
                <strong>{show(totalDishes)}</strong>
              </div>
              <div className="dx-figure">
                <span>Available</span>
                <strong>{show(availableDishes)}</strong>
              </div>
              <div className="dx-figure">
                <span>Unavailable</span>
                <strong>{show(unavailableDishes)}</strong>
              </div>
            </div>
          </section>

          <section className="dx-card dx-card--actions">
            <div className="dx-card-head">
              <h2>Quick actions</h2>
              <p>Common tasks</p>
            </div>

            <div className="dx-actions">
              {quickActions.map((action) => {
                const Icon = action.icon;

                return (
                  <button
                    type="button"
                    className="dx-action"
                    key={action.title}
                    onClick={action.action}
                  >
                    <span className="dx-action-icon">
                      <Icon size={20} />
                    </span>

                    <span className="dx-action-text">
                      <strong>{action.title}</strong>
                      <span>{action.description}</span>
                    </span>

                    <ArrowRight size={18} />
                  </button>
                );
              })}
            </div>
          </section>
        </div>

        {/* Right column */}
        <div className="dx-col">
          <div className="dx-stats">
            {statCards.map((card) => {
              const Icon = card.icon;

              return (
                <div className="dx-card dx-stat" key={card.label}>
                  <div className="dx-stat-icon">
                    <Icon size={20} />
                  </div>

                  <div className="dx-stat-label">{card.label}</div>
                  <div className="dx-stat-value">{show(card.value)}</div>
                  <div className="dx-stat-note">{card.description}</div>
                </div>
              );
            })}
          </div>

          <section className="dx-banner">
            <div>
              <h3>Set up your digital menu</h3>
              <p>
                Create your restaurant, add a branch, build your menu and
                generate QR codes for your tables.
              </p>
            </div>

            <button
              type="button"
              className="dx-banner-btn"
              onClick={() => navigate("/dashboard/restaurants")}
            >
              Get started
              <ArrowRight size={17} />
            </button>
          </section>
        </div>
      </div>
    </div>
  );
}

export default Dashboard;
