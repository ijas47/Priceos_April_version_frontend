"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { User, Mail, Shield, Save, Loader2 } from "lucide-react";
import { toast } from "sonner";
export default function ProfilePage() {
    const router = useRouter();
    const [user, setUser] = useState<any>(null);
    const [isSessionPending, setIsSessionPending] = useState(true);
    const [settings, setSettings] = useState<any>(null);
    const [isSettingsLoading, setIsSettingsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);

    const [fullName, setFullName] = useState("");
    const [email, setEmail] = useState("");

    useEffect(() => {
        async function loadProfile() {
            try {
                const res = await fetch("/api/user/settings");
                if (res.ok) {
                    const data = await res.json();
                    setSettings(data);
                    setFullName(data.fullName || "");
                    setEmail(data.email || "");
                    setUser({ id: data.userId, name: data.fullName, email: data.email });
                }
            } catch (e) {
                console.error("Failed to load profile", e);
            } finally {
                setIsSessionPending(false);
                setIsSettingsLoading(false);
            }
        }
        loadProfile();
    }, []);

    const handleSave = async () => {
        setIsSaving(true);
        try {
            const res = await fetch("/api/user/settings", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    fullName,
                    email,
                }),
            });
            if (res.ok) {
                toast.success("Profile updated in settings");
                const data = await res.json();
                setSettings(data);
            } else {
                toast.error("Failed to update profile");
            }
        } catch (err) {
            toast.error("An error occurred while saving");
        } finally {
            setIsSaving(false);
        }
    };

    if (isSessionPending || (isSettingsLoading && user)) {
        return (
            <div className="flex flex-col h-[80vh] items-center justify-center gap-4">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <p className="text-muted-foreground animate-pulse font-medium">Loading profile context...</p>
            </div>
        );
    }


    if (!user) {
        return (
            <div className="flex h-[80vh] items-center justify-center p-6 text-center">
                <Card className="max-w-md p-6 bg-background/60 backdrop-blur-xl border-dashed">
                    <User className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-20" />
                    <h2 className="text-lg font-bold mb-2">No active session found</h2>
                    <p className="text-sm text-muted-foreground mb-4">Please sign in to view your profile.</p>
                    <div className="flex gap-4 justify-center">
                        <Button variant="outline" onClick={() => window.location.reload()}>Refresh Page</Button>
                        <Button onClick={() => router.push('/login')}>Sign In</Button>
                    </div>
                </Card>
            </div>
        );
    }

    return (
        <div className="container max-w-4xl py-10 px-6 animate-in fade-in slide-in-from-bottom-4 duration-700">
            <div className="mb-10 flex justify-between items-end">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight bg-gradient-to-r from-foreground to-foreground/50 bg-clip-text text-transparent">Profile Settings</h1>
                    <p className="text-muted-foreground mt-2">
                        Manage your account information and login details using our secure settings engine.
                    </p>
                </div>
                <Button
                    onClick={handleSave}
                    className="shadow-lg shadow-primary/20 font-bold h-11 px-8"
                    disabled={isSaving}
                >
                    {isSaving ? (
                        <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Updating...
                        </>
                    ) : (
                        <>
                            <Save className="mr-2 h-4 w-4" />
                            Save Profile
                        </>
                    )}
                </Button>
            </div>

            <div className="grid gap-8">
                {/* Profile Card */}
                <Card className="bg-background/60 dark:bg-[#111113]/60 backdrop-blur-xl border-border/50 shadow-2xl overflow-hidden">
                    <div className="h-32 bg-gradient-to-r from-primary/20 via-primary/10 to-emerald-500/20 border-b border-border/10" />
                    <CardHeader className="relative flex flex-row items-end gap-6 pb-8 -mt-16">
                        <Avatar className="h-32 w-32 border-4 border-background shadow-2xl ring-4 ring-primary/5">
                            <AvatarFallback className="text-4xl bg-primary text-primary-foreground font-black uppercase">
                                {fullName?.[0] || user.email?.[0] || 'U'}
                            </AvatarFallback>
                        </Avatar>
                        <div className="space-y-1 pb-2">
                            <CardTitle className="text-3xl font-black tracking-tighter">{fullName || user.name || 'User Account'}</CardTitle>
                            <CardDescription className="text-base flex items-center gap-2 font-medium">
                                <Shield className="h-4 w-4 text-primary fill-primary/20" />
                                Property Manager
                            </CardDescription>
                        </div>
                    </CardHeader>
                    <CardContent className="pt-6 space-y-8">
                        <div className="grid gap-8 md:grid-cols-2">
                            <div className="space-y-3">
                                <label className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground flex items-center gap-2">
                                    <Mail className="h-3 w-3" /> Email Address <span className="text-red-500">*</span>
                                </label>
                                <div className="group relative">
                                    <Input
                                        value={email}
                                        onChange={(e) => setEmail(e.target.value)}
                                        className="bg-background/50 border-border/50 pl-10 focus:ring-primary/20 transition-all font-medium"
                                        placeholder="your@email.com"
                                        required
                                    />
                                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/50" />
                                </div>
                            </div>
                            <div className="space-y-3">
                                <label className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground flex items-center gap-2">
                                    <User className="h-3 w-3" /> Full Name <span className="text-red-500">*</span>
                                </label>
                                <div className="group relative">
                                    <Input
                                        value={fullName}
                                        onChange={(e) => setFullName(e.target.value)}
                                        placeholder="Enter full name..."
                                        className="bg-background/50 border-border/50 pl-10 focus:ring-primary/20 transition-all font-medium"
                                        required
                                    />
                                    <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/50" />
                                </div>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {/* Member Status Card */}
                <Card className="bg-background/60 dark:bg-[#111113]/60 backdrop-blur-xl border-border/50 shadow-lg group">
                    <CardContent className="pt-6">
                        <div className="flex items-center justify-between p-4 rounded-2xl bg-emerald-500/5 border border-emerald-500/10 group-hover:border-emerald-500/30 transition-all duration-500">
                            <div className="flex items-center gap-4">
                                <div className="h-12 w-12 rounded-2xl bg-emerald-500 flex items-center justify-center text-white shadow-xl shadow-emerald-500/20 rotate-3 group-hover:rotate-0 transition-transform">
                                    <Shield className="h-6 w-6" />
                                </div>
                                <div>
                                    <p className="text-sm font-black tracking-tight text-foreground">Enterprise Access</p>
                                    <p className="text-[10px] text-emerald-500 uppercase font-black tracking-[0.15em]">System Verified</p>
                                </div>
                            </div>
                            <div className="text-right">
                                <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider mb-1">Status</p>
                                <span className="inline-flex items-center rounded-full px-3 py-1 text-[10px] font-black bg-emerald-500/20 text-emerald-500 border border-emerald-500/20 shadow-sm">
                                    ACTIVE
                                </span>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
