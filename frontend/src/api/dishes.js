import api from "./client";

export async function getDishes(branchId) {
    const response = await api.get(
        `/branches/${branchId}/dishes`
    );

    return response.data;
}

export async function createDish(branchId, data) {
    const response = await api.post(
        `/branches/${branchId}/dishes`,
        data
    );

    return response.data;
}

export async function updateDish(branchId, dishId, data) {
    const response = await api.put(
        `/branches/${branchId}/dishes/${dishId}`,
        data
    );

    return response.data;
}

export async function deleteDish(branchId, dishId) {
    const response = await api.delete(
        `/branches/${branchId}/dishes/${dishId}`
    );

    return response.data;
}