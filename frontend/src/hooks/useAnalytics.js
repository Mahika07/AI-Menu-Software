import { useCallback, useEffect, useState } from "react";
import { trackEvent } from "../api/analytics";

function getSessionId() {
    let sessionId = sessionStorage.getItem("menu_session_id");

    if (!sessionId) {
        sessionId = crypto.randomUUID();
        sessionStorage.setItem("menu_session_id", sessionId);
    }

    return sessionId;
}

function getQRScanKey(qrToken) {
    return `menu_qr_scan_tracked_${qrToken}`;
}

function hasTrackedQRScan(qrToken) {
    if (!qrToken) {
        return false;
    }

    return sessionStorage.getItem(getQRScanKey(qrToken)) === "true";
}

function markQRScanTracked(qrToken) {
    if (!qrToken) {
        return;
    }

    sessionStorage.setItem(getQRScanKey(qrToken), "true");
}

export function useAnalytics(branchId, tableId = null, qrToken = null) {
    const [sessionId] = useState(() => getSessionId());

    const track = useCallback(
        async ({ eventType, dishId = null, metadata = null }) => {
            if (!branchId) {
                return;
            }

            await trackEvent({
                branchId,
                tableId,
                dishId,
                eventType,
                sessionId,
                eventMetadata: metadata ? JSON.stringify(metadata) : null,
            });
        },
        [branchId, tableId, sessionId],
    );

    // Track menu views.
    useEffect(() => {
        if (!branchId) {
            return;
        }

        track({
            eventType: "MENU_VIEW",
            metadata: {
                source: "public_menu",
            },
        });
    }, [branchId, track]);

    // Track a QR scan only once per browser session and QR token.
    useEffect(() => {
        if (!branchId || !qrToken) {
            return;
        }

        if (hasTrackedQRScan(qrToken)) {
            return;
        }

        // Mark it before sending to avoid duplicate requests from re-renders.
        markQRScanTracked(qrToken);

        track({
            eventType: "QR_SCAN",
            metadata: {
                source: "qr_menu",
                qr_token: qrToken,
            },
        });
    }, [branchId, qrToken, track]);

    return { track };
}