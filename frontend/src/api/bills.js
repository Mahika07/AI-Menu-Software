
/**
 * Smart Menu — Bills API
 *
 * Handles bill listing, bill creation, payment updates,
 * paginated transaction history, and POS report analytics.
 */

import api from "./client";

/**
 * Get bills for a branch.
 */
export async function getBranchBills(branchId, limit = 100) {
    if (!branchId) {
        throw new Error("A branch must be selected to load bills.");
    }

    const response = await api.get(
        `/branches/${encodeURIComponent(branchId)}/bills`,
        {
            params: { limit },
        },
    );

    return response.data;
}

/**
 * Get a single bill by ID.
 */
export async function getBillById(branchId, billId) {
    if (!branchId || !billId) {
        throw new Error("Branch ID and bill ID are required.");
    }

    const response = await api.get(
        `/branches/${encodeURIComponent(branchId)}/bills/${encodeURIComponent(billId)}`,
    );

    return response.data;
}

/**
 * Create a bill for an existing order.
 */
export async function createBill(branchId, orderId, billData = {}) {
    if (!branchId || !orderId) {
        throw new Error("Branch ID and order ID are required.");
    }

    const response = await api.post(
        `/branches/${encodeURIComponent(branchId)}/bills/orders/${encodeURIComponent(orderId)}`,
        {
            discount_amount: billData.discount_amount ?? "0.00",
            tax_rate: billData.tax_rate ?? "0.00",
        },
    );

    return response.data;
}

/**
 * Mark a bill as paid using the selected payment method.
 */
export async function markBillPaid(branchId, billId, paymentMethod) {
    if (!branchId || !billId) {
        throw new Error("Branch ID and bill ID are required.");
    }

    if (!paymentMethod) {
        throw new Error("A payment method is required.");
    }

    const response = await api.patch(
        `/branches/${encodeURIComponent(branchId)}/bills/${encodeURIComponent(billId)}/payment`,
        {
            payment_method: paymentMethod,
        },
    );

    return response.data;
}

/**
 * Get billing and collection analytics for POS reports.
 *
 * @param {string|number} branchId
 * @param {string} startDate - Optional YYYY-MM-DD
 * @param {string} endDate - Optional YYYY-MM-DD
 */
export async function getBranchBillAnalytics(
    branchId,
    startDate = "",
    endDate = "",
) {
    if (!branchId) {
        throw new Error("A branch must be selected to load POS reports.");
    }

    if (startDate && endDate && startDate > endDate) {
        throw new Error("Start date cannot be after end date.");
    }

    const response = await api.get(
        `/branches/${encodeURIComponent(branchId)}/bills/analytics/summary`,
        {
            params: {
                ...(startDate ? { start_date: startDate } : {}),
                ...(endDate ? { end_date: endDate } : {}),
            },
        },
    );

    return response.data;
}

/**
 * Get one page of bills with optional search and payment-status filtering.
 */
export async function getBranchBillsPage(
    branchId,
    limit = 20,
    offset = 0,
    search = "",
    paymentStatus = "all",
    filters = {},
) {
    if (!branchId) {
        throw new Error("A branch must be selected to load bills.");
    }

    const trimmedSearch = String(search ?? "").trim();
    const normalizedStatus = String(paymentStatus ?? "all")
        .trim()
        .toLowerCase();

    const {
        paymentMethod = "all",
        startDate = "",
        endDate = "",
    } = filters ?? {};

    if (startDate && endDate && startDate > endDate) {
        throw new Error("Start date cannot be after end date.");
    }

    const params = {
        limit,
        offset,
        ...(trimmedSearch ? { search: trimmedSearch } : {}),
        ...(normalizedStatus && normalizedStatus !== "all"
            ? { payment_status: normalizedStatus }
            : {}),
        ...(paymentMethod && paymentMethod !== "all"
            ? { payment_method: paymentMethod }
            : {}),
        ...(startDate ? { start_date: startDate } : {}),
        ...(endDate ? { end_date: endDate } : {}),
    };

    const response = await api.get(
        `/branches/${encodeURIComponent(branchId)}/bills/paginated`,
        { params },
    );

    return response.data;
}

/**
 * Get all transaction-history records across every page.
 */
export async function getAllBranchBills(branchId, pageSize = 100) {
    if (!branchId) {
        throw new Error("A branch must be selected to load bills.");
    }

    if (!Number.isInteger(pageSize) || pageSize < 1) {
        throw new Error("Page size must be a positive integer.");
    }

    const allBills = [];
    let offset = 0;
    let total = null;

    while (total === null || offset < total) {
        const page = await getBranchBillsPage(
            branchId,
            pageSize,
            offset,
        );

        if (!page || !Array.isArray(page.items)) {
            throw new Error("Invalid paginated bills response.");
        }

        allBills.push(...page.items);

        const pageTotal = Number(page.total);

        if (!Number.isFinite(pageTotal) || pageTotal < 0) {
            throw new Error("Invalid total count in paginated bills response.");
        }

        total = pageTotal;
        offset += page.items.length;

        // Stop safely if the backend returns an empty page.
        if (page.items.length === 0) {
            break;
        }
    }

    return allBills;
}

/**
 * Get transaction history with search, status, method, and date filters.
 */
export async function getBranchTransactionHistory(
    branchId,
    {
        search = "",
        paymentStatus = "all",
        paymentMethod = "all",
        startDate = "",
        endDate = "",
        limit = 20,
        offset = 0,
    } = {},
) {
    return getBranchBillsPage(
        branchId,
        limit,
        offset,
        search,
        paymentStatus,
        {
            paymentMethod,
            startDate,
            endDate,
        },
    );
}
