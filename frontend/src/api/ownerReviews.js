import api from "./client";

export async function getOwnerReviews(branchId) {
    const response = await api.get(
        `/ reviews / branches / ${branchId} `
    );

    return response.data;
}
