
import api from "./client";

export async function login(email, password) {
    const response = await api.post("/auth/login", {
        email,
        password,
    });

    return response.data;
}

export async function getCurrentUser() {
    const response = await api.get("/auth/me");
    return response.data;
}

export async function updateCurrentUser(profileData) {
    const response = await api.patch("/auth/me", profileData);
    return response.data;
}

export async function changePassword(data) {
    const response = await api.post("/auth/change-password", data);
    return response.data;
}

export async function requestPasswordReset(email) {
    const response = await api.post("/auth/forgot-password", { email });
    return response.data;
}

export async function resetPassword(token, new_password) {
    const response = await api.post("/auth/reset-password", { token, new_password });
    return response.data;
}
