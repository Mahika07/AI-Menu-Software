import api from "./client";

export async function getPublicMenu(qrToken) {
    const response = await api.get(
        `/public/menu/${encodeURIComponent(qrToken)}`,
    );

    return response.data;
}