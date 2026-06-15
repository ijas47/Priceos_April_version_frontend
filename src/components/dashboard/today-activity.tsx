import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { LogIn, LogOut, Calendar } from "lucide-react";
import type { Reservation, Listing } from "@/types/hostaway";

interface TodayActivityProps {
  checkIns: Reservation[];
  checkOuts: Reservation[];
  properties: Listing[];
}

function getPropertyName(
  listingMapId: number | string,
  properties: Listing[]
): string {
  return properties.find((p) => String(p.id) === String(listingMapId))?.name ?? `#${listingMapId}`;
}

export function TodayActivity({
  checkIns,
  checkOuts,
  properties,
}: TodayActivityProps) {
  const hasActivity = checkIns.length > 0 || checkOuts.length > 0;

  return (
    <Card className="relative overflow-hidden">
      {/* Decorative gradient background */}
      <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-br from-sky-100/20 to-blue-100/20 dark:from-primary/10 dark:to-primary/5 rounded-full blur-3xl -z-0" />

      <CardHeader className="relative">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg font-bold flex items-center gap-2">
            <div className="rounded-lg bg-gradient-to-br from-primary to-primary/85 p-2 shadow-md">
              <Calendar className="h-4 w-4 text-white" />
            </div>
            Today&apos;s Activity
          </CardTitle>
          <Badge variant="outline" className="border-primary/30 text-primary dark:text-primary font-semibold">
            {checkIns.length + checkOuts.length} {checkIns.length + checkOuts.length === 1 ? 'event' : 'events'}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="relative">
        {!hasActivity ? (
          <div className="text-center py-8">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-muted mb-4">
              <Calendar className="h-8 w-8 text-muted-foreground" />
            </div>
            <p className="text-sm text-muted-foreground font-medium">
              No check-ins or check-outs scheduled for today
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {checkIns.map((res) => (
              <div
                key={`in-${res.id}`}
                className="group flex items-center justify-between rounded-xl border p-4 transition-all duration-300 hover:shadow-md hover:border-emerald-500/30 bg-gradient-to-r from-transparent to-emerald-50/50 dark:to-emerald-950/20"
              >
                <div className="flex items-center gap-4">
                  <div className="rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 p-2.5 shadow-lg group-hover:scale-110 group-hover:rotate-3 transition-transform duration-300">
                    <LogIn className="h-5 w-5 text-white" />
                  </div>
                  <div>
                    <p className="text-sm font-bold">{res.guestName}</p>
                    <p className="text-xs text-muted-foreground font-medium">
                      {getPropertyName(res.listingMapId, properties)}
                    </p>
                  </div>
                </div>
                <Badge className="bg-gradient-to-r from-emerald-500 to-teal-600 text-white border-0 shadow-md">
                  Check-in
                </Badge>
              </div>
            ))}
            {checkOuts.map((res) => (
              <div
                key={`out-${res.id}`}
                className="group flex items-center justify-between rounded-xl border p-4 transition-all duration-300 hover:shadow-md hover:border-destructive/30 bg-gradient-to-r from-transparent to-rose-50/50 dark:to-rose-950/20"
              >
                <div className="flex items-center gap-4">
                  <div className="rounded-xl bg-gradient-to-br from-primary to-sky-600 p-2.5 shadow-lg group-hover:scale-110 group-hover:rotate-3 transition-transform duration-300">
                    <LogOut className="h-5 w-5 text-white" />
                  </div>
                  <div>
                    <p className="text-sm font-bold">{res.guestName}</p>
                    <p className="text-xs text-muted-foreground font-medium">
                      {getPropertyName(res.listingMapId, properties)}
                    </p>
                  </div>
                </div>
                <Badge className="bg-gradient-to-r from-primary to-sky-600 text-white border-0 shadow-md">
                  Check-out
                </Badge>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
