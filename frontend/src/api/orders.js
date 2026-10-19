
import api from "./client";

const SESSION_STORAGE_PREFIX = "smart-menu:dining-session:";
const CLOSED_SESSION_PREFIX = "smart-menu:dining-session-closed:";

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

function closedSessionKey(qrToken) {
    return `${CLOSED_SESSION_PREFIX}${normalizeQrToken(qrToken)}`;
}

function readSessionToken(qrToken) {
    return window.localStorage.getItem(storageKey(qrToken));
}

function saveSessionToken(qrToken, token) {
    window.localStorage.setItem(storageKey(qrToken), token);
}

function isSessionMarkedClosed(qrToken) {
    return window.localStorage.getItem(closedSessionKey(qrToken)) === "true";
}

function markSessionClosed(qrToken) {
    window.localStorage.setItem(closedSessionKey(qrToken), "true");
}

export function forgetDiningSession(qrToken) {
    const token = normalizeQrToken(qrToken);

    window.localStorage.removeItem(storageKey(token));
}

export async function getOrCreateDiningSession(
    qrToken,
    forceNew = false,
) {
    const token = normalizeQrToken(qrToken);

    // Do not silently reopen a session closed by staff.
    if (!forceNew && isSessionMarkedClosed(token)) {
        throw new Error(
            "This dining session has been closed by staff. " +
            "Start a new dining session to continue ordering.",
        );
    }

    if (!forceNew) {
        const existingToken = readSessionToken(token);

        if (existingToken) {
            return { token: existingToken };
        }
    }

    const response = await api.post(
        `/public/tables/${encodeURIComponent(token)}/sessions`,
    );

    const sessionToken = response.data?.token;

    if (!sessionToken || typeof sessionToken !== "string") {
        throw new Error(
            "The server did not return a valid dining-session token.",
        );
    }

    saveSessionToken(token, sessionToken);

    // A new session has been explicitly created.
    window.localStorage.removeItem(closedSessionKey(token));

    return response.data;
}

/**
 * Explicitly start a new dining session.
 * Intended for use after staff has closed the previous session.
 */
export async function startNewDiningSession(qrToken) {
    const token = normalizeQrToken(qrToken);

    forgetDiningSession(token);

    // Clear the closed marker only for this explicit action.
    window.localStorage.removeItem(closedSessionKey(token));

    try {
        return await getOrCreateDiningSession(token, true);
    } catch (error) {
        // If creation fails, do not leave an apparently active session.
        forgetDiningSession(token);
        throw error;
    }
}

function getSessionHeaders(qrToken) {
    const sessionToken = readSessionToken(qrToken);

    if (!sessionToken) {
        throw new Error(
            "Your dining session is not ready. Refresh the menu.",
        );
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

        // A closed session must never be silently replaced.
        if (statusCode === 410) {
            forgetDiningSession(token);
            markSessionClosed(token);

            throw new Error(
                "This dining session has been closed by staff. " +
                "Start a new dining session to continue.",
            );
        }

        // A 401 may indicate an invalid token. Do not automatically
        // create a replacement session, because that could separate
        // customers from their existing dining session.
        if (statusCode === 401) {
            forgetDiningSession(token);

            throw new Error(
                "Your dining-session token is no longer valid. " +
                "Please refresh the menu or start a new session if prompted.",
            );
        }

        throw error;
    }
}

export async function createDineInOrder(qrToken, orderData) {
    return sessionRequest(qrToken, async (token) => {
        const response = await api.post(
            `/public/tables/${encodeURIComponent(token)}/orders`,
            orderData,
            {
                headers: getSessionHeaders(token),
            },
        );

        return response.data;
    });
}

export async function getOrderStatus(orderNumber) {
    const response = await api.get(
        `/public/orders/${encodeURIComponent(
            String(orderNumber).trim(),
        )}`,
    );

    return response.data;
}

export async function getTableOrders(qrToken) {
    return sessionRequest(qrToken, async (token) => {
        const response = await api.get(
            `/public/tables/${encodeURIComponent(token)}/orders`,
            {
                headers: getSessionHeaders(token),
            },
        );

        return response.data;
    });
}


export async function cancelTableOrderItem(qrToken, orderNumber, itemId) {
    return sessionRequest(qrToken, async (token) => {
        const response = await api.post(
            `/public/tables/${encodeURIComponent(token)}/orders/${encodeURIComponent(orderNumber)}/items/${encodeURIComponent(itemId)}/cancel`,
            {},
            {
                headers: getSessionHeaders(token),
            },
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

    if (statusFilter) {
        params.status = statusFilter;
    }

    if (tableNumber) {
        params.table_number = tableNumber;
    }

    const response = await api.get(
        `/branches/${encodeURIComponent(branchId)}/orders`,
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
