import api from "./client";


// ---------------------------------------------------------
// Extract menu
// ---------------------------------------------------------

export async function extractMenu(branchId, file) {
    const formData = new FormData();

    formData.append("file", file);

    const response = await api.post(
        `/menu-import/branches/${branchId}/extract`,
        formData,
        {
            headers: {
                "Content-Type": "multipart/form-data",
            },
        }
    );

    return response.data;
}


// ---------------------------------------------------------
// Generate missing dish images
// ---------------------------------------------------------

export async function generateMenuImages(
    branchId,
    menu
) {
    const response = await api.post(
        `/menu-import/branches/${branchId}/generate-images`,
        menu
    );

    return response.data;
}


// ---------------------------------------------------------
// Confirm menu import
// ---------------------------------------------------------

export async function confirmMenuImport(
    branchId,
    menu
) {
    const response = await api.post(
        `/menu-import/branches/${branchId}/confirm`,
        menu
    );

    return response.data;
}