import { Building2, GitBranch } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { useBranchSelection } from "../context/BranchSelectionContext";

export default function RestaurantBranchSelector() {
  const {
    restaurants,
    branches,
    selectedRestaurantId,
    selectedBranchId,
    selectRestaurant,
    selectBranch,
    loading,
  } = useBranchSelection();

  const location = useLocation();
  const navigate = useNavigate();

  function handleBranchChange(branch) {
    if (!branch) return;

    // Update the global branch context.
    selectBranch(branch, selectedRestaurantId);

    // Update branch-specific URLs when necessary.
    if (/\/branches\/[^/]+\//.test(location.pathname)) {
      const updatedPath = location.pathname.replace(
        /(\/branches\/)[^/]+/,
        `$1${branch.id}`,
      );

      navigate(updatedPath, { replace: true });
    }
  }

  async function handleRestaurantChange(restaurantId) {
    if (!restaurantId) return;

    // Load the new restaurant's branches and select a valid default.
    await selectRestaurant(restaurantId);

    // Leave the old branch-specific route because it belongs
    // to the previously selected restaurant.
    if (/\/branches\/[^/]+\//.test(location.pathname)) {
      navigate(`/dashboard/restaurants/${restaurantId}/branches`, {
        replace: true,
      });
    }
  }

  return (
    <div
      className="global-workspace-selector"
      aria-label="Current restaurant and branch"
    >
      <div className="global-workspace-copy">
        <span>WORKSPACE</span>
        <strong>Current location</strong>
      </div>

      {/* Restaurant selector */}
      <label className="global-selector-field">
        <Building2 size={18} />

        <span className="sr-only">Restaurant</span>

        <select
          value={selectedRestaurantId}
          disabled={loading || !restaurants.length}
          onChange={(e) => handleRestaurantChange(e.target.value)}
        >
          {!restaurants.length && <option value="">No restaurants</option>}

          {restaurants.map((restaurant) => (
            <option key={restaurant.id} value={restaurant.id}>
              {restaurant.name}
            </option>
          ))}
        </select>
      </label>

      {/* Branch selector */}
      <label className="global-selector-field branch">
        <GitBranch size={18} />

        <span className="sr-only">Branch</span>

        <select
          value={selectedBranchId}
          disabled={loading || !branches.length}
          onChange={(e) => {
            const branch = branches.find(
              (item) => String(item.id) === String(e.target.value),
            );

            if (branch) {
              handleBranchChange(branch);
            }
          }}
        >
          {!branches.length && <option value="">No branches</option>}

          {branches.map((branch) => (
            <option key={branch.id} value={branch.id}>
              {branch.name}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
