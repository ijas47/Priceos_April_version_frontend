"""
PriceOS MongoDB Seed Script
Run: python3 seed_data.py

Requires:
    pip install pymongo bcrypt
"""

import os
import sys
from datetime import datetime, timedelta
from bson import ObjectId
import random

try:
    import pymongo
    import bcrypt
except ImportError:
    print("Installing required packages...")
    import subprocess
    subprocess.check_call([sys.executable, "-m", "pip", "install", "pymongo", "bcrypt"])
    import pymongo
    import bcrypt

# ─── Connection ───────────────────────────────────────────────────────────────
# Credentials are read from the environment — never hardcode secrets in source.
#   export MONGODB_URI="mongodb://..."
#   export DATABASE_NAME="priceos"
#   export DEMO_ADMIN_PASSWORD="..."   (optional; defaults to a random value)

MONGO_URI = os.environ.get("MONGODB_URI")
if not MONGO_URI:
    sys.exit("MONGODB_URI environment variable is required (see .env.example)")
DB_NAME = os.environ.get("DATABASE_NAME", "priceos")

client = pymongo.MongoClient(MONGO_URI)
db = client[DB_NAME]

# ─── Helpers ──────────────────────────────────────────────────────────────────

def hash_password(plain: str) -> str:
    return bcrypt.hashpw(plain.encode(), bcrypt.gensalt(rounds=10)).decode()

def date_str(d: datetime) -> str:
    return d.strftime("%Y-%m-%d")

today = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)

# ─── 1. Organization (Admin User) ─────────────────────────────────────────────

print("\n[1/6] Seeding Organization...")

org_id = ObjectId()
org_doc = {
    "_id": org_id,
    "name": "PriceOS Demo Org",
    "email": "admin@priceos.ae",
    "passwordHash": hash_password(
        os.environ.get("DEMO_ADMIN_PASSWORD") or ObjectId().binary.hex()
    ),
    "role": "owner",
    "isApproved": True,
    "fullName": "PriceOS Admin",
    "hostawayApiKey": None,
    "hostawayAccountId": None,
    "marketCode": "UAE_DXB",
    "currency": "AED",
    "timezone": "Asia/Dubai",
    "plan": "growth",
    "settings": {
        "guardrails": {
            "maxSingleDayChangePct": 15,
            "autoApproveThreshold": 5,
            "absoluteFloorMultiplier": 0.5,
            "absoluteCeilingMultiplier": 3.0,
        },
        "automation": {
            "autoPushApproved": False,
            "dailyPipelineRun": True,
        },
        "overrides": {},
    },
    "createdAt": datetime.utcnow(),
    "updatedAt": datetime.utcnow(),
}

db.organizations.delete_many({})
db.organizations.insert_one(org_doc)
print(f"  ✓ Created org: admin@priceos.ae  /  Admin@123456  (id={org_id})")

# ─── 2. Listings (5 Dubai Properties) ────────────────────────────────────────

print("\n[2/6] Seeding Listings...")

properties_def = [
    {
        "name": "Marina Heights 1BR",
        "area": "Dubai Marina",
        "city": "Dubai",
        "bedroomsNumber": 1,
        "bathroomsNumber": 1,
        "propertyTypeId": 1,
        "price": 650,
        "priceFloor": 350,
        "priceCeiling": 1800,
        "personCapacity": 4,
        "amenities": ["WiFi", "Pool", "Gym", "Marina View", "Balcony"],
        "address": "Marina Walk, Dubai Marina, Dubai, UAE",
        "hostawayId": "HW-1001",
    },
    {
        "name": "Downtown Residences 2BR",
        "area": "Downtown Dubai",
        "city": "Dubai",
        "bedroomsNumber": 2,
        "bathroomsNumber": 2,
        "propertyTypeId": 1,
        "price": 950,
        "priceFloor": 500,
        "priceCeiling": 2800,
        "personCapacity": 6,
        "amenities": ["WiFi", "Pool", "Gym", "Burj View", "Balcony", "Parking"],
        "address": "Mohammed Bin Rashid Blvd, Downtown Dubai, UAE",
        "hostawayId": "HW-1002",
    },
    {
        "name": "JBR Beach Studio",
        "area": "Jumeirah Beach Residence",
        "city": "Dubai",
        "bedroomsNumber": 0,
        "bathroomsNumber": 1,
        "propertyTypeId": 4,
        "price": 480,
        "priceFloor": 280,
        "priceCeiling": 1200,
        "personCapacity": 2,
        "amenities": ["WiFi", "Beach Access", "Pool", "Sea View"],
        "address": "The Walk, JBR, Dubai, UAE",
        "hostawayId": "HW-1003",
    },
    {
        "name": "Palm Villa 3BR",
        "area": "Palm Jumeirah",
        "city": "Dubai",
        "bedroomsNumber": 3,
        "bathroomsNumber": 3,
        "propertyTypeId": 8,
        "price": 2200,
        "priceFloor": 1200,
        "priceCeiling": 6000,
        "personCapacity": 8,
        "amenities": ["WiFi", "Private Pool", "Gym", "Sea View", "BBQ", "Parking", "Garden"],
        "address": "Frond B, Palm Jumeirah, Dubai, UAE",
        "hostawayId": "HW-1004",
    },
    {
        "name": "Bay View 1BR",
        "area": "Business Bay",
        "city": "Dubai",
        "bedroomsNumber": 1,
        "bathroomsNumber": 1,
        "propertyTypeId": 1,
        "price": 520,
        "priceFloor": 300,
        "priceCeiling": 1400,
        "personCapacity": 3,
        "amenities": ["WiFi", "Pool", "Gym", "Canal View", "Balcony"],
        "address": "Executive Towers, Business Bay, Dubai, UAE",
        "hostawayId": "HW-1005",
    },
]

