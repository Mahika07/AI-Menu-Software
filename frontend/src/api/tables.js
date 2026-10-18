import api from "./client";

export async function getTables(branchId) {
    const response = await api.get(
        `/branches/${branchId}/tables`
    );

    return response.data;
}

export async function createTable(branchId, data) {
    const response = await api.post(
        `/branches/${branchId}/tables`,
        data
    );

    return response.data;
}

export async function updateTable(
    branchId,
    tableId,
    data
) {
    const response = await api.put(
        `/branches/${branchId}/tables/${tableId}`,
        data
    );

    return response.data;
}

export async function deleteTable(
    branchId,
    tableId
) {
    await api.delete(
        `/branches/${branchId}/tables/${tableId}`
    );
}