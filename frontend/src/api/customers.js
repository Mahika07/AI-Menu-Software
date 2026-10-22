
import api from "./client";

/**
 * Get customers for a specific branch.
 * Supports searching by name, phone number, or email.
 */
export async function getCustomers(
    branchId,
    { search = "", limit = 50, offset = 0 } = {},
) {
    const response = await api.get(
        `/branches/${encodeURIComponent(branchId)}/customers`,
        {
            params: {
                ...(search.trim() ? { search: search.trim() } : {}),
                limit,
                offset,
            },
        },
    );

    return response.data;
}

/**
 * Get one customer by ID.
 */
export async function getCustomer(branchId, customerId) {
    const response = await api.get(
        `/branches/${encodeURIComponent(branchId)}/customers/${encodeURIComponent(customerId)}`,
    );

    return response.data;
}

/**
 * Create a new customer for a branch.
 */
export async function createCustomer(branchId, customerData) {
    const response = await api.post(
        `/branches/${encodeURIComponent(branchId)}/customers`,
        customerData,
    );

    return response.data;
}

/**
 * Update an existing customer.
 */
export async function updateCustomer(
    branchId,
    customerId,
    customerData,
) {
    const response = await api.patch(
        `/branches/${encodeURIComponent(branchId)}/customers/${encodeURIComponent(customerId)}`,
        customerData,
    );

    return response.data;
}

/**
 * Get a customer's order and bill history.
 */
export async function getCustomerHistory(branchId, customerId) {
    const response = await api.get(
        `/branches/${encodeURIComponent(branchId)}/customers/${encodeURIComponent(customerId)}/history`,
    );

    return response.data;
}
