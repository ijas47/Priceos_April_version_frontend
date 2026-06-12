import { connectDB, Listing } from "@/lib/db";
import { apiSuccess, apiError } from "@/lib/api/response";
import { getPropertiesSchema, formatZodErrors } from "@/lib/validators";
import { checkRateLimit, getClientIp, RATE_LIMITS } from "@/lib/api/rate-limit";

export async function GET(request: Request) {
    const ip = getClientIp(request);
    const rateCheck = checkRateLimit(`properties-list:${ip}`, RATE_LIMITS.standard);
    if (!rateCheck.allowed) {
        return apiError("RATE_LIMITED", `Try again in ${Math.ceil(rateCheck.resetMs / 1000)}s.`, 429);
    }

    const { searchParams } = new URL(request.url);
    const validation = getPropertiesSchema.safeParse({
        search: searchParams.get("search") || undefined,
        status: searchParams.get("status") || "active",
    });

    if (!validation.success) {
        return apiError("VALIDATION_ERROR", "Invalid query parameters", 400, formatZodErrors(validation.error));
    }

    const { search } = validation.data;

    try {
        await connectDB();

        const filter: Record<string, unknown> = { isActive: true };
        if (search) {
            filter.name = { $regex: search, $options: "i" };
        }

        const results = await Listing.find(filter).sort({ name: 1 }).lean();

        const properties = results.map(l => ({
            id: l._id.toString(),
            name: l.name,
            area: l.area,
            bedroomsNumber: l.bedroomsNumber,
            bathroomsNumber: l.bathroomsNumber,
            price: l.price,
            currencyCode: l.currencyCode,
            personCapacity: l.personCapacity,
            priceFloor: l.priceFloor,
            priceCeiling: l.priceCeiling,
            isActive: l.isActive,
        }));

        return apiSuccess({ properties, count: properties.length });
    } catch (error) {
        console.error("❌ [v1/properties GET] Error:", error);
        return apiError("INTERNAL_ERROR", "Failed to load properties", 500);
    }
}
