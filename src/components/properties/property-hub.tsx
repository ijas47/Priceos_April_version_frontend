"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Bed, Bath, MapPin } from "lucide-react";
import { ListingEditForm } from "@/components/properties/listing-edit-form";
import { CalendarGrid } from "@/components/calendar/calendar-grid";
import { SeasonalRulesTable } from "@/components/properties/seasonal-rules-table";
import { AutopilotSettings } from "@/components/engine/autopilot-settings";
import { RulesTable } from "@/components/engine/rules-table";
import { CompPicker } from "@/components/pricing/comp-picker";
import { ExpenseTable } from "@/components/finance/expense-table";
import { OwnerStatementCard } from "@/components/finance/owner-statement-card";
import { BookingsDataTable } from "@/components/bookings/bookings-data-table";
import type { Listing, CalendarDay, Reservation } from "@/types/hostaway";
import type { SeasonalRule, Expense, OwnerStatement } from "@/types/operations";

interface PropertyHubProps {
  property: Listing;
  calendar: CalendarDay[];
  reservations: Reservation[];
  rules: SeasonalRule[];
  expenses: Expense[];
  statements: OwnerStatement[];
}

// Helper to map Hostaway property type IDs
function getPropertyTypeLabel(id: number): string {
  const map: Record<number, string> = {
    1: "Apartment",
    2: "House",
    3: "Villa",
    4: "Studio",
    5: "Townhouse",
  };
  return map[id] || "Property";
}

export function PropertyHub({
  property,
  calendar,
  reservations,
  rules,
  expenses,
  statements,
}: PropertyHubProps) {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">{property.name}</h1>
          <div className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
            <MapPin className="h-3.5 w-3.5" />
            {property.area}
          </div>
        </div>
        <ListingEditForm property={property} />
      </div>

      {/* Quick stats */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Type</p>
            <p className="text-lg font-semibold">{getPropertyTypeLabel(property.propertyTypeId)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex items-center gap-1.5">
              <Bed className="h-4 w-4 text-muted-foreground" />
              <span className="font-semibold">
                {property.bedroomsNumber === 0
                  ? "Studio"
                  : property.bedroomsNumber}
              </span>
            </div>
            <Separator orientation="vertical" className="h-5" />
            <div className="flex items-center gap-1.5">
              <Bath className="h-4 w-4 text-muted-foreground" />
              <span className="font-semibold">{property.bathroomsNumber}</span>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Base Price</p>
            <p className="text-lg font-semibold">{property.price} {(property as any).currencyCode || "AED"}</p>
          </CardContent>
        </Card>

      </div>

      {/* Tabs */}
      <Tabs defaultValue="details">
        <TabsList>
          <TabsTrigger value="details">Details</TabsTrigger>
          <TabsTrigger value="calendar">Calendar</TabsTrigger>
          <TabsTrigger value="bookings">
            Bookings ({reservations.length})
          </TabsTrigger>
          <TabsTrigger value="rules">Rules ({rules.length})</TabsTrigger>
          <TabsTrigger value="comps">Comps</TabsTrigger>
          <TabsTrigger value="financials">Financials</TabsTrigger>
        </TabsList>

        <TabsContent value="details" className="mt-4">
          {/* Amenities */}
          {property.amenities && property.amenities.length > 0 && (
            <div>
              <h3 className="mb-2 text-sm font-medium">Amenities</h3>
              <div className="flex flex-wrap gap-2">
                {property.amenities.map((amenity) => (
                  <Badge key={amenity} variant="secondary">
                    {amenity}
                  </Badge>
                ))}
              </div>
            </div>
          )}
          {property.personCapacity && (
            <div className="mt-4">
              <h3 className="mb-1 text-sm font-medium">Max Guests</h3>
              <p className="text-muted-foreground">
                {property.personCapacity} person(s)
              </p>
            </div>
          )}
        </TabsContent>

        <TabsContent value="calendar" className="mt-4">
          <CalendarGrid days={calendar} />
        </TabsContent>

        <TabsContent value="bookings" className="mt-4">
          <BookingsDataTable
            reservations={reservations}
            properties={[property]}
          />
        </TabsContent>

        <TabsContent value="rules" className="mt-4 space-y-8">
          <AutopilotSettings listingId={String(property.id)} />
          <Separator />
          <RulesTable listingId={String(property.id)} />
        </TabsContent>

        <TabsContent value="comps" className="mt-4">
          <CompPicker listingId={String(property.id)} />
        </TabsContent>

        <TabsContent value="financials" className="mt-4 space-y-6">
          <OwnerStatementCard
            statements={statements}
            properties={[property]}
          />
          <ExpenseTable
            initialExpenses={expenses}
            properties={[property]}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
