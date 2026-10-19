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
    const response = await api.patch("/auth/me", {
        full_name: profileData.full_name.trim(),
        email: profileData.email.trim().toLowerCase(),
    });

    return response.data;
}

export async function updateCurrentUser(data) {
    const response = await api.patch("/auth/me", data);
    return response.data;
}

export async function changePassword(data) {
    const response = await api.post("/auth/change-password", data);
    return response.data;
}
