import api from "./client";

// Get bills for a branch (basic, non-paginated endpoint)
export async function getBranchBills(branchId, limit = 100) {
    const response = await api.get(
        `/branches/${encodeURIComponent(branchId)}/bills`,
        {
            params: { limit },
        },
    );

    return response.data;
}

// Get a single bill by ID
export async function getBillById(branchId, billId) {
    const response = await api.get(
        `/branches/${encodeURIComponent(branchId)}/bills/${encodeURIComponent(billId)}`,
    );

    return response.data;
}

// Create a bill for an order
export async function createBill(branchId, orderId, billData = {}) {
    const response = await api.post(
        `/branches/${encodeURIComponent(branchId)}/bills/orders/${encodeURIComponent(orderId)}`,
        {
            discount_amount: billData.discount_amount ?? "0.00",
            tax_rate: billData.tax_rate ?? "0.00",
        },
    );

    return response.data;
}

// Mark a bill as paid
export async function markBillPaid(branchId, billId, paymentMethod) {
    const response = await api.patch(
        `/branches/${encodeURIComponent(branchId)}/bills/${encodeURIComponent(billId)}/payment`,
        {
            payment_method: paymentMethod,
        },
    );

    return response.data;
}

// Get bill analytics, optionally filtered by date
export async function getBranchBillAnalytics(
    branchId,
    startDate = "",
    endDate = "",
) {
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

// Get one page of bills with optional server-side filters
export async function getBranchBillsPage(
    branchId,
    limit = 20,
    offset = 0,
    search = "",
    paymentStatus = "all",
) {
    const params = {
        limit,
        offset,
    };

    if (typeof search === "string" && search.trim()) {
        params.search = search.trim();
    }

    if (
        typeof paymentStatus === "string" &&
        paymentStatus.trim() &&
        paymentStatus.toLowerCase() !== "all"
    ) {
        params.payment_status = paymentStatus.toLowerCase();
    }

    const response = await api.get(
        `/branches/${encodeURIComponent(branchId)}/bills/paginated`,
        { params },
    );

    return response.data;
}

// Get all bills by fetching every page.
// Used for full-branch exports rather than the current page only.
export async function getAllBranchBills(branchId, pageSize = 100) {
    const allBills = [];
    let offset = 0;
    let total = null;

    while (total === null || offset < total) {
        const page = await getBranchBillsPage(
            branchId,
            pageSize,
            offset,
        );

        if (
            !page ||
            !Array.isArray(page.items) ||
            typeof page.total !== "number"
        ) {
            throw new Error("Invalid paginated bills response.");
        }

        allBills.push(...page.items);

        const previousOffset = offset;
        total = page.total;
        offset += page.items.length;

        // Avoid an infinite loop if the API returns no items or invalid progress.
        if (page.items.length === 0 || offset <= previousOffset) {
            break;
        }
    }

    return allBills;
}