db.listings.delete_many({})
listing_ids = []
for p in properties_def:
    lid = ObjectId()
    doc = {
        "_id": lid,
        "orgId": org_id,
        "hostawayId": p["hostawayId"],
        "name": p["name"],
        "city": p["city"],
        "countryCode": "AE",
        "area": p["area"],
        "bedroomsNumber": p["bedroomsNumber"],
        "bathroomsNumber": p["bathroomsNumber"],
        "propertyTypeId": p["propertyTypeId"],
        "price": p["price"],
        "currencyCode": "AED",
        "personCapacity": p["personCapacity"],
        "amenities": p["amenities"],
        "address": p["address"],
        "priceFloor": p["priceFloor"],
        "priceCeiling": p["priceCeiling"],
        "floorReasoning": "Set based on minimum viable nightly rate",
        "ceilingReasoning": "Set based on peak season maximum",
        "guardrailsSource": "manual",
        # Autopilot defaults
        "lastMinuteEnabled": True,
        "lastMinuteDaysOut": 7,
        "lastMinuteDiscountPct": 15,
        "lastMinuteMinStay": None,
        "farOutEnabled": True,
        "farOutDaysOut": 90,
        "farOutMarkupPct": 10,
        "farOutMinStay": None,
        "dowPricingEnabled": True,
        "dowDays": [3, 4],  # Thu+Fri = Dubai weekend
        "dowPriceAdjPct": 25,
        "dowMinStay": None,
        "gapPreventionEnabled": True,
        "minFragmentThreshold": 3,
        "gapFillEnabled": True,
        "gapFillLengthMin": 1,
        "gapFillLengthMax": 3,
        "gapFillDiscountPct": 10,
        "gapFillOverrideCico": True,
        "allowedCheckinDays": [1, 1, 1, 1, 1, 1, 1],
        "allowedCheckoutDays": [1, 1, 1, 1, 1, 1, 1],
        "lowestMinStayAllowed": 1,
        "defaultMaxStay": 365,
        "isActive": True,
        "createdAt": datetime.utcnow(),
        "updatedAt": datetime.utcnow(),
    }
    db.listings.insert_one(doc)
    listing_ids.append((lid, p))
    print(f"  ✓ {p['name']} ({p['area']})  base={p['price']} AED  id={lid}")

# ─── 3. Inventory Master (90 days per property) ───────────────────────────────

print("\n[3/6] Seeding InventoryMaster (90 days × 5 properties)...")

db.inventorymasters.delete_many({})

# Dubai seasonal multipliers (monthly)
SEASON_MULT = {
    1: 1.30, 2: 1.25, 3: 1.20, 4: 1.00,
    5: 0.85, 6: 0.75, 7: 0.70, 8: 0.75,
    9: 0.85, 10: 1.00, 11: 1.20, 12: 1.40,
}

# Dubai high-demand event dates (simplified)
HIGH_DEMAND_DATES = set()
for offset in range(15, 20):   # GITEX-style event ~2 weeks out
    HIGH_DEMAND_DATES.add(date_str(today + timedelta(days=offset)))
for offset in range(45, 49):   # Eid-style holiday
    HIGH_DEMAND_DATES.add(date_str(today + timedelta(days=offset)))
