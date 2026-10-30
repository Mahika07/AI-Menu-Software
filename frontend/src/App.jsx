import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";

import Login from "./pages/Login";
import Register from "./pages/Register";
import Dashboard from "./pages/Dashboard";
import PublicMenu from "./pages/PublicMenu";
import Restaurants from "./pages/Restaurants";
import Branches from "./pages/Branches";
import BranchMenu from "./pages/BranchMenu";
import Tables from "./pages/Tables";
import MenuImport from "./pages/MenuImport";
import Analytics from "./pages/Analytics";
import Reviews from "./pages/Reviews";
import ProtectedRoute from "./components/ProtectedRoute";
import DashboardLayout from "./components/DashboardLayout";
import { BranchSelectionProvider } from "./context/BranchSelectionContext";
import KitchenDisplay from "./pages/KitchenDisplay";
import TrackOrder from "./pages/TrackOrder";
import SalesAnalytics from "./pages/SalesAnalytics";
import Orders from "./pages/Orders";
import DiningSessions from "./pages/DiningSessions";
import BillReceiptPage from "./pages/BillReceiptPage";
import Bills from "./pages/Bills";
import RevenueAnalytics from "./pages/RevenueAnalytics";
import Profile from "./pages/Profile";
import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";
import POS from "./pages/POS";
import Reports from "./pages/Reports";
import BusinessReports from "./pages/BusinessReports";
import TableStatus from "./pages/TableStatus";

function ProtectedLayout({ children }) {
  return (
    <BranchSelectionProvider>
      <ProtectedRoute>
        <DashboardLayout>{children}</DashboardLayout>
      </ProtectedRoute>
    </BranchSelectionProvider>
  );
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Public */}
        <Route path="/" element={<Navigate to="/login" replace />} />
        <Route path="/menu/:qrToken" element={<PublicMenu />} />
        <Route path="/track-order" element={<TrackOrder />} />

        {/* Authentication */}
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />

        {/* Dashboard */}
        <Route
          path="/dashboard"
          element={
            <ProtectedLayout>
              <Dashboard />
            </ProtectedLayout>
          }
        />

        {/* Restaurants */}
        <Route
          path="/dashboard/restaurants"
          element={
            <ProtectedLayout>
              <Restaurants />
            </ProtectedLayout>
          }
        />

        {/* Branches */}
        <Route
          path="/dashboard/restaurants/:restaurantId/branches"
          element={
            <ProtectedLayout>
              <Branches />
            </ProtectedLayout>
          }
        />

        {/* Branch menu */}
        <Route
          path="/dashboard/restaurants/:restaurantId/branches/:branchId/menu"
          element={
            <ProtectedLayout>
              <BranchMenu />
            </ProtectedLayout>
          }
        />

        {/* Tables and QR */}
        <Route
          path="/dashboard/restaurants/:restaurantId/branches/:branchId/tables"
          element={
            <ProtectedLayout>
              <Tables />
            </ProtectedLayout>
          }
        />

        {/* Menu import */}
        <Route
          path="/dashboard/restaurants/:restaurantId/branches/:branchId/menu/import"
          element={
            <ProtectedLayout>
              <MenuImport />
            </ProtectedLayout>
          }
        />

        {/* Analytics */}
        <Route
          path="/dashboard/analytics"
          element={
            <ProtectedLayout>
              <Analytics />
            </ProtectedLayout>
          }
        />

        <Route
          path="/dashboard/sales-analytics"
          element={
            <ProtectedLayout>
              <SalesAnalytics />
            </ProtectedLayout>
          }
        />

        {/* Reviews */}
        <Route
          path="/dashboard/reviews"
          element={
            <ProtectedLayout>
              <Reviews />
            </ProtectedLayout>
          }
        />

        {/* Kitchen */}
        <Route
          path="/dashboard/kitchen"
          element={
            <ProtectedLayout>
              <KitchenDisplay />
            </ProtectedLayout>
          }
        />

        {/* Orders */}
        <Route
          path="/dashboard/orders"
          element={
            <ProtectedLayout>
              <Orders />
            </ProtectedLayout>
          }
        />

        {/* Dining sessions */}
        <Route
          path="/dashboard/restaurants/:restaurantId/branches/:branchId/dining-sessions"
          element={
            <ProtectedLayout>
              <DiningSessions />
            </ProtectedLayout>
          }
        />

        {/* Bills listing */}
        <Route
          path="/dashboard/bills"
          element={
            <ProtectedLayout>
              <Bills />
            </ProtectedLayout>
          }
        />

        {/* Bill receipt */}
        <Route
          path="/dashboard/bills/:billId"
          element={
            <ProtectedLayout>
              <BillReceiptPage />
            </ProtectedLayout>
          }
        />

        {/* Legacy redirects */}
        <Route
          path="/analytics"
          element={<Navigate to="/dashboard/analytics" replace />}
        />

        <Route
          path="/dashboard/revenue-analytics"
          element={
            <ProtectedLayout>
              <RevenueAnalytics />
            </ProtectedLayout>
          }
        />

        <Route
          path="/reviews"
          element={<Navigate to="/dashboard/reviews" replace />}
        />

        <Route
          path="/dashboard/profile"
          element={
            <ProtectedLayout>
              <Profile />
            </ProtectedLayout>
          }
        />

        <Route
          path="/dashboard/pos"
          element={
            <ProtectedLayout>
              <POS />
            </ProtectedLayout>
          }
        />

        {/* Consolidated reports and expenses */}
        <Route
          path="/dashboard/business-reports"
          element={
            <ProtectedLayout>
              <BusinessReports />
            </ProtectedLayout>
          }
        />

        {/* POS Reports */}
        <Route
          path="/dashboard/reports"
          element={
            <ProtectedLayout>
              <Reports />
            </ProtectedLayout>
          }
        />

        {/* Table Status */}
        <Route
          path="/dashboard/table-status"
          element={
            <ProtectedLayout>
              <TableStatus />
            </ProtectedLayout>
          }
        />

        <Route
          path="/dashboard/restaurants/:restaurantId/branches/:branchId/table-status"
          element={
            <ProtectedLayout>
              <TableStatus />
            </ProtectedLayout>
          }
        />

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
