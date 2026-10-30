export function getErrorMessage(error) {
    const detail = error?.response?.data?.detail;

    if (typeof detail === "string") {
        return detail;
    }

    if (Array.isArray(detail)) {
        return detail
            .map((item) => {
                if (typeof item === "string") return item;

                if (item && typeof item.msg === "string") {
                    const location = Array.isArray(item.loc)
                        ? item.loc.filter((part) => part !== "body").join(" → ")
                        : "";

                    return location
                        ? `${location}: ${item.msg}`
                        : item.msg;
                }

                return "Invalid input";
            })
            .join(". ");
    }

    if (detail && typeof detail === "object") {
        return typeof detail.msg === "string"
            ? detail.msg
            : "Request validation failed.";
    }

    if (typeof error?.message === "string") {
        return error.message;
    }

    return "Something went wrong. Please try again.";
}