for offset in range(75, 82):   # Shopping festival
    HIGH_DEMAND_DATES.add(date_str(today + timedelta(days=offset)))

inventory_docs = []
for lid, prop in listing_ids:
    base_price = prop["price"]
    price_floor = prop["priceFloor"]
    price_ceiling = prop["priceCeiling"]

    for i in range(90):
        d = today + timedelta(days=i)
        ds = date_str(d)
        month = d.month
        dow = d.weekday()  # 0=Mon … 6=Sun; Thu=3, Fri=4

        # Price calculation
        mult = SEASON_MULT.get(month, 1.0)
        if dow in (3, 4):        # Thu/Fri weekend premium
            mult *= 1.25
        if ds in HIGH_DEMAND_DATES:
            mult *= 1.40

        raw_price = round(base_price * mult)
        current_price = max(price_floor, min(price_ceiling, raw_price))

        # Booking status — realistic occupancy ~65%
        rng = random.Random(hash((str(lid), ds)))
        roll = rng.random()
        if i < 5:
            status = "booked"            # near-term already booked
        elif roll < 0.30:
            status = "booked"
        elif roll < 0.35:
            status = "blocked"
        else:
            status = "available"

        # Proposals for available days in next 30
        proposed_price = None
        proposal_status = None
        change_pct = None
        reasoning = None
        if status == "available" and i < 30:
            seed_val = (hash((str(lid), ds)) % 100)
            change_pct = 5 if seed_val < 30 else 10 if seed_val < 60 else 15 if seed_val < 80 else -5
            proposed_raw = round(current_price * (1 + change_pct / 100))
            proposed_price = max(price_floor, min(price_ceiling, proposed_raw))
            proposal_status = "pending" if seed_val < 70 else "approved" if seed_val < 85 else "rejected"
            reasoning = f"Demand signal: {'+' if change_pct > 0 else ''}{change_pct}% adjustment based on event calendar and occupancy trend."

        doc = {
            "orgId": org_id,
            "listingId": lid,
            "date": ds,
            "currentPrice": current_price,
            "basePrice": base_price,
            "status": status,
            "minStay": 2 if dow in (3, 4) else 1,
            "maxStay": 365,
            "closedToArrival": False,
            "closedToDeparture": False,
            "proposedPrice": proposed_price,
            "proposalStatus": proposal_status,
            "changePct": change_pct,
            "reasoning": reasoning,
            "createdAt": datetime.utcnow(),
            "updatedAt": datetime.utcnow(),
        }
        inventory_docs.append(doc)

# Batch insert
BATCH = 500
for i in range(0, len(inventory_docs), BATCH):
    db.inventorymasters.insert_many(inventory_docs[i:i+BATCH])
print(f"  ✓ {len(inventory_docs)} inventory rows inserted")

# ─── 4. Reservations ──────────────────────────────────────────────────────────

print("\n[4/6] Seeding Reservations...")

db.reservations.delete_many({})

CHANNELS = ["Airbnb", "Booking.com", "Direct", "Airbnb", "Direct"]
GUEST_NAMES = [
    "James Anderson", "Sophie Chen", "Mohammed Al Rashid", "Emma Williams",
    "Luca Ferrari", "Aisha Patel", "David Kim", "Natalie Brown",
    "Omar Hassan", "Priya Sharma", "Michael Torres", "Yuki Tanaka",
    "Carlos Mendes", "Fatima Al Zaabi", "Robert Johnson",
]

reservation_docs = []
for idx, (lid, prop) in enumerate(listing_ids):
    # 3 past + 2 upcoming reservations per property
    reservations_config = [
        {"offset_in": -30, "nights": 3},
        {"offset_in": -15, "nights": 5},
        {"offset_in": -5,  "nights": 2},
        {"offset_in": 10,  "nights": 4},
        {"offset_in": 25,  "nights": 7},
    ]
    for r_idx, rc in enumerate(reservations_config):
        check_in = today + timedelta(days=rc["offset_in"])
        check_out = check_in + timedelta(days=rc["nights"])
        nightly = prop["price"] * SEASON_MULT.get(check_in.month, 1.0)
        total = round(nightly * rc["nights"])
        guest_name = GUEST_NAMES[(idx * 5 + r_idx) % len(GUEST_NAMES)]
        channel = CHANNELS[(idx + r_idx) % len(CHANNELS)]

        status = "checked_out" if check_out < today else ("checked_in" if check_in <= today else "confirmed")

        reservation_docs.append({
            "orgId": org_id,
            "listingId": lid,
            "hostawayReservationId": f"HW-RES-{1000 + idx * 10 + r_idx}",
            "guestName": guest_name,
            "guestEmail": f"{guest_name.lower().replace(' ', '.')}@example.com",
            "checkIn": date_str(check_in),
            "checkOut": date_str(check_out),
            "nights": rc["nights"],
            "guests": random.randint(1, min(3, prop["personCapacity"])),
            "totalPrice": total,
            "channelName": channel,
            "status": status,
            "createdAt": datetime.utcnow() - timedelta(days=abs(rc["offset_in"]) + 10),
            "updatedAt": datetime.utcnow(),
        })

