# PriceOS — How the AI Works
### A Plain-English Guide for Property Managers & Clients

> **Who is this document for?**
> This document is written for anyone who uses PriceOS — whether you are a property manager, a business owner, or someone who has never written a line of code. No technical knowledge is required.

---

## 📌 The Big Picture (Start Here)

Think of PriceOS as a **team of specialist AI assistants** working behind the scenes in your business — 24 hours a day, 7 days a week.

Each assistant (called an **Agent**) has one specific job. Just like in a real company:

- One person handles **pricing decisions**.
- One person handles **guest communication**.
- One person watches the **market and competitors**.
- One person acts as a **safety officer** making sure nothing risky happens.

These agents **never conflict with each other** because they each only look at the specific data they need — nothing more, nothing less.

---

## 🗂️ Where Does the Data Come From?

Before understanding the agents, it helps to know where the data lives.

### Your Single Source of Truth

When you connect PriceOS to your Property Management System (Hostaway), all your property data flows into a **central secure database**. Think of it like a filing cabinet with labelled drawers:

| Drawer (Data Table) | What's Inside |
|---|---|
| 📋 **Properties Table** | Your villa names, bedroom counts, floor prices, rules |
| 📅 **Calendar Table** | Night-by-night availability and current prices |
| 📦 **Reservations Table** | All bookings — who, when, how long, how much |
| 💬 **Conversations Table** | All messages between guests and hosts |
| 💰 **Financials Table** | Revenue, payouts, expenses per property/month |
| 📊 **Proposals Table** | AI-suggested price changes awaiting your approval |
| 💡 **Insights Table** | AI observations — trends, opportunities, alerts |

> **Key rule:** Each AI Agent is only allowed to open specific drawers. A Pricing Agent cannot accidentally read guest messages. A Guest Agent cannot touch your pricing data. This keeps your data safe and your agents focused.

---

## 🤖 The Agents: Who They Are & What They Do

---

### 1. 🧠 Pricing Agent
**Job title:** *Revenue Manager*

**In plain English:**
This is the agent that wakes up every day and asks: *"Should I change the price for any of our properties tonight?"*

It analyses your calendar, checks how quickly bookings are filling up, and compares it to what normally happens this time of year in your market (e.g., Dubai in December vs. July).

**What data drawers it opens:**
- ✅ Properties Table — to know the floor price and rules for each villa
- ✅ Calendar Table — to see which nights are booked, which are empty
- ✅ Market Templates — to understand what's "normal" for the season

**What it produces:**
A list of **Proposals** — suggested price changes, shown to you in the *Pricing → Proposals* tab.

**Example of what it might say:**
> *"It's 5 days before December 20th in Dubai and only 3 nights are still open. Comparable properties are 40% more expensive. I suggest raising the price by +18% for those nights."*

**Who approves it?**
You do. The agent shows you the suggestion and explains the reason. You can approve, reject, or modify the price before it goes live on Airbnb/Booking.com.

---

### 2. 💬 Guest Agent (Aria)
**Job title:** *Guest Relations Manager*

**In plain English:**
This agent reads every message that comes in from guests and drafts a reply for you. It understands the context of the booking — when they're arriving, what they've booked, any special requests — and writes replies that sound natural and professional.

**What data drawers it opens:**
- ✅ Conversations Table — the actual message thread from Hostaway
- ✅ Reservations Table — booking details (arrival, departure, number of guests)

**What it produces:**
A **suggested reply** shown to you in the *Guest Inbox* section. You can send it as-is, edit it, or ignore it.

**Example of what it might say:**
*Guest message:* "Hi, we'll be arriving around 8pm, is that okay?"
*Aria's suggested reply:* "Hi Sarah! Of course — late check-ins are no problem at all. I'll make sure the keybox code is active from 7pm. Looking forward to welcoming you! 😊"

**Who approves it?**
You do. No message is ever sent automatically unless you explicitly enable that in Settings.

---

### 3. 📊 Benchmark Agent
**Job title:** *Market Research Analyst*

**In plain English:**
This agent is your eyes on the market. It looks at what's happening across your portfolio and the wider market — booking pace, lead times, comparable competitor rates — and writes **Insights cards** that appear in your *Insights* section.

**What data drawers it opens:**
- ✅ Properties Table — your listing details
- ✅ Calendar Table — your occupancy and open nights
- ✅ Reservations Table — historical booking patterns

**What it produces:**
**Insight cards** with a title, severity level (High/Medium/Low), and a recommended action.

**Example of an Insight it might generate:**
> **🔴 High — Booking Pace Alert**
> "Your 3-bedroom villas in Marina are booking 60% faster this week compared to last year. You have 12 open nights that competitors have already sold. Consider a +12% rate increase for Feb 14–28."

**Who approves it?**
You. When you approve an Insight, it tells the Pricing Agent to generate Proposals for those specific dates.

---

### 4. 🛡️ Guardrail Agent
**Job title:** *Risk & Compliance Officer*

**In plain English:**
This agent doesn't generate ideas — it **checks** every price change before it goes live and asks one question: *"Is this safe?"*

Every market has rules embedded in it:
- Maximum price change per day: e.g., 15% for Dubai
- Auto-approve only if change is less than 5%
- Never go below the absolute floor price set by the owner

The Guardrail Agent enforces these rules automatically.

**What data drawers it opens:**
- ✅ Properties Table — the floor/ceiling rules set for each listing
- ✅ Proposals Table — the pending price changes to review

