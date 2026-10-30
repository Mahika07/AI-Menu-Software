import { Building2, GitBranch } from "lucide-react";
import { useBranchSelection } from "../context/BranchSelectionContext";

export default function RestaurantBranchSelector() {
  const { restaurants, branches, selectedRestaurantId, selectedBranchId, loading, selectRestaurant, selectBranch } = useBranchSelection();

  return (
    <div className="global-branch-selector" aria-label="Current restaurant and branch">
      <label className="global-selector-field">
        <Building2 size={17} />
        <span className="sr-only">Restaurant</span>
        <select value={selectedRestaurantId} disabled={loading || !restaurants.length} onChange={(e) => selectRestaurant(e.target.value)}>
          {!restaurants.length && <option value="">No restaurants</option>}
          {restaurants.map((restaurant) => <option key={restaurant.id} value={restaurant.id}>{restaurant.name}</option>)}
        </select>
      </label>
      <label className="global-selector-field">
        <GitBranch size={17} />
        <span className="sr-only">Branch</span>
        <select value={selectedBranchId} disabled={loading || !branches.length} onChange={(e) => selectBranch(e.target.value)}>
          {!branches.length && <option value="">No branches</option>}
          {branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
        </select>
      </label>
    </div>
  );
}
