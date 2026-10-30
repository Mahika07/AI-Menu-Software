import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { getRestaurants } from "../api/restaurants";
import { getBranches } from "../api/branches";

const BranchSelectionContext = createContext(null);
const RESTAURANT_KEY = "selected_restaurant_id";
const BRANCH_KEY = "selected_branch_id";

function notifySelectionChange() {
  window.dispatchEvent(new CustomEvent("smart-menu:branch-change"));
}

export function BranchSelectionProvider({ children }) {
  const [restaurants, setRestaurants] = useState([]);
  const [branches, setBranches] = useState([]);
  const [selectedRestaurantId, setSelectedRestaurantId] = useState(
    localStorage.getItem(RESTAURANT_KEY) || "",
  );
  const [selectedBranchId, setSelectedBranchId] = useState(
    localStorage.getItem(BRANCH_KEY) || "",
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const persist = useCallback((restaurantId, branchId) => {
    if (restaurantId)
      localStorage.setItem(RESTAURANT_KEY, String(restaurantId));
    else localStorage.removeItem(RESTAURANT_KEY);
    if (branchId) localStorage.setItem(BRANCH_KEY, String(branchId));
    else localStorage.removeItem(BRANCH_KEY);
    setSelectedRestaurantId(restaurantId ? String(restaurantId) : "");
    setSelectedBranchId(branchId ? String(branchId) : "");
    notifySelectionChange();
  }, []);

  const loadRestaurantBranches = useCallback(
    async (restaurantId, restaurantList = restaurants, initial = false) => {
      if (!restaurantId) {
        setBranches([]);
        persist("", "");
        return;
      }
      try {
        const rows = await getBranches(restaurantId);
        const list = Array.isArray(rows)
          ? rows.filter((b) => b.is_active !== false)
          : [];
        setBranches(list);
        const savedBranch = localStorage.getItem(BRANCH_KEY);
        const validSaved = list.find(
          (b) => String(b.id) === String(savedBranch),
        );
        const branch = validSaved || list[0] || null;
        const restaurant = (restaurantList || []).find(
          (r) => String(r.id) === String(restaurantId),
        );
        persist(restaurantId, branch?.id || "");
        if (!restaurant && initial)
          setError("Selected restaurant is no longer available.");
      } catch (err) {
        console.error("Unable to load branches", err);
        setBranches([]);
        persist(restaurantId, "");
        setError(err.response?.data?.detail || "Unable to load branches.");
      }
    },
    [persist, restaurants],
  );

  const loadRestaurants = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const rows = await getRestaurants();
      const list = Array.isArray(rows)
        ? rows.filter((r) => r.is_active !== false)
        : [];
      setRestaurants(list);
      if (!list.length) {
        setBranches([]);
        persist("", "");
        return;
      }
      const savedId = localStorage.getItem(RESTAURANT_KEY);
      const selected =
        list.find((r) => String(r.id) === String(savedId)) || list[0];
      await loadRestaurantBranches(selected.id, list, true);
    } catch (err) {
      console.error("Unable to load restaurant/branch selection", err);
      setError(
        err.response?.data?.detail ||
          "Unable to load restaurants and branches.",
      );
    } finally {
      setLoading(false);
    }
  }, [persist]);

  useEffect(() => {
    loadRestaurants();
  }, [loadRestaurants]);

  const selectRestaurant = useCallback(
    async (restaurantId) => {
      setSelectedRestaurantId(String(restaurantId));
      localStorage.setItem(RESTAURANT_KEY, String(restaurantId));
      setSelectedBranchId("");
      localStorage.removeItem(BRANCH_KEY);
      setBranches([]);
      notifySelectionChange();
      await loadRestaurantBranches(restaurantId, restaurants, false);
    },
    [loadRestaurantBranches, restaurants],
  );

  const selectBranch = useCallback(
    (branchId) => {
      const branch = branches.find((b) => String(b.id) === String(branchId));
      if (!branch) return;
      const restaurantId = branch.restaurant_id || selectedRestaurantId;
      persist(restaurantId, branch.id);
    },
    [branches, persist, selectedRestaurantId],
  );

  const value = useMemo(
    () => ({
      restaurants,
      branches,
      selectedRestaurantId,
      selectedBranchId,
      loading,
      error,
      selectedRestaurant:
        restaurants.find(
          (r) => String(r.id) === String(selectedRestaurantId),
        ) || null,
      selectedBranch:
        branches.find((b) => String(b.id) === String(selectedBranchId)) || null,
      selectRestaurant,
      selectBranch,
      reloadSelection: loadRestaurants,
    }),
    [
      restaurants,
      branches,
      selectedRestaurantId,
      selectedBranchId,
      loading,
      error,
      selectRestaurant,
      selectBranch,
      loadRestaurants,
    ],
  );

  return (
    <BranchSelectionContext.Provider value={value}>
      {children}
    </BranchSelectionContext.Provider>
  );
}

export function useBranchSelection() {
  const value = useContext(BranchSelectionContext);
  if (!value)
    throw new Error(
      "useBranchSelection must be used inside BranchSelectionProvider",
    );
  return value;
}

// Reactive bridge for existing pages that consume selected_branch_id.
export function useSelectedBranchId() {
  const { selectedBranchId } = useBranchSelection();
  return selectedBranchId;
}
