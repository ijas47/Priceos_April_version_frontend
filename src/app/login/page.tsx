"use client";

import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Sparkles, Calendar, ShieldCheck, Building2 } from "lucide-react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { Suspense, useState } from "react";

function SignInForm() {
    const router = useRouter();
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setError(null);
        setLoading(true);
        try {
            const res = await fetch("/api/auth/login", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email, password }),
            });
            const data = await res.json();
            if (!res.ok) {
                const errMsg =
                    typeof data.error === "string"
                        ? data.error
                        : data.error?.message || "Invalid email or password";
                setError(errMsg);
                setLoading(false);
                return;
            }
            if (data.pending) {
                router.push("/pending-approval");
                return;
            }
            if (data.needsPasswordChange) {
                router.push("/auth/change-password");
                return;
            }
            if (data.needsOnboarding) {
                router.push("/onboarding");
                return;
            }
            if (data.user?.orgId) {
                localStorage.setItem("priceos-orgId", data.user.orgId);
            }
            if (data.accessToken) {
                localStorage.setItem("priceos-token", data.accessToken);
            }

            router.push("/dashboard");
            router.refresh();
        } catch {
            setError("Network error. Please try again.");
            setLoading(false);
        }
    }

    return (
        <form onSubmit={handleSubmit} className="space-y-4">
            <div>
                <label className="form-label">Email</label>
                <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    autoComplete="email"
                    placeholder="you@company.com"
                    className="form-input"
                />
            </div>
            <div>
                <label className="form-label">Password</label>
                <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    autoComplete="current-password"
                    placeholder="••••••••"
                    className="form-input"
                />
                <div className="mt-1 text-right">
                    <Link href="/forgot-password" className="text-xs text-muted-foreground hover:text-primary transition-colors">
                        Forgot password?
                    </Link>
                </div>
            </div>
            {error && (
                <p className="text-sm text-destructive">
                    {typeof error === "object" ? (error as { message?: string }).message || JSON.stringify(error) : String(error)}
                </p>
            )}
            <button type="submit" disabled={loading} className="form-submit-btn">
                {loading ? "Signing in…" : "Sign In"}
            </button>
        </form>
    );
}

const MARKETS = [
    { code: "UAE_DXB", label: "🇦🇪  Dubai, UAE" },
    { code: "GBR_LON", label: "🇬🇧  London, UK" },
    { code: "USA_NYC", label: "🇺🇸  New York, USA" },
    { code: "FRA_PAR", label: "🇫🇷  Paris, France" },
    { code: "NLD_AMS", label: "🇳🇱  Amsterdam, Netherlands" },
    { code: "ESP_BCN", label: "🇪🇸  Barcelona, Spain" },
    { code: "USA_MIA", label: "🇺🇸  Miami, USA" },
    { code: "PRT_LIS", label: "🇵🇹  Lisbon, Portugal" },
    { code: "USA_NSH", label: "🇺🇸  Nashville, USA" },
    { code: "AUS_SYD", label: "🇦🇺  Sydney, Australia" },
];

