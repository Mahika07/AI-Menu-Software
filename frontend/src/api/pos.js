
import api from "./client";

export async function createPOSOrder(branchId, orderData) {
    const response = await api.post(
        `/branches/${encodeURIComponent(branchId)}/pos/orders`,
        orderData,
    );

    return response.data;
}
