"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Sparkles, Clock, Mail, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
export default function WaitlistPage() {
    const router = useRouter();
    const [userEmail, setUserEmail] = useState("");

    useEffect(() => {
        async function loadUser() {
            // Check approval via our JWT-based endpoint
            const checkRes = await fetch("/api/auth/check-approval");
            if (!checkRes.ok) {
                router.push("/login");
                return;
            }
            const { approved, email } = await checkRes.json();
            if (email) setUserEmail(email);
            if (approved) {
                router.push("/dashboard");
            }
        }
        loadUser();
    }, [router]);

    const handleSignOut = async () => {
        try {
            await fetch("/api/auth/logout", { method: "POST" });
        } catch { }

        // 2. Clear auth cookies
        window.location.href = '/login?signedout=true';
    };

    return (
        <div className="min-h-screen bg-background flex items-center justify-center p-6">
            {/* Animated background glows */}
            <div className="fixed inset-0 z-0 overflow-hidden pointer-events-none">
                <div className="absolute top-[-10%] left-[-5%] w-[45%] h-[45%] bg-primary/8 blur-[140px] rounded-full animate-pulse" />
                <div className="absolute bottom-[-10%] right-[-5%] w-[50%] h-[50%] bg-emerald-500/8 blur-[160px] rounded-full animate-pulse delay-1000" />
            </div>

            <div className="relative z-10 max-w-md w-full text-center space-y-10 animate-in fade-in slide-in-from-bottom-8 duration-1000">
                {/* Logo */}
                <div className="flex items-center justify-center gap-3">
                    <div className="rounded-xl bg-gradient-to-br from-primary to-primary/85 p-3 shadow-lg shadow-primary/20">
                        <Sparkles className="h-7 w-7 text-white" />
                    </div>
                    <div className="text-left">
                        <h1 className="text-2xl font-bold text-foreground tracking-tight">PriceOS</h1>
                        <p className="text-[10px] text-primary/80 font-bold uppercase tracking-[0.2em]">Revenue Intelligence</p>
                    </div>
                </div>

                {/* Status card */}
                <div className="bg-card border border-border rounded-2xl p-8 space-y-6 shadow-sm">
                    {/* Animated clock icon */}
                    <div className="flex justify-center">
                        <div className="relative">
                            <div className="h-20 w-20 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center">
                                <Clock className="h-10 w-10 text-primary" />
                            </div>
                            <span className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-primary animate-ping opacity-75" />
                            <span className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-primary" />
                        </div>
                    </div>

                    <div className="space-y-3">
                        <h2 className="text-2xl font-bold text-foreground tracking-tight">You&apos;re on the waitlist</h2>
                        <p className="text-muted-foreground text-sm leading-relaxed">
                            Your account has been registered and is pending approval. We'll grant you access shortly.
                        </p>
                    </div>

                    {userEmail && (
                        <div className="flex items-center gap-2 justify-center text-xs text-muted-foreground font-medium">
                            <Mail className="h-3.5 w-3.5" />
                            <span>{userEmail}</span>
                        </div>
                    )}

                    <div className="pt-2 border-t border-border">
                        <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold mb-4">Access Status</p>
                        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 border border-primary/20">
                            <span className="h-2 w-2 rounded-full bg-primary animate-pulse" />
                            <span className="text-xs font-black text-primary uppercase tracking-wider">Pending Approval</span>
                        </div>
                    </div>
                </div>

                {/* Sign out */}
                <Button
                    variant="ghost"
                    onClick={handleSignOut}
                    className="text-muted-foreground hover:text-foreground hover:bg-muted text-xs gap-2"
                >
                    <LogOut className="h-3.5 w-3.5" />
                    Sign out and use a different account
                </Button>
            </div>
        </div>
    );
}
