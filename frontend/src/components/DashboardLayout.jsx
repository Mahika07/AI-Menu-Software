import { useEffect, useState } from "react";
import { Menu, ShoppingBag } from "lucide-react";

import Sidebar from "./Sidebar";
import RestaurantBranchSelector from "./RestaurantBranchSelector";

const DRAWER_BREAKPOINT = 1024;

function DashboardLayout({ children }) {
  const [menuOpen, setMenuOpen] = useState(false);

  function closeMenu() {
    setMenuOpen(false);
  }

  // Mobile drawer behaviour.
  useEffect(() => {
    if (!menuOpen) return undefined;

    function handleKey(event) {
      if (event.key === "Escape") {
        setMenuOpen(false);
      }
    }

    function handleResize() {
      if (window.innerWidth > DRAWER_BREAKPOINT) {
        setMenuOpen(false);
      }
    }

    const previousOverflow = document.body.style.overflow;

    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", handleKey);
    window.addEventListener("resize", handleResize);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKey);
      window.removeEventListener("resize", handleResize);
    };
  }, [menuOpen]);

  return (
    <div className="dashboard-layout">
      <header className="dx-mobilebar">
        <button
          type="button"
          className="dx-menu-btn"
          onClick={() => setMenuOpen(true)}
          aria-label="Open navigation"
          aria-expanded={menuOpen}
          aria-controls="app-sidebar"
        >
          <Menu size={22} />
        </button>

        <div className="dx-mobilebar-brand">
          <span className="dx-mobilebar-logo">
            <ShoppingBag size={18} />
          </span>
          <strong>Smart Menu</strong>
        </div>
      </header>

      <div
        className={`dx-backdrop ${menuOpen ? "open" : ""}`}
        onClick={closeMenu}
        aria-hidden="true"
      />

      <Sidebar open={menuOpen} onNavigate={closeMenu} onClose={closeMenu} />

      <main className="dashboard-layout-content">
        <div className="global-workspace-header">
          <RestaurantBranchSelector />
        </div>

        {children}
      </main>
    </div>
  );
}

export default DashboardLayout;
