import api from "./client";

export async function getRestaurants() {
    const response = await api.get("/restaurants");
    return response.data;
}

export async function createRestaurant(data) {
    const response = await api.post("/restaurants", data);
    return response.data;
}

export async function updateRestaurant(id, data) {
    const response = await api.put(`/restaurants/${id}`, data);
    return response.data;
}

export async function deleteRestaurant(id) {
    const response = await api.delete(`/restaurants/${id}`);
    return response.data;
}

// Upload restaurant logo
export async function uploadRestaurantLogo(file) {
    const formData = new FormData();
    formData.append("file", file);

    const response = await api.post(
        "/restaurants/upload-logo",
        formData
    );

    return response.data;
}