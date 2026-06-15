"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
} from "react";
import { useContextStore } from "@/stores/context-store";
import { getOrgId, resolveOrgId } from "@/lib/auth/client";
import type { AgentCacheContext, SyncStatusResponse } from "./types";
import { isWithin15Minutes } from "./utils";

interface AgentCacheContextValue {
  cache: AgentCacheContext | null;
  isReady: boolean;
  refresh: () => Promise<void>;
}

const AgentCacheContextProvider =
  createContext<AgentCacheContextValue | null>(null);

export function AgentCacheProvider({ children }: { children: ReactNode }) {
  const { contextType, propertyId, propertyName } = useContextStore();
  const [cache, setCache] = useState<AgentCacheContext | null>(null);
  const [isReady, setIsReady] = useState(false);

  const refresh = async () => {
    try {
      const orgId = getOrgId() ?? (await resolveOrgId());
      if (!orgId) return;

      const params = new URLSearchParams({
        orgId,
        context: contextType,
        ...(propertyId ? { propertyId: propertyId.toString() } : {}),
      });

      const response = await fetch(`/api/sync/status?${params}`);

      if (!response.ok) {
        throw new Error(`Failed to fetch sync status: ${response.statusText}`);
      }

      const data: SyncStatusResponse = await response.json();

      const agentCache: AgentCacheContext = {
        context: {
          type: contextType,
          propertyId: propertyId ?? undefined,
          propertyName: propertyName ?? undefined,
        },
        data: {
          listings: {
            count: data.listings.count,
            lastSyncedAt: data.listings.lastSyncedAt,
            isFresh: isWithin15Minutes(data.listings.lastSyncedAt),
          },
          reservations: {
            count: data.reservations.count,
            lastSyncedAt: data.reservations.lastSyncedAt,
            isFresh: isWithin15Minutes(data.reservations.lastSyncedAt),
          },
          calendar: {
            daysCount: data.inventory_master.daysCount,
            lastSyncedAt: data.inventory_master.lastSyncedAt,
            isFresh: isWithin15Minutes(data.inventory_master.lastSyncedAt),
          },
        },
        meta: {
          cacheGeneratedAt: new Date().toISOString(),
          isStale:
            !isWithin15Minutes(data.listings.lastSyncedAt) ||
            !isWithin15Minutes(data.reservations.lastSyncedAt) ||
            !isWithin15Minutes(data.inventory_master.lastSyncedAt),
        },
      };

      setCache(agentCache);
      setIsReady(true);
    } catch (error) {
      console.error("Failed to refresh agent cache:", error);
      setIsReady(false);
    }
  };

  // Refresh cache when context changes
  useEffect(() => {
    setIsReady(false);
    refresh();
  }, [contextType, propertyId]);

  return (
    <AgentCacheContextProvider.Provider value={{ cache, isReady, refresh }}>
      {children}
    </AgentCacheContextProvider.Provider>
  );
}

export function useAgentCache() {
  const context = useContext(AgentCacheContextProvider);
  if (!context) {
    throw new Error("useAgentCache must be used within AgentCacheProvider");
  }
  return context;
}
