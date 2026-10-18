import api from "./client";

export async function getReviews(dishId) {
    const response = await api.get(
        `/public/reviews/dish/${dishId}`
    );

    return response.data;
}

export async function createReview(dishId, reviewData) {
    const response = await api.post(
        "/public/reviews",
        {
            dish_id: dishId,
            ...reviewData,
        }
    );

    return response.data;
}