
import api from "./client";

const SESSION_STORAGE_PREFIX = "smart-menu:dining-session:";

function normalizeQrToken(qrToken) {
    const token = String(qrToken ?? "").trim();

    if (!token) {
        throw new Error("A table QR token is required.");
    }

    return token;
}

function storageKey(qrToken) {
    return `${SESSION_STORAGE_PREFIX}${normalizeQrToken(qrToken)}`;
}

function readSessionToken(qrToken) {
    return window.localStorage.getItem(storageKey(qrToken));
}

function saveSessionToken(qrToken, token) {
    window.localStorage.setItem(storageKey(qrToken), token);
}

export function forgetDiningSession(qrToken) {
    const token = normalizeQrToken(qrToken);
    window.localStorage.removeItem(storageKey(token));
}

export async function getOrCreateDiningSession(qrToken, forceNew = false) {
    const token = normalizeQrToken(qrToken);

    if (!forceNew) {
        const existingToken = readSessionToken(token);
        if (existingToken) return { token: existingToken };
    }

    const response = await api.post(
        `/public/tables/${encodeURIComponent(token)}/sessions`,
    );

    const sessionToken = response.data?.token;

    if (!sessionToken || typeof sessionToken !== "string") {
        throw new Error("The server did not return a valid dining session.");
    }

    saveSessionToken(token, sessionToken);
    return response.data;
}

function getSessionHeaders(qrToken) {
    const sessionToken = readSessionToken(qrToken);

    if (!sessionToken) {
        throw new Error("Your dining session is not ready. Refresh the menu.");
    }

    return {
        "X-Dining-Session-Token": sessionToken,
    };
}

async function sessionRequest(qrToken, request) {
    const token = normalizeQrToken(qrToken);
    await getOrCreateDiningSession(token);

    try {
        return await request(token);
    } catch (error) {
        const statusCode = error.response?.status;

        if (statusCode !== 401 && statusCode !== 410) throw error;

        forgetDiningSession(token);
        await getOrCreateDiningSession(token, true);

        return request(token);
    }
}

export async function createDineInOrder(qrToken, orderData) {
    return sessionRequest(qrToken, async (token) => {
        const response = await api.post(
            `/public/tables/${encodeURIComponent(token)}/orders`,
            orderData,
            { headers: getSessionHeaders(token) },
        );

        return response.data;
    });
}

export async function getOrderStatus(orderNumber) {
    const response = await api.get(
        `/public/orders/${encodeURIComponent(String(orderNumber).trim())}`,
    );

    return response.data;
}

export async function getTableOrders(qrToken) {
    return sessionRequest(qrToken, async (token) => {
        const response = await api.get(
            `/public/tables/${encodeURIComponent(token)}/orders`,
            { headers: getSessionHeaders(token) },
        );

        return response.data;
    });
}

export async function cancelTableOrderItem(qrToken, orderNumber, itemId) {
    return sessionRequest(qrToken, async (token) => {
        const response = await api.post(
            `/public/tables/${encodeURIComponent(token)}/orders/${encodeURIComponent(orderNumber)}/items/${encodeURIComponent(itemId)}/cancel`,
            {},
            { headers: getSessionHeaders(token) },
        );

        return response.data;
    });
}
export async function cancelTableOrder(qrToken, orderNumber) {
    return sessionRequest(qrToken, async (token) => {
        const response = await api.post(
            `/public/tables/${encodeURIComponent(token)}/orders/${encodeURIComponent(orderNumber)}/cancel`,
            {},
            { headers: getSessionHeaders(token) },
        );

        return response.data;
    });
}
export async function getBranchOrders(
    branchId,
    statusFilter = "",
    tableNumber = "",
) {
    const params = {};

    if (statusFilter) params.status = statusFilter;
    if (tableNumber) params.table_number = tableNumber;

    const response = await api.get(
        `/branches/${encodeURIComponent(branchId)}/orders`,
        { params },
    );

    return response.data;
}

export async function getBranchOrderHistory(
    branchId,
    {
        search = "",
        status = "",
        tableNumber = "",
        startDate = "",
        endDate = "",
        limit = 20,
        offset = 0,
    } = {},
) {
    const params = { limit, offset };

    if (search.trim()) params.search = search.trim();
    if (status) params.status = status;
    if (tableNumber.trim()) params.table_number = tableNumber.trim();
    if (startDate) params.start_date = startDate;
    if (endDate) params.end_date = endDate;

    const response = await api.get(
        `/branches/${encodeURIComponent(branchId)}/orders/history`,
        { params },
    );

    return response.data;
}

export async function updateOrderStatus(branchId, orderId, status) {
    const response = await api.patch(
        `/branches/${encodeURIComponent(branchId)}/orders/${encodeURIComponent(orderId)}/status`,
        { status },
    );

    return response.data;
}

export async function updateOrderItemStatus(
    branchId,
    orderId,
    itemId,
    status,
) {
    const response = await api.patch(
        `/branches/${encodeURIComponent(branchId)}/orders/${encodeURIComponent(orderId)}/items/${encodeURIComponent(itemId)}/status`,
        { status },
    );

    return response.data;
}
