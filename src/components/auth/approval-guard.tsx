"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Silently checks the user's approval status on mount.
 * If not approved, redirects to /waitlist.
 * Renders nothing - purely a background guard.
 */
export function ApprovalGuard() {
    const router = useRouter();

    useEffect(() => {
        async function checkApproval() {
            try {
                const res = await fetch("/api/auth/check-approval");
                if (res.status === 401) {
                    // Not authenticated at all
                    router.push("/login");
                    return;
                }
                if (!res.ok) {
                    // Any server error (500, etc.) → fail closed, send to waitlist
                    console.error("[ApprovalGuard] Server error, redirecting to waitlist");
                    router.push("/waitlist");
                    return;
                }
                const { approved } = await res.json();
                if (!approved) {
                    router.push("/waitlist");
                }
            } catch (err) {
                // Network error → fail closed, send to waitlist
                console.error("[ApprovalGuard] Failed to check approval", err);
                router.push("/waitlist");
            }
        }
        checkApproval();
    }, [router]);

    return null;
}
