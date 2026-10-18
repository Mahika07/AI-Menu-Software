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