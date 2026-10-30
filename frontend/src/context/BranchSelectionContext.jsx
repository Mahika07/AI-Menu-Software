import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useLocation, useParams } from "react-router-dom";
import { getRestaurants } from "../api/restaurants";
import { getBranches } from "../api/branches";

const BranchSelectionContext = createContext(null);

const RESTAURANT_KEY = "selected_restaurant_id";
const BRANCH_KEY = "selected_branch_id";

function normalizeList(result, keys = []) {
  if (Array.isArray(result)) return result;

  for (const key of keys) {
    if (Array.isArray(result?.[key])) return result[key];
    if (Array.isArray(result?.data?.[key])) return result.data[key];
  }

  if (Array.isArray(result?.data)) return result.data;

  return [];
}

export function BranchSelectionProvider({ children }) {
  const location = useLocation();
  const params = useParams();

  const [restaurants, setRestaurants] = useState([]);
  const [branches, setBranches] = useState([]);

  const [selectedRestaurantId, setSelectedRestaurantId] = useState(
    () => localStorage.getItem(RESTAURANT_KEY) || "",
  );

  const [selectedBranchId, setSelectedBranchId] = useState(
    () => localStorage.getItem(BRANCH_KEY) || "",
  );

  const [loading, setLoading] = useState(true);
  const [loadingRestaurants, setLoadingRestaurants] = useState(true);
  const [loadingBranches, setLoadingBranches] = useState(false);
  const [error, setError] = useState("");

  const selectBranch = useCallback(
    (branch, restaurantId) => {
      const id = typeof branch === "object" ? branch?.id : branch;

      const resolvedRestaurantId =
        restaurantId ||
        (typeof branch === "object" ? branch?.restaurant_id : null) ||
        selectedRestaurantId;

      if (!id) {
        setSelectedBranchId("");
        localStorage.removeItem(BRANCH_KEY);

        window.dispatchEvent(
          new CustomEvent("smart-menu:branch-change", {
            detail: {
              branchId: "",
              restaurantId: resolvedRestaurantId || "",
            },
          }),
        );

        return;
      }

      if (!resolvedRestaurantId) return;

      const nextBranchId = String(id);
      const nextRestaurantId = String(resolvedRestaurantId);

      setSelectedBranchId(nextBranchId);
      setSelectedRestaurantId(nextRestaurantId);

      localStorage.setItem(BRANCH_KEY, nextBranchId);
      localStorage.setItem(RESTAURANT_KEY, nextRestaurantId);

      window.dispatchEvent(
        new CustomEvent("smart-menu:branch-change", {
          detail: {
            branchId: nextBranchId,
            restaurantId: nextRestaurantId,
          },
        }),
      );
    },
    [selectedRestaurantId],
  );

  const loadBranches = useCallback(
    async (restaurantId, preferredBranchId = "") => {
      if (!restaurantId) {
        setBranches([]);
        setSelectedBranchId("");
        localStorage.removeItem(BRANCH_KEY);
        return;
      }

      setLoadingBranches(true);

      try {
        const result = await getBranches(restaurantId);

        const list = normalizeList(result, ["branches", "items"]);
        setBranches(list);

        const activeBranches = list.filter(
          (branch) => branch.is_active !== false,
        );

        const chosenBranch =
          activeBranches.find(
            (branch) => String(branch.id) === String(preferredBranchId),
          ) ||
          activeBranches[0] ||
          list[0];

        if (chosenBranch) {
          selectBranch(chosenBranch, restaurantId);
        } else {
          setSelectedBranchId("");
          localStorage.removeItem(BRANCH_KEY);

          window.dispatchEvent(
            new CustomEvent("smart-menu:branch-change", {
              detail: {
                branchId: "",
                restaurantId: String(restaurantId),
              },
            }),
          );
        }

        return list;
      } catch (err) {
        setBranches([]);
        setSelectedBranchId("");
        localStorage.removeItem(BRANCH_KEY);

        setError(
          err?.response?.data?.detail ||
            "Unable to load branches. Please refresh the page.",
        );

        throw err;
      } finally {
        setLoadingBranches(false);
      }
    },
    [selectBranch],
  );

  // Load restaurants and restore the saved or route-selected restaurant.
  useEffect(() => {
    let cancelled = false;

    async function initialize() {
      setLoading(true);
      setLoadingRestaurants(true);
      setError("");

      try {
        const result = await getRestaurants();

        if (cancelled) return;

        const list = normalizeList(result, ["restaurants", "items"]);

        setRestaurants(list);

        if (!list.length) {
          setBranches([]);
          setSelectedRestaurantId("");
          setSelectedBranchId("");

          localStorage.removeItem(RESTAURANT_KEY);
          localStorage.removeItem(BRANCH_KEY);

          return;
        }

        const routeRestaurantId =
          params.restaurantId ||
          new URLSearchParams(location.search).get("restaurantId");

        const routeBranchId = params.branchId;
        const savedRestaurantId = localStorage.getItem(RESTAURANT_KEY);
        const savedBranchId = localStorage.getItem(BRANCH_KEY);

        const preferredRestaurantId = routeRestaurantId || savedRestaurantId;

        const restaurant =
          list.find(
            (item) => String(item.id) === String(preferredRestaurantId),
          ) || list[0];

        const restaurantId = String(restaurant.id);

        setSelectedRestaurantId(restaurantId);
        localStorage.setItem(RESTAURANT_KEY, restaurantId);

        setLoadingRestaurants(false);

        const preferredBranchId = routeBranchId || savedBranchId;

        await loadBranches(restaurantId, preferredBranchId);
      } catch (err) {
        if (!cancelled) {
          setError(
            err?.response?.data?.detail ||
              "Unable to load your restaurants. Please check your connection and try again.",
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
          setLoadingRestaurants(false);
        }
      }
    }

    initialize();

    return () => {
      cancelled = true;
    };
  }, [
    location.pathname,
    location.search,
    params.restaurantId,
    params.branchId,
    loadBranches,
  ]);

  // Change restaurant from the global dashboard selector.
  const selectRestaurant = useCallback(
    async (restaurantId) => {
      if (!restaurantId) return;

      const id = String(restaurantId);

      setSelectedRestaurantId(id);
      setSelectedBranchId("");
      setBranches([]);
      setError("");

      localStorage.setItem(RESTAURANT_KEY, id);
      localStorage.removeItem(BRANCH_KEY);

      window.dispatchEvent(
        new CustomEvent("smart-menu:branch-change", {
          detail: {
            branchId: "",
            restaurantId: id,
          },
        }),
      );

      try {
        await loadBranches(id);
      } catch {
        // loadBranches already updates the error state.
      }
    },
    [loadBranches],
  );

  const selectedRestaurant =
    restaurants.find(
      (restaurant) => String(restaurant.id) === String(selectedRestaurantId),
    ) || null;

  const selectedBranch =
    branches.find((branch) => String(branch.id) === String(selectedBranchId)) ||
    null;

  const value = useMemo(
    () => ({
      restaurants,
      branches,

      selectedRestaurant,
      selectedBranch,

      selectedRestaurantId,
      selectedBranchId,

      loading,
      loadingRestaurants,
      loadingBranches,
      error,

      selectBranch,
      selectRestaurant,

      // Exposed for compatibility with components using these setters.
      setSelectedBranch: selectBranch,
      setBranches,
      setLoadingRestaurants,
      setSelectedRestaurantId,
      setSelectedBranchId,
      setError,
    }),
    [
      restaurants,
      branches,
      selectedRestaurant,
      selectedBranch,
      selectedRestaurantId,
      selectedBranchId,
      loading,
      loadingRestaurants,
      loadingBranches,
      error,
      selectBranch,
      selectRestaurant,
    ],
  );

  return (
    <BranchSelectionContext.Provider value={value}>
      {children}
    </BranchSelectionContext.Provider>
  );
}

export function useBranchSelection() {
  const context = useContext(BranchSelectionContext);

  if (!context) {
    throw new Error(
      "useBranchSelection must be used inside BranchSelectionProvider",
    );
  }

  return context;
}
