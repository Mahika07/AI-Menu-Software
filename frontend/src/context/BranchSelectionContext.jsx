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

export function BranchSelectionProvider({ children }) {
  const location = useLocation();
  const params = useParams();

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

  const selectRestaurant = useCallback(
    async (restaurantId) => {
      if (!restaurantId) return;

      const id = String(restaurantId);

      setSelectedRestaurantId(id);
      setSelectedBranchId("");

      localStorage.setItem(RESTAURANT_KEY, id);
      localStorage.removeItem(BRANCH_KEY);

      setBranches([]);
      setError("");

      try {
        const result = await getBranches(id);
        const list = Array.isArray(result) ? result : [];

        setBranches(list);

        const activeBranches = list.filter(
          (branch) => branch.is_active !== false,
        );

        if (activeBranches.length > 0) {
          selectBranch(activeBranches[0], id);
        }
      } catch (err) {
        setError(err?.response?.data?.detail || "Unable to load branches.");
      }
    },
    [selectBranch],
  );

  useEffect(() => {
    let cancelled = false;

    async function initialize() {
      setLoading(true);
      setError("");

      try {
        const result = await getRestaurants();
        const list = Array.isArray(result) ? result : [];

        if (cancelled) return;

        setRestaurants(list);

        if (!list.length) {
          setBranches([]);
          return;
        }

        const routeRestaurantId =
          params.restaurantId ||
          new URLSearchParams(location.search).get("restaurantId");

        const savedRestaurantId = localStorage.getItem(RESTAURANT_KEY);

        const restaurant =
          list.find(
            (r) =>
              String(r.id) === String(routeRestaurantId || savedRestaurantId),
          ) || list[0];

        const restaurantId = String(restaurant.id);

        const branchResult = await getBranches(restaurantId);

        if (cancelled) return;

        const branchList = Array.isArray(branchResult) ? branchResult : [];

        setBranches(branchList);

        const routeBranchId = params.branchId;
        const savedBranchId = localStorage.getItem(BRANCH_KEY);

        const activeBranches = branchList.filter(
          (branch) => branch.is_active !== false,
        );

        const chosenBranch =
          activeBranches.find(
            (branch) =>
              String(branch.id) === String(routeBranchId || savedBranchId),
          ) ||
          activeBranches[0] ||
          branchList[0];

        setSelectedRestaurantId(restaurantId);
        localStorage.setItem(RESTAURANT_KEY, restaurantId);

        if (chosenBranch) {
          setSelectedBranchId(String(chosenBranch.id));
          localStorage.setItem(BRANCH_KEY, String(chosenBranch.id));
        } else {
          setSelectedBranchId("");
          localStorage.removeItem(BRANCH_KEY);
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err?.response?.data?.detail ||
              "Unable to load restaurant and branch selection.",
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    initialize();

    return () => {
      cancelled = true;
    };
  }, [location.pathname]);

  useEffect(() => {
    if (!selectedRestaurantId) return;

    let cancelled = false;

    getBranches(selectedRestaurantId)
      .then((result) => {
        if (cancelled) return;

        const list = Array.isArray(result) ? result : [];
        setBranches(list);

        if (
          selectedBranchId &&
          !list.some((branch) => String(branch.id) === String(selectedBranchId))
        ) {
          const fallback = list.find((branch) => branch.is_active !== false);

          if (fallback) {
            selectBranch(fallback, selectedRestaurantId);
          } else {
            setSelectedBranchId("");
            localStorage.removeItem(BRANCH_KEY);
          }
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(
            err?.response?.data?.detail || "Unable to refresh branches.",
          );
        }
      });

    return () => {
      cancelled = true;
    };
  }, [selectedRestaurantId]);

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
      error,
      selectBranch,
      selectRestaurant,
      setSelectedBranch: selectBranch,
    }),
    [
      restaurants,
      branches,
      selectedRestaurant,
      selectedBranch,
      selectedRestaurantId,
      selectedBranchId,
      loading,
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
