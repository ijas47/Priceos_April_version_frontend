/**
 * Dubai Government Developer Portal API catalog.
 * Source: https://developer.dubai.gov.ae/portal/rest/v1/apis
 *
 * Only event/tourism feeds are integrated into market intel; others are
 * registered for observability and future use (compliance, payments).
 */

export type DubaiGovApiCategory =
  | "events"
  | "tourism"
  | "payments"
  | "civic"
  | "health"
  | "business";

export type DubaiGovIntegrationStatus =
  | "integrated"
  | "catalogued"
  | "not_applicable";

export interface DubaiGovApiDefinition {
  id: string;
  portalPath: string;
  name: string;
  category: DubaiGovApiCategory;
  summary: string;
  baseUrl?: string;
  relevantForPriceOS: boolean;
  integrationStatus: DubaiGovIntegrationStatus;
  envKey?: string;
  tags: string[];
}

/** All APIs currently published on the Dubai Gov developer portal (12 total). */
export const DUBAI_GOV_API_CATALOG: DubaiGovApiDefinition[] = [
  {
    id: "84994f74-aaa3-4cbe-b2a4-467a8a52ec77",
    portalPath: "/portal/apis/84994f74-aaa3-4cbe-b2a4-467a8a52ec77",
    name: "SDG-DTCM-CalendarEvents",
    category: "events",
    summary: "DTCM / Visit Dubai calendar — events, venues, itineraries (GraphQL).",
    baseUrl: "https://apis.dubai.gov.ae/secure/dtcm/calendarevents/1.0.0",
    relevantForPriceOS: true,
    integrationStatus: "integrated",
    envKey: "DUBAI_GOV_API_KEY",
    tags: ["DTCM", "entertainment", "tourism"],
  },
  {
    id: "b67333b6-2fbb-494d-9e55-b4d2e082a5f1",
    portalPath: "/portal/apis/b67333b6-2fbb-494d-9e55-b4d2e082a5f1",
    name: "SDG-DCUL-CulturalEvents",
    category: "events",
    summary: "Dubai Culture & Arts Authority — cultural events in and around Dubai (REST).",
    baseUrl: "https://apis.dubai.gov.ae/secure/sdg/dcul/culturalevents/1.0.0",
    relevantForPriceOS: true,
    integrationStatus: "integrated",
    envKey: "DUBAI_GOV_API_KEY",
    tags: ["DCUL", "DubaiCulture", "CulturalEvents"],
  },
  {
    id: "ab1a794b-4f48-4589-8a2f-c50079103be6",
    portalPath: "/portal/apis/ab1a794b-4f48-4589-8a2f-c50079103be6",
    name: "SDG-DED-Activities",
    category: "business",
    summary: "Dubai Economy — licensed business activity codes.",
    baseUrl: "https://apis.dubai.gov.ae/secure/sdg/ded/activities",
    relevantForPriceOS: false,
    integrationStatus: "catalogued",
    tags: ["ded", "activities", "licensing"],
  },
  {
    id: "563ad7c9-0342-443b-bc1c-ab46d2e213c8",
    portalPath: "/portal/apis/563ad7c9-0342-443b-bc1c-ab46d2e213c8",
    name: "DubaiPay Payment Integration",
    category: "payments",
    summary: "Government shared payment gateway.",
    relevantForPriceOS: false,
    integrationStatus: "not_applicable",
    tags: ["payments"],
  },
  {
    id: "18797d0c-60d2-4b98-b1b2-2323a5043c62",
    portalPath: "/portal/apis/18797d0c-60d2-4b98-b1b2-2323a5043c62",
    name: "DubaiPay Transaction Status",
    category: "payments",
    summary: "Payment transaction status lookup.",
    relevantForPriceOS: false,
    integrationStatus: "not_applicable",
    tags: ["payments"],
  },
  {
    id: "2858391e-a7c3-4a22-9483-c7aae72c0860",
    portalPath: "/portal/apis/2858391e-a7c3-4a22-9483-c7aae72c0860",
    name: "SDG-AMAF-DonationContributions",
    category: "civic",
    summary: "Awqaf donation contributions lookup.",
    relevantForPriceOS: false,
    integrationStatus: "not_applicable",
    tags: ["AMAF", "Donations"],
  },
  {
    id: "e36ce409-962a-47ff-a5a6-66b714eb8cf8",
    portalPath: "/portal/apis/e36ce409-962a-47ff-a5a6-66b714eb8cf8",
    name: "SDG-AMAF-DonationPrograms",
    category: "civic",
    summary: "Awqaf donation programs list.",
    relevantForPriceOS: false,
    integrationStatus: "not_applicable",
    tags: ["AMAF", "Donations"],
  },
  {
    id: "fe31bd18-f94b-4673-8f59-d57718fea0fb",
    portalPath: "/portal/apis/fe31bd18-f94b-4673-8f59-d57718fea0fb",
    name: "SDG-CDA-SanadCardServices",
    category: "civic",
    summary: "Community Development Authority — Sanad card services.",
    relevantForPriceOS: false,
    integrationStatus: "not_applicable",
    tags: ["CDA", "SanadCard"],
  },
  {
    id: "5c90b8f0-1636-4fb8-ba00-b385d59eb99c",
    portalPath: "/portal/apis/5c90b8f0-1636-4fb8-ba00-b385d59eb99c",
    name: "SDG-CDA-ThukherCardServices",
    category: "civic",
    summary: "Thukher card for senior citizens.",
    relevantForPriceOS: false,
    integrationStatus: "not_applicable",
    tags: ["CDA", "ThukherCard"],
  },
  {
    id: "e25f8802-9b38-4a94-be76-734c21391ec2",
    portalPath: "/portal/apis/e25f8802-9b38-4a94-be76-734c21391ec2",
    name: "SDG-DC-MarriageDetails",
    category: "civic",
    summary: "Dubai Courts marriage certificate lookup.",
    relevantForPriceOS: false,
    integrationStatus: "not_applicable",
    tags: ["DubaiCourts", "MarriageCertificate"],
  },
  {
    id: "5100b9a4-cbdd-499b-91cd-63de430172e0",
    portalPath: "/portal/apis/5100b9a4-cbdd-499b-91cd-63de430172e0",
    name: "SDG-DHA-PanoramaImmunization",
    category: "health",
    summary: "DHA immunization records (B2B).",
    relevantForPriceOS: false,
    integrationStatus: "not_applicable",
    tags: ["DHA", "Immunization"],
  },
  {
    id: "b10bea6b-7d76-4f62-bdd0-264e3b0ffd0d",
    portalPath: "/portal/apis/b10bea6b-7d76-4f62-bdd0-264e3b0ffd0d",
    name: "SDG-DHA-PanoramaLabResults",
    category: "health",
    summary: "DHA lab results (B2B).",
    relevantForPriceOS: false,
    integrationStatus: "not_applicable",
    tags: ["DHA", "labresults"],
  },
  {
    id: "8de1bdfc-6e5b-413f-a058-7a3d86b5d211",
    portalPath: "/portal/apis/8de1bdfc-6e5b-413f-a058-7a3d86b5d211",
    name: "SDG-DHA-RetrieveVaccinationCard",
    category: "health",
    summary: "COVID-19 vaccination card retrieval.",
    relevantForPriceOS: false,
    integrationStatus: "not_applicable",
    tags: ["DHA", "health"],
  },
];

export function getIntegratedDubaiGovApis(): DubaiGovApiDefinition[] {
  return DUBAI_GOV_API_CATALOG.filter((a) => a.integrationStatus === "integrated");
}

export function getPriceOSRelevantApis(): DubaiGovApiDefinition[] {
  return DUBAI_GOV_API_CATALOG.filter((a) => a.relevantForPriceOS);
}