db.reservations.insert_many(reservation_docs)
print(f"  ✓ {len(reservation_docs)} reservations inserted")

# ─── 5. Market Events ─────────────────────────────────────────────────────────

print("\n[5/6] Seeding MarketEvents...")

db.marketevents.delete_many({})

market_events = [
    {
        "name": "GITEX Technology Week",
        "startDate": date_str(today + timedelta(days=15)),
        "endDate":   date_str(today + timedelta(days=19)),
        "area": "Trade Centre",
        "areas": ["Trade Centre", "Downtown Dubai", "Business Bay"],
        "impactLevel": "high",
        "upliftPct": 40,
        "description": "World's largest tech event at DWTC. Massive delegate influx.",
        "source": "manual",
    },
    {
        "name": "Eid Al Fitr",
        "startDate": date_str(today + timedelta(days=45)),
        "endDate":   date_str(today + timedelta(days=48)),
        "area": "Dubai",
        "areas": ["Dubai Marina", "Palm Jumeirah", "JBR", "Downtown Dubai"],
        "impactLevel": "high",
        "upliftPct": 35,
        "description": "Public holiday driving strong domestic and GCC tourism.",
        "source": "manual",
    },
    {
        "name": "Dubai Shopping Festival",
        "startDate": date_str(today + timedelta(days=75)),
        "endDate":   date_str(today + timedelta(days=81)),
        "area": "Dubai",
        "areas": ["Downtown Dubai", "Dubai Marina", "Business Bay"],
        "impactLevel": "medium",
        "upliftPct": 25,
        "description": "Annual retail mega-event driving significant tourist arrivals.",
        "source": "manual",
    },
    {
        "name": "Abu Dhabi Grand Prix Weekend",
        "startDate": date_str(today + timedelta(days=55)),
        "endDate":   date_str(today + timedelta(days=57)),
        "area": "Dubai",
        "areas": ["Dubai Marina", "JBR", "Palm Jumeirah"],
        "impactLevel": "high",
        "upliftPct": 45,
        "description": "F1 finale draws overflow crowds from Abu Dhabi.",
        "source": "manual",
    },
    {
        "name": "Art Dubai",
        "startDate": date_str(today + timedelta(days=30)),
        "endDate":   date_str(today + timedelta(days=33)),
        "area": "Madinat Jumeirah",
        "areas": ["Downtown Dubai", "Business Bay", "Dubai Marina"],
        "impactLevel": "medium",
        "upliftPct": 20,
        "description": "Leading contemporary art fair in the region.",
        "source": "manual",
    },
    {
        "name": "Dubai Airshow",
        "startDate": date_str(today + timedelta(days=62)),
        "endDate":   date_str(today + timedelta(days=66)),
        "area": "Dubai South",
        "areas": ["Business Bay", "Downtown Dubai"],
        "impactLevel": "medium",
        "upliftPct": 22,
        "description": "Biennial aviation trade show.",
        "source": "manual",
    },
]

event_docs = [{
    **ev,
    "orgId": org_id,
    "listingId": None,
    "isActive": True,
    "createdAt": datetime.utcnow(),
    "updatedAt": datetime.utcnow(),
} for ev in market_events]

db.marketevents.insert_many(event_docs)
print(f"  ✓ {len(event_docs)} market events inserted")

# ─── 6. Pricing Rules ─────────────────────────────────────────────────────────

print("\n[6/6] Seeding PricingRules...")

db.pricingrules.delete_many({})

