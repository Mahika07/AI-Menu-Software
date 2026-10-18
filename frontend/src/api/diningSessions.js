
import api from "./client";

export async function getDiningSessions(branchId) {
    const response = await api.get(
        `/branches/${encodeURIComponent(branchId)}/dining-sessions`,
    );
    return response.data;
}

export async function closeDiningSession(branchId, sessionId) {
    const response = await api.patch(
        `/branches/${encodeURIComponent(branchId)}/dining-sessions/${encodeURIComponent(sessionId)}/close`,
    );
    return response.data;
}

export async function resetTableSession(branchId, tableId) {
    const response = await api.post(
        `/branches/${encodeURIComponent(branchId)}/dining-sessions/tables/${encodeURIComponent(tableId)}/reset`,
    );
    return response.data;
}
