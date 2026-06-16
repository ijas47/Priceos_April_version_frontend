/**
 * Geo bounds for comp-set searches by Dubai sub-market.
 * Approximate Airbtics bounding boxes (±0.015° ~ 1.5km).
 */

export interface GeoBounds {
  ne_lat: number;
  ne_lng: number;
  sw_lat: number;
  sw_lng: number;
}

/** Normalize area names for lookup. */
function normArea(area: string): string {
  return area.trim().toLowerCase().replace(/\s+/g, " ");
}

const DUBAI_AREA_BOUNDS: Record<string, GeoBounds> = {
  "dubai marina": { ne_lat: 25.095, ne_lng: 55.155, sw_lat: 25.065, sw_lng: 55.125 },
  jbr: { ne_lat: 25.085, ne_lng: 55.135, sw_lat: 25.065, sw_lng: 55.115 },
  "jumeirah beach residence": { ne_lat: 25.085, ne_lng: 55.135, sw_lat: 25.065, sw_lng: 55.115 },
  "downtown dubai": { ne_lat: 25.205, ne_lng: 55.285, sw_lat: 25.185, sw_lng: 55.265 },
  "business bay": { ne_lat: 25.195, ne_lng: 55.275, sw_lat: 25.175, sw_lng: 55.255 },
  "palm jumeirah": { ne_lat: 25.125, ne_lng: 55.145, sw_lat: 25.095, sw_lng: 55.115 },
  "jumeirah village circle": { ne_lat: 25.065, ne_lng: 55.215, sw_lat: 25.045, sw_lng: 55.195 },
  jvc: { ne_lat: 25.065, ne_lng: 55.215, sw_lat: 25.045, sw_lng: 55.195 },
  "dubai hills": { ne_lat: 25.115, ne_lng: 55.255, sw_lat: 25.095, sw_lng: 55.235 },
  "city walk": { ne_lat: 25.215, ne_lng: 55.265, sw_lat: 25.195, sw_lng: 55.245 },
};

/** Dubai city-wide fallback when area is unknown. */
const DUBAI_CITY_BOUNDS: GeoBounds = {
  ne_lat: 25.28,
  ne_lng: 55.35,
  sw_lat: 25.05,
  sw_lng: 55.10,
};

/**
 * Resolve map bounds for Airbtics comp-set search from listing area/city.
 */
export function resolveAreaBounds(area: string, city: string): GeoBounds | null {
  const c = city.trim().toLowerCase();
  if (c !== "dubai" && c !== "dubai, uae") return null;

  const key = normArea(area);
  if (DUBAI_AREA_BOUNDS[key]) return DUBAI_AREA_BOUNDS[key];

  for (const [name, bounds] of Object.entries(DUBAI_AREA_BOUNDS)) {
    if (key.includes(name) || name.includes(key)) return bounds;
  }

  return DUBAI_CITY_BOUNDS;
}