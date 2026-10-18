import axios from "axios";
import { API_BASE_URL } from "./config";

const api = axios.create({
    baseURL: API_BASE_URL,
    headers: {
        "Content-Type": "application/json",
    },
});

// Attach JWT token to protected requests.
api.interceptors.request.use(
    (config) => {
        const token = localStorage.getItem("access_token");

        if (token) {
            config.headers = config.headers || {};
            config.headers.Authorization = `Bearer ${token}`;
        }

        return config;
    },
    (error) => Promise.reject(error),
);

// Handle expired or invalid JWTs.
api.interceptors.response.use(
    (response) => response,
    (error) => {
        if (error.response?.status === 401) {
            const requestUrl = error.config?.url || "";

            // Public APIs should not redirect customers to the owner login.
            const isPublicRequest = requestUrl.startsWith("/public/");

            if (!isPublicRequest) {
                localStorage.removeItem("access_token");

                if (!window.location.pathname.includes("/login")) {
                    window.location.href = "/login";
                }
            }
        }

        return Promise.reject(error);
    },
);

export default api;