**What it produces:**
It either **approves** the proposal automatically (if it's within safe limits) or flags it for **human review**.

**Example of how it works:**
1. Pricing Agent suggests: +3% for Villa A on Dec 15. → Guardrail says: ✅ Auto-approved (under 5%)
2. Pricing Agent suggests: +22% for Villa B for New Year's Eve. → Guardrail says: 🔴 Needs human review (over 15%)

You will never be surprised by a 50% price jump without knowing about it first.

---

### 5. 💰 Finance Module
**Job title:** *Accountant / CFO Dashboard*

**In plain English:**
This module watches money. It tracks revenue per property each month, calculates owner payouts (if you manage multiple owners), records expenses, and shows you KPI metrics like RevPAR, ADR, and Occupancy Rate on your dashboard.

**What data drawers it opens:**
- ✅ Financials Table — revenue and expense records
- ✅ Reservations Table — booking values
- ✅ Properties Table — property metadata

**What it produces:**
The **Finance section** of the dashboard — charts, owner statement cards, and revenue summaries.

---

## 🔄 How the Agents Talk to Each Other

The agents don't talk directly. They communicate through the shared database — like leaving notes in those filing cabinet drawers.

Here is a step-by-step example of a complete workflow:

```
Day 1, 6:00am — Daily Pipeline Runs

1. BENCHMARK AGENT runs first.
   → Opens: Calendar Table, Reservations Table
   → Writes to: Insights Table
   → "I detected low booking pace for Feb 14-20. Flagged as Medium severity."

2. PRICING AGENT reads the Insights Table.
   → Opens: Insights Table, Calendar Table, Properties Table
   → Writes to: Proposals Table
   → "Based on the Benchmark insight, I'm proposing -8% for Feb 14-20 to stimulate bookings."

3. GUARDRAIL AGENT reviews the Proposals Table.
   → Opens: Proposals Table, Properties Table (rules)
   → Result: "The -8% change is within the 15% limit. Flagging as Medium risk — requires human review."

4. You log in at 9:00am.
   → You see 1 Insight and 7 Proposals waiting.
   → You approve 6, reject 1 (your own judgment call).
   → Approved proposals are pushed to Hostaway.
```

---

## 📍 How Each Section of the App Connects to the Agents

| App Section | Powered By | What You See |
|---|---|---|
| **Dashboard** | Finance Module + Benchmark Agent | Revenue KPIs, occupancy rate, top-performing properties |
| **Pricing → Proposals** | Pricing Agent + Guardrail Agent | Night-by-night price change suggestions with risk labels |
| **Pricing → Rules Studio** | Guardrail Agent config | Your safety settings — floors, ceilings, max daily change |
| **Insights** | Benchmark Agent | Strategic observations — "Consider raising rates for this event" |
| **Guest Inbox** | Guest Agent (Aria) | Message threads with AI-drafted replies |
| **Market Intelligence** | Benchmark Agent | Competitor positioning and market demand signals |
| **Calendar** | Calendar Table (raw data) | Visual availability + booking status across properties |
| **Reservations** | Reservations Table (raw data) | All bookings, guest details, stay length |
| **Finance** | Finance Module | Revenue, expenses, owner statements |
| **Settings → Connections** | All Agents (config) | Hostaway API link, market template selection |
| **Settings → Automation** | Guardrail Agent config | Toggle for auto-push, daily pipeline schedule |

---

## 🛡️ Data Privacy & Security

### What data stays private?

All your property data, guest information, and financial records stay in **your organisation's secure database**. Nothing is shared with other PriceOS customers.

### Can agents read each other's data?

**No.** This is enforced at the database level, not just by policy. If the Guest Agent tries to read pricing data, the system throws a security error before the query even runs.

### Who can see what?

| Role | Access Level |
|---|---|
| **Owner** | Full access to all sections |
| **Admin** | Can approve proposals and manage settings |
| **Viewer** | Can see dashboards and reports — cannot approve or modify |

---

## 🎯 Summary: The Three Promises of PriceOS

### 1. 🧠 Intelligence without overwhelm
The agents do the hard analysis so you don't have to read 12 market reports every morning. You get 3-5 key actions per day.

### 2. ✅ You are always in control
No price change, no reply, no strategy is applied without your explicit approval. The agents advise — you decide.

### 3. 🔒 Safe by design
Every AI suggestion passes through a Guardrail layer. Extreme changes are always flagged for human review. Your floor prices and ceiling prices are never violated.

---

## ❓ Frequently Asked Questions

**Q: What happens if I don't log in for a week?**
> The agents continue running and queue up proposals. When you return, you'll see everything that needs your review. Nothing is pushed live without your approval (unless you enable Auto-Push in Settings).

**Q: Can the AI send guest messages automatically?**
> Only if you explicitly turn on "Auto-Reply" in Settings. By default, Aria always drafts the message and waits for your approval before sending.

**Q: What if the AI gives wrong advice?**
> You can always reject a proposal with one click. The Guardrail Agent also prevents any change that exceeds your safety thresholds. Over time, the system learns from your rejections and improves.

**Q: How much of Hostaway data is fetched?**
> PriceOS uses a "lazy" approach — it only fetches data when an agent needs it. During onboarding, only property names are fetched. Calendar and reservation data is pulled only after you activate specific properties.

**Q: Is my Hostaway API key safe?**
> Yes. It is stored encrypted in the database and is never exposed in the frontend or included in log files.

---

*Document version: 1.0 · April 2026 · PriceOS Platform*
*For any questions, contact your PriceOS account manager.*