rule_docs = []
for lid, prop in listing_ids:
    # Ramadan/low-season discount
    rule_docs.append({
        "orgId": org_id,
        "listingId": lid,
        "ruleType": "SEASON",
        "name": "Summer Low Season",
        "enabled": True,
        "priority": 10,
        "startDate": f"{today.year}-06-01",
        "endDate": f"{today.year}-08-31",
        "priceAdjPct": -20,
        "isBlocked": False,
        "closedToArrival": False,
        "closedToDeparture": False,
        "suspendLastMinute": False,
        "suspendGapFill": False,
        "createdAt": datetime.utcnow(),
        "updatedAt": datetime.utcnow(),
    })
    # Peak season premium
    rule_docs.append({
        "orgId": org_id,
        "listingId": lid,
        "ruleType": "SEASON",
        "name": "Peak Winter Season",
        "enabled": True,
        "priority": 20,
        "startDate": f"{today.year}-12-01",
        "endDate": f"{today.year + 1}-01-31",
        "priceAdjPct": 30,
        "minStayOverride": 3,
        "isBlocked": False,
        "closedToArrival": False,
        "closedToDeparture": False,
        "suspendLastMinute": False,
        "suspendGapFill": False,
        "createdAt": datetime.utcnow(),
        "updatedAt": datetime.utcnow(),
    })
    # LOS discount — 7+ nights
    rule_docs.append({
        "orgId": org_id,
        "listingId": lid,
        "ruleType": "LOS_DISCOUNT",
        "name": "Weekly Stay Discount",
        "enabled": True,
        "priority": 5,
        "minNights": 7,
        "priceAdjPct": -10,
        "isBlocked": False,
        "closedToArrival": False,
        "closedToDeparture": False,
        "suspendLastMinute": False,
        "suspendGapFill": False,
        "createdAt": datetime.utcnow(),
        "updatedAt": datetime.utcnow(),
    })

db.pricingrules.insert_many(rule_docs)
print(f"  ✓ {len(rule_docs)} pricing rules inserted ({len(rule_docs)//3} × 3 per property)")

# ─── 7. Benchmark Data ────────────────────────────────────────────────────────

print("\n[7/6] Seeding BenchmarkData...")

db.benchmark_data.delete_many({})

benchmark_docs = []
for lid, prop in listing_ids:
    base = prop["price"]
    benchmark_docs.append({
        "orgId": org_id,
        "listingId": lid,
        "dateFrom": date_str(today),
        "dateTo": date_str(today + timedelta(days=30)),
        "p25Rate": round(base * 0.8),
        "p50Rate": round(base * 1.05),
        "p75Rate": round(base * 1.3),
        "p90Rate": round(base * 1.6),
        "avgWeekday": round(base * 0.95),
        "avgWeekend": round(base * 1.2),
        "yourPrice": base,
        "percentile": 45,
        "verdict": "FAIR",
        "rateTrend": "stable",
        "trendPct": 2,
        "recommendedWeekday": round(base * 0.98),
        "recommendedWeekend": round(base * 1.15),
        "reasoning": f"Market analysis for {prop['area']} shows stable demand. Your property is positioned competitively at the 45th percentile.",
        "comps": [
            {
                "name": f"Luxury {prop['bedroomsNumber']}BR in {prop['area']}",
                "source": "Airbnb",
                "sourceUrl": "https://airbnb.com",
                "rating": 4.8,
                "reviews": 120,
                "avgRate": round(base * 1.1),
                "weekdayRate": round(base * 1.0),
                "weekendRate": round(base * 1.3)
            },
            {
                "name": f"Modern Apartment {prop['area']}",
                "source": "Booking.com",
                "sourceUrl": "https://booking.com",
                "rating": 4.5,
                "reviews": 85,
                "avgRate": round(base * 0.9),
                "weekdayRate": round(base * 0.85),
                "weekendRate": round(base * 1.1)
            }
        ],
        "createdAt": datetime.utcnow(),
        "updatedAt": datetime.utcnow(),
    })

db.benchmark_data.insert_many(benchmark_docs)
print(f"  ✓ {len(benchmark_docs)} benchmark entries inserted")

# ─── Done ─────────────────────────────────────────────────────────────────────

print("\n" + "═" * 55)
print("  ✅  Seed complete!")
print("═" * 55)
print(f"  DB          : {DB_NAME}")
print(f"  Login email : admin@priceos.ae")
print(f"  Password    : Admin@123456")
print(f"  Org ID      : {org_id}")
print(f"  Properties  : {len(listing_ids)}")
print(f"  Inventory   : {len(inventory_docs)} rows (90 days × 5 props)")
print(f"  Reservations: {len(reservation_docs)}")
print(f"  Events      : {len(event_docs)}")
print(f"  Rules       : {len(rule_docs)}")
print("═" * 55)

client.close()