function SignUpForm() {
    const router = useRouter();
    const [name, setName] = useState("");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [pilotCode, setPilotCode] = useState("");
    const [marketCode, setMarketCode] = useState("UAE_DXB");
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setError(null);
        setLoading(true);
        try {
            const res = await fetch("/api/auth/register", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name, email, password, marketCode, pilotCode }),
            });
            const data = await res.json();
            if (!res.ok) {
                const errMsg =
                    typeof data.error === "string"
                        ? data.error
                        : data.error?.message || "Registration failed";
                setError(errMsg);
                setLoading(false);
                return;
            }
            if (data.user?.orgId) {
                localStorage.setItem("priceos-orgId", data.user.orgId);
            }
            if (data.accessToken) {
                localStorage.setItem("priceos-token", data.accessToken);
            }

            router.push("/onboarding");
            router.refresh();
        } catch {
            setError("Network error. Please try again.");
            setLoading(false);
        }
    }

    return (
        <form onSubmit={handleSubmit} className="space-y-4">
            <div>
                <label className="form-label">Pilot access code</label>
                <input
                    type="text"
                    value={pilotCode}
                    onChange={(e) => setPilotCode(e.target.value)}
                    required
                    autoComplete="off"
                    placeholder="e.g. MARINA-PILOT-2026"
                    className="form-input font-mono uppercase"
                />
                <p className="mt-1 text-[11px] text-muted-foreground">
                    Required for signup. Your PriceOS contact will provide this code.
                </p>
            </div>
            <div>
                <label className="form-label">Full Name</label>
                <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                    autoComplete="name"
                    placeholder="Your name"
                    className="form-input"
                />
            </div>
            <div>
                <label className="form-label">Primary Market</label>
                <select
                    value={marketCode}
                    onChange={(e) => setMarketCode(e.target.value)}
                    className="form-input"
                    style={{ appearance: "none", cursor: "pointer" }}
                >
                    {MARKETS.map((m) => (
                        <option key={m.code} value={m.code}>
                            {m.label}
                        </option>
                    ))}
                </select>
                <p className="mt-1 text-[11px] text-muted-foreground">
                    Sets your default currency, weekend definition, and guardrail defaults.
                </p>
            </div>
            <div>
                <label className="form-label">Email</label>
                <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    autoComplete="email"
                    placeholder="you@company.com"
                    className="form-input"
                />
            </div>
            <div>
                <label className="form-label">Password</label>
                <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    autoComplete="new-password"
                    placeholder="••••••••"
                    minLength={8}
                    className="form-input"
                />
            </div>
            {error && (
                <p className="text-sm text-destructive">
                    {typeof error === "object" ? (error as { message?: string }).message || JSON.stringify(error) : String(error)}
                </p>
            )}
            <button type="submit" disabled={loading} className="form-submit-btn">
                {loading ? "Creating account…" : "Create Account"}
            </button>
        </form>
    );
}

