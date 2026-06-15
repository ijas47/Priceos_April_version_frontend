"use client";

import { useEffect } from "react";
import { resolveOrgId, setOrgId } from "@/lib/auth/client";

/** Hydrates client-side org context from the httpOnly session cookie via /api/auth/me. */
export function SessionHydrator({ orgId }: { orgId?: string }) {
  useEffect(() => {
    if (orgId) {
      setOrgId(orgId);
      return;
    }
    void resolveOrgId();
  }, [orgId]);

  return null;
}