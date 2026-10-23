
import api from "./client";

export async function getOperationsAnalytics(
    branchId,
    startDate = "",
    endDate = ""
) {
    if (!branchId) {
        throw new Error("Select a branch to load operations analytics.");
    }

    const response = await api.get(
        `/branches/${encodeURIComponent(branchId)}/operations-analytics`,
        {
            params: {
                ...(startDate ? { start_date: startDate } : {}),
                ...(endDate ? { end_date: endDate } : {}),
            },
        }
    );

    return response.data;
}

export async function getExpenses(
    branchId,
    startDate = "",
    endDate = ""
) {
    if (!branchId) {
        throw new Error("Select a branch to load expenses.");
    }

    const response = await api.get(
        `/branches/${encodeURIComponent(branchId)}/expenses`,
        {
            params: {
                ...(startDate ? { start_date: startDate } : {}),
                ...(endDate ? { end_date: endDate } : {}),
            },
        }
    );

    return response.data;
}

export async function createExpense(branchId, expense) {
    const response = await api.post(
        `/branches/${encodeURIComponent(branchId)}/expenses`,
        expense
    );

    return response.data;
}

export async function updateExpense(branchId, expenseId, expense) {
    const response = await api.patch(
        `/branches/${encodeURIComponent(branchId)}/expenses/${encodeURIComponent(expenseId)}`,
        expense
    );

    return response.data;
}

export async function deleteExpense(branchId, expenseId) {
    await api.delete(
        `/branches/${encodeURIComponent(branchId)}/expenses/${encodeURIComponent(expenseId)}`
    );
}
