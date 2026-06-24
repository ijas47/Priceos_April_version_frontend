"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  UserPlus, Mail, CheckCircle2, XCircle, Clock, Trash2,
  RefreshCw, Copy, Eye, EyeOff, ChevronDown, ChevronUp,
  Shield, Zap, Globe2, AlertTriangle, X, Ticket, Plus,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

// ── Types ──────────────────────────────────────────────────────────────────────

interface User {
  id: string;
  name: string;
  email: string;
  role: "owner" | "admin" | "viewer";
  isApproved: boolean;
  marketCode: string;
  currency: string;
  plan: string;
  onboardingStep: string;
  createdAt: string;
}

interface PilotCode {
  id: string;
  code: string;
  label: string;
  plan: string;
  maxUses: number;
  usedCount: number;
  isActive: boolean;
  expiresAt: string | null;
  createdAt: string | null;
}

interface PilotCodesConfig {
  openRegistration: boolean;
  envBypassConfigured: boolean;
}

// ── Constants ───────────────────────────────────────────────────────────────────

const MARKETS = [
  { code: "UAE_DXB", label: "🇦🇪 Dubai, UAE" },
  { code: "GBR_LON", label: "🇬🇧 London, UK" },
  { code: "USA_NYC", label: "🇺🇸 New York, USA" },
  { code: "FRA_PAR", label: "🇫🇷 Paris, France" },
  { code: "NLD_AMS", label: "🇳🇱 Amsterdam, Netherlands" },
  { code: "ESP_BCN", label: "🇪🇸 Barcelona, Spain" },
  { code: "USA_MIA", label: "🇺🇸 Miami, USA" },
  { code: "PRT_LIS", label: "🇵🇹 Lisbon, Portugal" },
  { code: "USA_NSH", label: "🇺🇸 Nashville, USA" },
  { code: "AUS_SYD", label: "🇦🇺 Sydney, Australia" },
];

const ONBOARDING_STEPS: Record<string, { label: string; color: string }> = {
  connect:  { label: "Step 1 - Connect",  color: "bg-blue-500/10 text-blue-400 border-blue-500/20" },
  select:   { label: "Step 2 - Select",   color: "bg-purple-500/10 text-purple-400 border-purple-500/20" },
  market:   { label: "Step 3 - Market",   color: "bg-primary/10 text-primary border-primary/20" },
  strategy: { label: "Step 4 - Strategy", color: "bg-destructive/10 text-destructive border-destructive/20" },
  complete: { label: "✅ Complete",        color: "bg-green-500/10 text-green-400 border-green-500/20" },
};

// ── Helper Components ──────────────────────────────────────────────────────────

function OnboardingBadge({ step }: { step: string }) {
  const s = ONBOARDING_STEPS[step] ?? ONBOARDING_STEPS.complete;
  return (
    <span className={cn("text-[10px] font-bold px-2 py-0.5 rounded-full border uppercase tracking-wide", s.color)}>
      {s.label}
    </span>
  );
}

function RoleBadge({ role }: { role: string }) {
  const styles: Record<string, string> = {
    owner: "bg-primary/10 text-primary border-primary/20",
    admin: "bg-blue-500/10 text-blue-400 border-blue-500/20",
    viewer: "bg-zinc-500/10 text-zinc-400 border-zinc-500/20",
  };
  return (
    <span className={cn("text-[10px] font-bold px-2 py-0.5 rounded-full border uppercase tracking-wide", styles[role] ?? styles.viewer)}>
      {role}
    </span>
  );
}

// ── Invite Modal ────────────────────────────────────────────────────────────────

function InviteModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const [form, setForm] = useState({
    fullName: "",
    email: "",
    role: "viewer" as "viewer" | "admin" | "owner",
    marketCode: "UAE_DXB",
    skipOnboarding: false,
    temporaryPassword: "",
  });
  const [loading, setLoading] = useState(false);
  const [created, setCreated] = useState<{ email: string; temporaryPassword: string } | null>(null);
  const [showPwd, setShowPwd] = useState(false);

  const handleCreate = async () => {
    if (!form.fullName.trim() || !form.email.trim()) {
      toast.error("Name and email are required");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create user");
      setCreated({ email: data.user.email, temporaryPassword: data.user.temporaryPassword });
      onSuccess();
      toast.success(`User "${form.fullName}" created successfully`);
    } catch (e: unknown) {
      toast.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="relative bg-card text-card-foreground border border-border rounded-2xl w-full max-w-md p-7 shadow-2xl">
        <button onClick={onClose} className="absolute top-5 right-5 text-muted-foreground hover:text-foreground">
          <X className="h-4 w-4" />
        </button>

        {!created ? (
          <>
            <div className="flex items-center gap-3 mb-6">
              <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
                <UserPlus className="h-5 w-5 text-primary dark:text-primary" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-foreground">Add New User</h2>
                <p className="text-xs text-muted-foreground">Admin-created users are pre-approved instantly.</p>
              </div>
            </div>

            <div className="space-y-4">
              {/* Name */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Full Name</label>
                <Input
                  placeholder="e.g. Sarah Al-Maktoum"
                  value={form.fullName}
                  onChange={e => setForm({ ...form, fullName: e.target.value })}
                  className="bg-background border-border text-foreground h-10"
                />
              </div>

              {/* Email */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Email Address</label>
                <Input
                  type="email"
                  placeholder="sarah@company.com"
                  value={form.email}
                  onChange={e => setForm({ ...form, email: e.target.value })}
                  className="bg-background border-border text-foreground h-10"
                />
              </div>

              {/* Role + Market side by side */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Role</label>
                  <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v as typeof form.role })}>
                    <SelectTrigger className="bg-background border-border h-10 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="viewer">Viewer</SelectItem>
                      <SelectItem value="admin">Admin</SelectItem>
                      <SelectItem value="owner">Owner</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Market</label>
                  <Select value={form.marketCode} onValueChange={(v) => setForm({ ...form, marketCode: v })}>
                    <SelectTrigger className="bg-background border-border h-10 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {MARKETS.map(m => (
                        <SelectItem key={m.code} value={m.code}>{m.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Temporary Password */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Temporary Password <span className="text-muted-foreground/80 normal-case font-normal">(auto-generated if blank)</span>
                </label>
                <div className="relative">
                  <Input
                    type={showPwd ? "text" : "password"}
                    placeholder="Leave blank to auto-generate"
                    value={form.temporaryPassword}
                    onChange={e => setForm({ ...form, temporaryPassword: e.target.value })}
                    className="bg-background border-border text-foreground h-10 pr-10 font-mono"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPwd(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              {/* Skip Onboarding Toggle */}
              <div className="flex items-center justify-between p-4 rounded-xl border border-border bg-muted/50">
                <div>
                  <p className="text-sm font-semibold text-foreground">Skip Onboarding Wizard</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    User goes directly to the dashboard. Useful for demo accounts or migrated clients.
                  </p>
                </div>
                <Switch
                  checked={form.skipOnboarding}
                  onCheckedChange={(v) => setForm({ ...form, skipOnboarding: v })}
                />
              </div>

              <button
                onClick={handleCreate}
                disabled={loading}
                className="w-full h-11 bg-primary hover:bg-primary disabled:opacity-40 text-black font-bold rounded-xl flex items-center justify-center gap-2 text-sm transition-all"
              >
                {loading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
                {loading ? "Creating…" : "Create User"}
              </button>
            </div>
          </>
        ) : (
          /* Success State - show credentials */
          <div className="text-center space-y-6">
            <div className="h-16 w-16 rounded-full bg-green-500/10 border border-green-500/30 flex items-center justify-center mx-auto">
              <CheckCircle2 className="h-8 w-8 text-green-600 dark:text-green-400" />
            </div>
            <div>
              <h3 className="text-xl font-bold text-foreground mb-1">User Created!</h3>
              <p className="text-sm text-muted-foreground">Share these credentials with the user. The password cannot be retrieved again.</p>
            </div>

            <div className="space-y-3 text-left">
              <div className="p-3 rounded-xl bg-muted border border-border">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Email</p>
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-mono text-foreground break-all">{created.email}</p>
                  <button type="button" onClick={() => { navigator.clipboard.writeText(created.email); toast.success("Copied!"); }}>
                    <Copy className="h-3.5 w-3.5 shrink-0 text-muted-foreground hover:text-foreground" />
                  </button>
                </div>
              </div>
              <div className="p-3 rounded-xl bg-primary/10 dark:bg-primary/5 border border-primary/25">
                <p className="text-[10px] text-primary/800 dark:text-primary uppercase tracking-wider mb-1">Temporary Password (copy now)</p>
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-mono text-primary dark:text-primary/80 break-all">{created.temporaryPassword}</p>
                  <button type="button" onClick={() => { navigator.clipboard.writeText(created.temporaryPassword); toast.success("Password copied!"); }}>
                    <Copy className="h-3.5 w-3.5 shrink-0 text-primary hover:text-primary dark:text-primary dark:hover:text-primary" />
                  </button>
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="w-full h-10 bg-secondary text-secondary-foreground hover:bg-secondary/80 font-semibold rounded-xl text-sm transition-all"
            >
              Done
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Pilot Codes Panel ──────────────────────────────────────────────────────────

function PilotCodesPanel() {
  const [codes, setCodes] = useState<PilotCode[]>([]);
  const [config, setConfig] = useState<PilotCodesConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [createdCode, setCreatedCode] = useState<string | null>(null);
  const [form, setForm] = useState({
    label: "",
    plan: "starter" as "starter" | "growth" | "scale",
    maxUses: 1,
    code: "",
    expiresInDays: "",
  });

  const fetchCodes = () => {
    setLoading(true);
    fetch("/api/admin/pilot-codes")
      .then((res) => res.json())
      .then((data) => {
        setCodes(data.codes ?? []);
        setConfig(data.config ?? null);
      })
      .catch(() => toast.error("Could not load pilot codes"))
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchCodes(); }, []);

  const handleCreate = async () => {
    setCreating(true);
    try {
      const res = await fetch("/api/admin/pilot-codes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          label: form.label.trim() || undefined,
          plan: form.plan,
          maxUses: form.maxUses,
          code: form.code.trim() || undefined,
          expiresInDays: form.expiresInDays ? Number(form.expiresInDays) : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create code");
      setCreatedCode(data.code.code);
      setForm({ label: "", plan: "starter", maxUses: 1, code: "", expiresInDays: "" });
      setShowForm(false);
      fetchCodes();
      toast.success("Pilot code created");
    } catch (e: unknown) {
      toast.error((e as Error).message);
    } finally {
      setCreating(false);
    }
  };

  const toggleActive = async (id: string, isActive: boolean) => {
    try {
      const res = await fetch("/api/admin/pilot-codes", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, isActive }),
      });
      if (!res.ok) throw new Error("Failed");
      fetchCodes();
      toast.success(isActive ? "Code activated" : "Code deactivated");
    } catch {
      toast.error("Could not update code");
    }
  };

  return (
    <div className="rounded-xl border border-border bg-card p-5 space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <Ticket className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-foreground uppercase tracking-wider">Pilot Access Codes</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Gate self-serve signup until billing is live. Share codes with pilot clients.
            </p>
          </div>
        </div>
        <Button
          size="sm"
          onClick={() => { setShowForm((v) => !v); setCreatedCode(null); }}
          className="bg-primary hover:bg-primary text-black font-bold gap-1.5 h-9"
        >
          <Plus className="h-3.5 w-3.5" />
          New Code
        </Button>
      </div>

      {config && (
        <div className="flex flex-wrap gap-2 text-[11px]">
          {config.envBypassConfigured && (
            <span className="px-2 py-1 rounded-full border border-green-500/20 bg-green-500/10 text-green-400 font-semibold">
              PILOT_BYPASS_CODE configured
            </span>
          )}
          {config.openRegistration && (
            <span className="px-2 py-1 rounded-full border border-destructive/20 bg-destructive/10 text-destructive font-semibold">
              Open registration enabled
            </span>
          )}
        </div>
      )}

      {createdCode && (
        <div className="p-3 rounded-xl bg-primary/10 border border-primary/25 flex items-center justify-between gap-3">
          <div>
            <p className="text-[10px] text-primary uppercase tracking-wider font-bold mb-1">New code — copy now</p>
            <p className="text-sm font-mono text-primary">{createdCode}</p>
          </div>
          <button
            type="button"
            onClick={() => { navigator.clipboard.writeText(createdCode); toast.success("Copied!"); }}
            className="shrink-0"
          >
            <Copy className="h-4 w-4 text-primary" />
          </button>
        </div>
      )}

      {showForm && (
        <div className="rounded-xl border border-border bg-muted/40 p-4 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-[11px] text-muted-foreground uppercase tracking-wider font-semibold">Label</label>
              <Input
                placeholder="e.g. Acme Properties pilot"
                value={form.label}
                onChange={(e) => setForm({ ...form, label: e.target.value })}
                className="bg-background border-border h-9 text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[11px] text-muted-foreground uppercase tracking-wider font-semibold">Custom code (optional)</label>
              <Input
                placeholder="Auto-generated if blank"
                value={form.code}
                onChange={(e) => setForm({ ...form, code: e.target.value })}
                className="bg-background border-border h-9 text-sm font-mono"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[11px] text-muted-foreground uppercase tracking-wider font-semibold">Plan</label>
              <Select value={form.plan} onValueChange={(v) => setForm({ ...form, plan: v as typeof form.plan })}>
                <SelectTrigger className="bg-background border-border h-9 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="starter">Starter</SelectItem>
                  <SelectItem value="growth">Growth</SelectItem>
                  <SelectItem value="scale">Scale</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <label className="text-[11px] text-muted-foreground uppercase tracking-wider font-semibold">Max uses</label>
              <Input
                type="number"
                min={1}
                max={1000}
                value={form.maxUses}
                onChange={(e) => setForm({ ...form, maxUses: Number(e.target.value) || 1 })}
                className="bg-background border-border h-9 text-sm"
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <label className="text-[11px] text-muted-foreground uppercase tracking-wider font-semibold">
                Expires in days <span className="normal-case font-normal">(optional)</span>
              </label>
              <Input
                type="number"
                min={1}
                placeholder="Never expires if blank"
                value={form.expiresInDays}
                onChange={(e) => setForm({ ...form, expiresInDays: e.target.value })}
                className="bg-background border-border h-9 text-sm max-w-xs"
              />
            </div>
          </div>
          <button
            onClick={handleCreate}
            disabled={creating}
            className="h-9 px-4 bg-primary hover:bg-primary disabled:opacity-40 text-black font-bold rounded-lg text-xs flex items-center gap-1.5"
          >
            {creating ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
            {creating ? "Creating…" : "Create Code"}
          </button>
        </div>
      )}

      {loading ? (
        <div className="flex items-center gap-2 text-muted-foreground text-sm py-4">
          <RefreshCw className="h-3.5 w-3.5 animate-spin" />
          Loading codes…
        </div>
      ) : codes.length === 0 ? (
        <p className="text-sm text-muted-foreground py-2">
          No database codes yet. Create one above or set <code className="text-xs">PILOT_BYPASS_CODE</code> in Vercel.
        </p>
      ) : (
        <div className="space-y-2">
          {codes.map((c) => (
            <div
              key={c.id}
              className={cn(
                "flex items-center gap-4 px-4 py-3 rounded-xl border",
                c.isActive ? "border-border bg-muted/30" : "border-border/50 bg-muted/10 opacity-60"
              )}
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-mono font-bold text-foreground">{c.code}</span>
                  <Badge variant="outline" className="text-[10px]">{c.plan}</Badge>
                  {!c.isActive && (
                    <Badge variant="outline" className="text-[10px] text-muted-foreground">Inactive</Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground truncate mt-0.5">{c.label}</p>
                <p className="text-[11px] text-muted-foreground/80 mt-0.5">
                  {c.usedCount}/{c.maxUses} used
                  {c.expiresAt && ` · expires ${new Date(c.expiresAt).toLocaleDateString("en-US")}`}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => { navigator.clipboard.writeText(c.code); toast.success("Copied!"); }}
                  className="h-8 w-8 rounded-lg border border-border flex items-center justify-center text-muted-foreground hover:text-foreground"
                >
                  <Copy className="h-3.5 w-3.5" />
                </button>
                <Switch
                  checked={c.isActive}
                  onCheckedChange={(v) => toggleActive(c.id, v)}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── User Row ───────────────────────────────────────────────────────────────────

function UserRow({ user, onRefresh }: { user: User; onRefresh: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(false);

  const patch = async (updates: object) => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user.id, ...updates }),
      });
      if (!res.ok) throw new Error("Failed");
      toast.success("User updated");
      onRefresh();
    } catch {
      toast.error("Could not update user");
    } finally {
      setLoading(false);
    }
  };

  const approve = async () => {
    await fetch(`/api/admin/users/${user.id}/approve`, { method: "POST" });
    toast.success(`${user.name} approved`);
    onRefresh();
  };

  return (
    <div className={cn(
      "rounded-xl border transition-all",
      user.isApproved
        ? "border-border bg-card"
        : "border-primary/20 bg-primary/[0.02]"
    )}>
      {/* Main Row */}
      <div className="flex items-center gap-4 px-5 py-4">
        {/* Avatar */}
        <div className={cn(
          "h-10 w-10 rounded-xl flex items-center justify-center shrink-0 font-bold text-sm",
          user.isApproved ? "bg-muted text-muted-foreground" : "bg-primary/10 text-primary"
        )}>
          {user.name?.charAt(0)?.toUpperCase() ?? "?"}
        </div>

        {/* User Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-foreground truncate">{user.name}</span>
            <RoleBadge role={user.role} />
            <OnboardingBadge step={user.onboardingStep} />
            {!user.isApproved && (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full border uppercase tracking-wide bg-primary/10 text-primary border-primary/20">
                Pending
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5 mt-0.5">
            <Mail className="h-3 w-3 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">{user.email}</span>
            <span className="text-border text-xs">·</span>
            <Globe2 className="h-3 w-3 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">{user.marketCode}</span>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 shrink-0">
          {!user.isApproved && (
            <Button
              size="sm"
              onClick={approve}
              className="h-8 px-3 text-xs bg-green-500/10 text-green-400 border border-green-500/20 hover:bg-green-500/20"
            >
              <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Approve
            </Button>
          )}
          <button
            onClick={() => setExpanded(v => !v)}
            className="h-8 w-8 rounded-lg bg-muted border border-border flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
          >
            {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {/* Expanded Controls */}
      {expanded && (
        <div className="border-t border-border px-5 py-4 space-y-4 bg-muted/40 rounded-b-xl">
          <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Admin Controls</p>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {/* Role control */}
            <div className="space-y-1.5">
              <label className="text-[11px] text-muted-foreground uppercase tracking-wider font-semibold">Role</label>
              <Select
                value={user.role}
                onValueChange={(v) => patch({ role: v })}
                disabled={loading}
              >
                <SelectTrigger className="bg-background border-border h-9 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="viewer">Viewer</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                  <SelectItem value="owner">Owner</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Onboarding step control */}
            <div className="space-y-1.5">
              <label className="text-[11px] text-muted-foreground uppercase tracking-wider font-semibold">Set Onboarding Step</label>
              <Select
                value={user.onboardingStep}
                onValueChange={(v) => patch({ onboardingStep: v })}
                disabled={loading}
              >
                <SelectTrigger className="bg-background border-border h-9 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="connect">Step 1 - Connect</SelectItem>
                  <SelectItem value="select">Step 2 - Select Properties</SelectItem>
                  <SelectItem value="market">Step 3 - Choose Market</SelectItem>
                  <SelectItem value="strategy">Step 4 - Review Strategy</SelectItem>
                  <SelectItem value="complete">Complete (Skip Wizard)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Quick actions */}
            <div className="space-y-1.5">
              <label className="text-[11px] text-muted-foreground uppercase tracking-wider font-semibold">Quick Actions</label>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  onClick={() => patch({ onboardingStep: "complete", isApproved: true })}
                  disabled={loading}
                  className="flex-1 h-9 text-xs bg-primary/10 text-primary border border-primary/20 hover:bg-primary/20"
                >
                  <Zap className="h-3 w-3 mr-1" /> Skip All
                </Button>
                {!user.isApproved && (
                  <Button
                    size="sm"
                    onClick={() => patch({ isApproved: true })}
                    disabled={loading}
                    className="flex-1 h-9 text-xs bg-green-500/10 text-green-400 border border-green-500/20 hover:bg-green-500/20"
                  >
                    <CheckCircle2 className="h-3 w-3 mr-1" /> Approve
                  </Button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [showInvite, setShowInvite] = useState(false);
  const [search, setSearch] = useState("");

  const fetchUsers = () => {
    setLoading(true);
    fetch("/api/admin/users")
      .then(res => res.json())
      .then(data => setUsers(data.users ?? []))
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchUsers(); }, []);

  const filtered = users.filter(u =>
    u.name?.toLowerCase().includes(search.toLowerCase()) ||
    u.email?.toLowerCase().includes(search.toLowerCase())
  );

  const pending   = filtered.filter(u => !u.isApproved);
  const approved  = filtered.filter(u => u.isApproved);
  const incomplete = approved.filter(u => u.onboardingStep !== "complete");

  return (
    <div className="p-8 space-y-8 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">User Management</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {users.length} total · {pending.length} pending · {incomplete.length} onboarding in progress
          </p>
        </div>
        <Button
          onClick={() => setShowInvite(true)}
          className="bg-primary hover:bg-primary text-black font-bold gap-2 h-10"
        >
          <UserPlus className="h-4 w-4" />
          Add User
        </Button>
      </div>

      <PilotCodesPanel />

      {/* Search */}
      <Input
        placeholder="Search by name or email…"
        value={search}
        onChange={e => setSearch(e.target.value)}
        className="bg-background border-border text-foreground h-10 max-w-sm"
      />

      {/* Onboarding Alert */}
      {incomplete.length > 0 && (
        <div className="flex items-center gap-3 p-4 rounded-xl border border-primary/20 bg-primary/5">
          <AlertTriangle className="h-4 w-4 text-primary shrink-0" />
          <p className="text-sm text-primary/80">
            <strong>{incomplete.length} user{incomplete.length !== 1 ? "s have" : " has"}</strong> not completed onboarding. Use the controls below to push them forward or skip the wizard.
          </p>
        </div>
      )}

      {/* Loading */}
      {loading ? (
        <div className="flex items-center justify-center py-20 text-zinc-600 gap-2">
          <RefreshCw className="h-4 w-4 animate-spin" />
          <span className="text-sm">Loading users…</span>
        </div>
      ) : (
        <div className="space-y-8">
          {/* Pending Section */}
          {pending.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-primary" />
                <h2 className="text-sm font-bold text-foreground uppercase tracking-wider">Pending Approval</h2>
                <Badge className="bg-primary/10 text-primary border-primary/20 text-[10px]">{pending.length}</Badge>
              </div>
              {pending.map(u => <UserRow key={u.id} user={u} onRefresh={fetchUsers} />)}
            </div>
          )}

          {/* Active Users Section */}
          {approved.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Shield className="h-4 w-4 text-green-400" />
                <h2 className="text-sm font-bold text-foreground uppercase tracking-wider">Active Users</h2>
                <Badge className="bg-green-500/10 text-green-400 border-green-500/20 text-[10px]">{approved.length}</Badge>
              </div>
              {approved.map(u => <UserRow key={u.id} user={u} onRefresh={fetchUsers} />)}
            </div>
          )}

          {filtered.length === 0 && (
            <div className="text-center py-20 text-muted-foreground">
              <p className="text-sm">No users found.</p>
            </div>
          )}
        </div>
      )}

      {/* Invite Modal */}
      {showInvite && (
        <InviteModal
          onClose={() => setShowInvite(false)}
          onSuccess={fetchUsers}
        />
      )}
    </div>
  );
}