function LoginContent() {
    const searchParams = useSearchParams();
    const defaultTab = searchParams.get("tab") === "signup" ? "signup" : "signin";
    const [activeTab, setActiveTab] = useState<"signin" | "signup">(defaultTab);

    return (
        <div className="min-h-screen grid lg:grid-cols-2 overflow-hidden bg-background">
            {/* Left: brand panel */}
            <div className="relative hidden lg:flex flex-col justify-between p-12 overflow-hidden border-r border-border bg-surface-1">
                <div className="absolute inset-0 z-0 pointer-events-none">
                    <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-primary/8 blur-[120px] rounded-full" />
                    <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-sky-400/8 blur-[150px] rounded-full" />
                </div>

                <div className="relative z-10">
                    <Link href="/" className="flex items-center gap-3 group">
                        <div className="rounded-xl bg-primary p-2.5 shadow-md shadow-primary/20 group-hover:scale-105 transition-transform">
                            <Sparkles className="h-6 w-6 text-primary-foreground" />
                        </div>
                        <div>
                            <h1 className="text-xl font-bold text-foreground tracking-tight">PriceOS</h1>
                            <p className="text-[10px] text-primary font-semibold uppercase tracking-[0.2em]">Revenue intelligence</p>
                        </div>
                    </Link>
                </div>

                <div className="relative z-10 max-w-lg space-y-8">
                    <h2 className="text-5xl font-bold text-foreground leading-tight tracking-tight">
                        Pricing that keeps up with your market
                    </h2>
                    <p className="text-lg text-muted-foreground font-normal leading-relaxed">
                        AI-assisted revenue management for short-term rental operators worldwide.
                        Event tracking, pricing proposals with guardrails, and PMS execution in one place.
                    </p>

                    <div className="grid grid-cols-2 gap-6 pt-4">
                        <div className="space-y-2">
                            <div className="flex items-center gap-2 text-primary">
                                <Calendar className="h-5 w-5" />
                                <span className="text-sm font-semibold text-foreground">Daily pricing</span>
                            </div>
                            <p className="text-xs text-muted-foreground">Calendar-aware proposals for every listing</p>
                        </div>
                        <div className="space-y-2">
                            <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400">
                                <ShieldCheck className="h-5 w-5" />
                                <span className="text-sm font-semibold text-foreground">Guardrailed execution</span>
                            </div>
                            <p className="text-xs text-muted-foreground">You approve changes before they sync to your PMS</p>
                        </div>
                    </div>
                </div>

                <div className="relative z-10 flex items-center gap-6 text-xs text-muted-foreground font-medium">
                    <div className="flex items-center gap-1.5">
                        <Building2 className="h-3.5 w-3.5" /> 10+ global markets
                    </div>
                    <div className="w-1 h-1 rounded-full bg-border" />
                    <div>Hostaway-ready</div>
                    <div className="w-1 h-1 rounded-full bg-border" />
                    <div>Human-in-the-loop AI</div>
                </div>
            </div>

            {/* Right: form */}
            <div className="relative flex flex-col items-center justify-center p-6 lg:p-12 bg-background">
                <div className="lg:hidden absolute top-8 left-8">
                    <Link href="/" className="flex items-center gap-2">
                        <Sparkles className="h-5 w-5 text-primary" />
                        <span className="text-sm font-bold text-foreground uppercase tracking-tight">PriceOS</span>
                    </Link>
                </div>

                <div className="w-full max-w-[440px] space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
                    <div className="space-y-2 text-center lg:text-left">
                        <h3 className="text-3xl font-bold tracking-tight text-foreground">Sign in to PriceOS</h3>
                        <p className="text-sm text-muted-foreground">Manage pricing, calendar, and portfolio performance.</p>
                    </div>

                    <Card className="bg-card border border-border shadow-sm p-0">
                        <Tabs
                            value={activeTab}
                            onValueChange={(value) => setActiveTab(value as "signin" | "signup")}
                            className="w-full"
                        >
                            <TabsList className="grid w-full grid-cols-2 bg-muted/50 border-b border-border rounded-none h-14">
                                <TabsTrigger
                                    value="signin"
                                    className="rounded-none data-[state=active]:bg-background data-[state=active]:text-primary border-b-2 border-transparent data-[state=active]:border-primary text-muted-foreground"
                                >
                                    Sign In
                                </TabsTrigger>
                                <TabsTrigger
                                    value="signup"
                                    className="rounded-none data-[state=active]:bg-background data-[state=active]:text-primary border-b-2 border-transparent data-[state=active]:border-primary text-muted-foreground"
                                >
                                    Sign Up
                                </TabsTrigger>
                            </TabsList>

                            <div className="p-6">
                                <TabsContent value="signin" className="mt-0">
                                    <SignInForm />
                                </TabsContent>
                                <TabsContent value="signup" className="mt-0">
                                    <SignUpForm />
                                </TabsContent>
                            </div>
                        </Tabs>
                    </Card>

                    <p className="text-center text-[11px] text-muted-foreground px-8 leading-relaxed">
                        By accessing PriceOS you agree to our{" "}
                        <Link href="#" className="text-primary hover:underline font-medium">Terms of Service</Link>
                        {" "}and{" "}
                        <Link href="#" className="text-primary hover:underline font-medium">Privacy Policy</Link>.
                    </p>
                </div>
            </div>

            <style jsx global>{`
        form label.form-label {
          display: block;
          color: var(--text-primary) !important;
          font-weight: 600 !important;
          font-size: 0.8rem !important;
          margin-bottom: 0.25rem;
        }

        input.form-input {
          width: 100%;
          background-color: var(--surface-0) !important;
          border: 1px solid var(--border-default) !important;
          color: var(--text-primary) !important;
          border-radius: 8px !important;
          height: 48px !important;
          padding: 0 12px;
          font-size: 0.875rem;
          transition: all 0.2s ease !important;
          outline: none;
        }

        input.form-input:focus,
        select.form-input:focus {
          border-color: var(--brand) !important;
          box-shadow: 0 0 0 2px var(--brand-dim) !important;
        }

        input.form-input::placeholder {
          color: var(--text-tertiary) !important;
        }

        button.form-submit-btn {
          width: 100%;
          background: var(--brand) !important;
          font-weight: 600 !important;
          height: 48px !important;
          border-radius: 8px !important;
          box-shadow: 0 4px 14px -4px rgba(45, 127, 249, 0.45) !important;
          transition: all 0.2s ease !important;
          color: #ffffff !important;
          border: none;
          cursor: pointer;
          font-size: 0.875rem;
        }

        button.form-submit-btn:hover:not(:disabled) {
          filter: brightness(1.05) !important;
          transform: translateY(-1px) !important;
        }

        button.form-submit-btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .dark input.form-input {
          background-color: var(--surface-2) !important;
        }
      `}</style>
        </div>
    );
}

export default function LoginPage() {
    return (
        <Suspense fallback={<div className="min-h-screen bg-background" />}>
            <LoginContent />
        </Suspense>
    );
}