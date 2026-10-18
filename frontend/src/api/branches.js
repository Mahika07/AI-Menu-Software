import api from "./client";

export async function getBranches(restaurantId) {
    const response = await api.get(
        `/restaurants/${restaurantId}/branches`
    );

    return response.data;
}

export async function createBranch(restaurantId, data) {
    const response = await api.post(
        `/restaurants/${restaurantId}/branches`,
        data
    );

    return response.data;
}

export async function updateBranch(
    restaurantId,
    branchId,
    data
) {
    const response = await api.put(
        `/restaurants/${restaurantId}/branches/${branchId}`,
        data
    );

    return response.data;
}

export async function deleteBranch(
    restaurantId,
    branchId
) {
    const response = await api.delete(
        `/restaurants/${restaurantId}/branches/${branchId}`
    );

    return response.data;
}