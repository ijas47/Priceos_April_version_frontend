"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Sparkles, Clock, CheckCircle2, Loader2, Mail, LogOut } from "lucide-react";

export default function PendingApprovalPage() {
    const router = useRouter();
    const [checking, setChecking] = useState(false);
    const [dots, setDots] = useState(".");
    const [email, setEmail] = useState<string | null>(null);

    // Animate the waiting dots
    useEffect(() => {
        const interval = setInterval(() => {
            setDots((d) => (d.length >= 3 ? "." : d + "."));
        }, 600);
        return () => clearInterval(interval);
    }, []);

    // Poll /api/auth/check-approval every 10 seconds
    useEffect(() => {
        let cancelled = false;

        async function poll() {
            if (cancelled) return;
            setChecking(true);
            try {
                const res = await fetch("/api/auth/check-approval");
                const data = await res.json();

                if (data.email && !email) setEmail(data.email);

                if (data.approved) {
                    // Cookie was already refreshed by the API - navigate to dashboard
                    router.push("/dashboard");
                    router.refresh();
                    return;
                }
            } catch {
                // network error - will retry
            } finally {
                if (!cancelled) setChecking(false);
            }
        }

        // First check immediately
        poll();

        // Then every 10 seconds
        const interval = setInterval(poll, 10_000);
        return () => {
            cancelled = true;
            clearInterval(interval);
        };
    }, [router, email]);

    async function handleLogout() {
        await fetch("/api/auth/logout", { method: "POST" });
        router.push("/login");
    }

    return (
        <div className="min-h-screen bg-background flex items-center justify-center p-6">
            <div className="pointer-events-none fixed inset-0 overflow-hidden">
                <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-primary/8 blur-[120px] rounded-full" />
                <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-emerald-500/8 blur-[150px] rounded-full" />
            </div>

            <div className="relative z-10 w-full max-w-md">
                <div className="flex items-center gap-3 mb-10 justify-center">
                    <div className="rounded-xl bg-primary p-2.5 shadow-md shadow-primary/20">
                        <Sparkles className="h-6 w-6 text-primary-foreground" />
                    </div>
                    <div>
                        <h1 className="text-xl font-bold text-foreground tracking-tight">PriceOS</h1>
                        <p className="text-[10px] text-primary font-semibold uppercase tracking-[0.2em]">Revenue intelligence</p>
                    </div>
                </div>

                <div className="rounded-2xl border border-border bg-card p-8 text-center space-y-6 shadow-sm">
                    {/* Icon */}
                    <div className="flex justify-center">
                        <div className="relative">
                            <div className="h-20 w-20 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center">
                                <Clock className="h-9 w-9 text-primary" />
                            </div>
                            {checking && (
                                <div className="absolute -bottom-1 -right-1 h-6 w-6 rounded-full bg-background flex items-center justify-center">
                                    <Loader2 className="h-4 w-4 text-primary animate-spin" />
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Heading */}
                    <div className="space-y-2">
                        <h2 className="text-2xl font-bold text-foreground">Account Under Review</h2>
                        <p className="text-sm text-muted-foreground leading-relaxed">
                            Your account has been created and is waiting for admin approval.
                            You&apos;ll get access as soon as an admin reviews your request.
                        </p>
                    </div>

                    {/* Status pill */}
                    <div className="flex items-center justify-center gap-2 py-2.5 px-4 rounded-full bg-primary/10 border border-primary/20 w-fit mx-auto">
                        <span className="h-2 w-2 rounded-full bg-primary animate-pulse" />
                        <span className="text-xs font-bold text-primary uppercase tracking-wider">
                            Waiting for approval{dots}
                        </span>
                    </div>

                    {/* Email */}
                    {email && (
                        <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
                            <Mail className="h-3.5 w-3.5" />
                            <span>{email}</span>
                        </div>
                    )}

                    {/* What happens next */}
                    <div className="rounded-xl p-4 text-left space-y-3 bg-muted/50 border border-border">
                        <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">What happens next</p>
                        <div className="space-y-2.5">
                            {[
                                { done: true,  text: "Account created successfully" },
                                { done: false, text: "Admin reviews your registration" },
                                { done: false, text: "You receive access to the dashboard" },
                            ].map((step, i) => (
                                <div key={i} className="flex items-center gap-3">
                                    {step.done ? (
                                        <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
                                    ) : (
                                        <div className="h-4 w-4 rounded-full border border-border shrink-0" />
                                    )}
                                    <span className={`text-xs ${step.done ? "text-foreground" : "text-muted-foreground"}`}>
                                        {step.text}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>

                    <p className="text-[11px] text-muted-foreground">
                        This page checks automatically every 10 seconds.
                    </p>

                    <button
                        onClick={handleLogout}
                        className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors mx-auto"
                    >
                        <LogOut className="h-3.5 w-3.5" />
                        Sign out
                    </button>
                </div>
            </div>
        </div>
    );
}
