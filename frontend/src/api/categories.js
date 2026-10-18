import api from "./client";

export async function getCategories(branchId) {
    const response = await api.get(`/branches/${branchId}/categories`);
    return response.data;
}

export async function createCategory(branchId, data) {
    const response = await api.post(`/branches/${branchId}/categories`, data);
    return response.data;
}

export async function updateCategory(branchId, categoryId, data) {
    const response = await api.put(
        `/branches/${branchId}/categories/${categoryId}`,
        data
    );
    return response.data;
}

export async function deleteCategory(branchId, categoryId) {
    const response = await api.delete(
        `/branches/${branchId}/categories/${categoryId}`
    );
    return response.data;
}