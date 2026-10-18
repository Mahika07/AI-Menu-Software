import api from "./client";

/**
 * Track a customer analytics event.
 */
export async function trackEvent({
    branchId,
    tableId = null,
    dishId = null,
    eventType,
    sessionId = null,
    eventMetadata = null,
}) {
    try {
        await api.post("/analytics/events", {
            branch_id: branchId,
            table_id: tableId,
            dish_id: dishId,
            event_type: eventType,
            session_id: sessionId,
            event_metadata: eventMetadata,
        });
    } catch (error) {
        // Analytics must never break the customer menu.
        console.error("Analytics event failed:", error);
    }
}

/**
 * Get analytics dashboard data for a branch.
 */
export async function getBranchAnalytics(
    branchId,
    days = 7,
) {
    const response = await api.get(
        `/analytics/branches/${branchId}`,
        {
            params: {
                days,
            },
        },
    );

    return response.data;
}

