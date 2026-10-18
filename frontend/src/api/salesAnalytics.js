import api from "./client";

export async function getBranchSalesAnalytics(
    branchId,
    days = 7,
    startDate = "",
    endDate = "",
) {
    const params = startDate && endDate
        ? { start_date: startDate, end_date: endDate }
        : { days };

    const response = await api.get(
        `/sales-analytics/branches/${encodeURIComponent(branchId)}`,
        { params },
    );

    return response.data;
}