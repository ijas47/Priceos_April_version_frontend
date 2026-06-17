"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { RefreshCw, Calendar, Loader2, Building2, CalendarCheck, Database } from "lucide-react";
import { DataTypeCard } from "./data-type-card";
import { useContextStore } from "@/stores/context-store";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Table,
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  TableCell,
} from "@/components/ui/table";

interface SyncStatus {
  listings: {
    count: number;
    lastSyncedAt: Date | null;
    isLoading: boolean;
    error?: string;
  };
  reservations: {
    count: number;
    lastSyncedAt: Date | null;
    isLoading: boolean;
    error?: string;
  };
  calendar: {
    daysCount: number;
    lastSyncedAt: Date | null;
    isLoading: boolean;
    error?: string;
  };
}

export function SyncStatusSidebar() {
  const { contextType, propertyId, propertyName } = useContextStore();
  const [syncStatus, setSyncStatus] = useState<SyncStatus>({
    listings: { count: 0, lastSyncedAt: null, isLoading: false },
    reservations: { count: 0, lastSyncedAt: null, isLoading: false },
    calendar: { daysCount: 0, lastSyncedAt: null, isLoading: false },
  });
  const [isSyncing, setIsSyncing] = useState(false);
  // Dialog State for reservations
  const [isReservationsOpen, setIsReservationsOpen] = useState(false);
  const [detailedReservations, setDetailedReservations] = useState<any[]>([]);
  const [isLoadingReservations, setIsLoadingReservations] = useState(false);

  // Fetch sync status from DB
  const fetchSyncStatus = async () => {
    try {
      const params = new URLSearchParams({
        context: contextType,
        ...(contextType === "property" && propertyId
          ? { propertyId: propertyId.toString() }
          : {}),
      });

      const response = await fetch(`/api/sync/status?${params}`);
      if (!response.ok) throw new Error("Failed to fetch sync status");

      const data = await response.json();

      setSyncStatus({
        listings: {
          count: data.listings.count,
          lastSyncedAt: data.listings.lastSyncedAt
            ? new Date(data.listings.lastSyncedAt)
            : null,
          isLoading: false,
        },
        reservations: {
          count: data.reservations.count,
          lastSyncedAt: data.reservations.lastSyncedAt
            ? new Date(data.reservations.lastSyncedAt)
            : null,
          isLoading: false,
        },
        calendar: {
          daysCount: data.inventory_master.daysCount,
          lastSyncedAt: data.inventory_master.lastSyncedAt
            ? new Date(data.inventory_master.lastSyncedAt)
            : null,
          isLoading: false,
        },
      });
    } catch (error) {
      console.error("Failed to fetch sync status:", error);
    }
  };

  // Fetch on mount and when context changes
  useEffect(() => {
    fetchSyncStatus();
  }, [contextType, propertyId]);

  // Handle manual sync - re-fetch data counts from DB
  const handleSyncAll = async () => {
    setIsSyncing(true);

    // Set loading state for all data types
    setSyncStatus((prev) => ({
      listings: { ...prev.listings, isLoading: true, error: undefined },
      reservations: { ...prev.reservations, isLoading: true, error: undefined },
      calendar: { ...prev.calendar, isLoading: true, error: undefined },
    }));

    try {
      // Trigger actual sync from PMS
      console.log("Starting sync trigger...");
      const triggerResponse = await fetch("/api/sync/trigger", { method: "POST" });
      if (!triggerResponse.ok) throw new Error("PMS Sync trigger failed");

      // After successful sync, fetch current counts from the database
      const params = new URLSearchParams({
        context: contextType,
        ...(contextType === "property" && propertyId
          ? { propertyId: propertyId.toString() }
          : {}),
      });

      const response = await fetch(`/api/sync/status?${params}`);
      if (!response.ok) throw new Error("Failed to fetch updated status");

      const data = await response.json();
      const timestamp = new Date();

      setSyncStatus({
        listings: {
          count: data.listings.count,
          lastSyncedAt: timestamp,
          isLoading: false,
        },
        reservations: {
          count: data.reservations.count,
          lastSyncedAt: timestamp,
          isLoading: false,
        },
        calendar: {
          daysCount: data.inventory_master.daysCount,
          lastSyncedAt: timestamp,
          isLoading: false,
        },
      });

      console.log(
        `Sync complete: ${data.listings.count} listing(s), ${data.reservations.count} reservation(s), ${data.inventory_master.daysCount} calendar day(s)`
      );
    } catch (error) {
      console.error("Sync failed:", error);

      // Set error state for all data types
      setSyncStatus((prev) => ({
        listings: { ...prev.listings, isLoading: false, error: "Sync failed" },
        reservations: {
          ...prev.reservations,
          isLoading: false,
          error: "Sync failed",
        },
        calendar: { ...prev.calendar, isLoading: false, error: "Sync failed" },
      }));
    } finally {
      setIsSyncing(false);
    }
  };

  // Context-aware subtitle label
  const listingsSubLabel =
    contextType === "property"
      ? syncStatus.listings.count === 1
        ? "property"
        : "properties"
      : "properties";
  const reservationsSubLabel =
    syncStatus.reservations.count === 1 ? "booking" : "bookings";
  const calendarSubLabel =
    syncStatus.calendar.daysCount === 1 ? "day" : "days";
  const handleOpenReservations = async () => {
    setIsReservationsOpen(true);
    setIsLoadingReservations(true);
    try {
      const params = new URLSearchParams({
        context: contextType,
        ...(contextType === "property" && propertyId
          ? { propertyId: propertyId.toString() }
          : {}),
      });
      const response = await fetch(`/api/reservations?${params}`);
      if (!response.ok) throw new Error("Failed to fetch reservations");
      const data = await response.json();
      setDetailedReservations(data.reservations || []);
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoadingReservations(false);
    }
  };

  return (
    <aside className="shrink-0 bg-background flex flex-col relative w-full pb-4">
      <div className="border-b p-4">
        <h3 className="font-semibold mb-2">Hostaway Data</h3>
        <p className="text-xs text-muted-foreground">
          Agent context for{" "}
          {contextType === "portfolio" ? "portfolio" : propertyName}
        </p>
      </div>

      {/* Data Types */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
        <DataTypeCard
          icon={Building2}
          label="Listings"
          count={syncStatus.listings.count}
          countLabel={listingsSubLabel}
          lastSynced={syncStatus.listings.lastSyncedAt}
          isLoading={syncStatus.listings.isLoading}
          error={syncStatus.listings.error}
        />

        <DataTypeCard
          icon={CalendarCheck}
          label="Reservations"
          count={syncStatus.reservations.count}
          countLabel={reservationsSubLabel}
          lastSynced={syncStatus.reservations.lastSyncedAt}
          isLoading={syncStatus.reservations.isLoading}
          error={syncStatus.reservations.error}
          onClick={handleOpenReservations}
        />

        <DataTypeCard
          icon={Calendar}
          label="Calendar Days"
          count={syncStatus.calendar.daysCount}
          countLabel={calendarSubLabel}
          lastSynced={syncStatus.calendar.lastSyncedAt}
          isLoading={syncStatus.calendar.isLoading}
          error={syncStatus.calendar.error}
        />
      </div>

      <Dialog open={isReservationsOpen} onOpenChange={setIsReservationsOpen}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Guest Details & Reservations</DialogTitle>
            <DialogDescription>
              Displaying all reservations for the current context.
            </DialogDescription>
          </DialogHeader>
          <div className="mt-4">
            {isLoadingReservations ? (
              <div className="flex items-center justify-center p-8">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : detailedReservations.length === 0 ? (
              <p className="text-center text-muted-foreground p-8">No reservations found.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Guest</TableHead>
                    <TableHead>Contact</TableHead>
                    <TableHead>Stay Dates</TableHead>
                    <TableHead>Channel</TableHead>
                    <TableHead>Financials</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {detailedReservations.map((res, i) => {
                    const guest = res.guestDetails || {};
                    const start = new Date(res.startDate).toLocaleDateString();
                    const end = new Date(res.endDate).toLocaleDateString();
                    const name = guest.name || res.title || "Unknown";
                    const email = guest.email || "-";
                    const phone = guest.phone || "-";
                    const finances = res.financials?.price_per_night ? `${res.financials.price_per_night} / night` : "-";

                    return (
                      <TableRow key={res.id || i}>
                        <TableCell>
                          <div className="font-medium">{name}</div>
                          {guest.numberOfGuests && (
                            <div className="text-xs text-muted-foreground">{guest.numberOfGuests} guests</div>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="text-sm">{email}</div>
                          <div className="text-sm text-muted-foreground">{phone}</div>
                        </TableCell>
                        <TableCell>
                          <div className="text-sm">{start}</div>
                          <div className="text-sm text-muted-foreground">to {end}</div>
                        </TableCell>
                        <TableCell>{res.financials?.channelName || "Direct"}</TableCell>
                        <TableCell>{finances}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </aside>
  );
}
