/**
 * Team notification fan-out.
 *
 * A single `notifyTeam()` call delivers to every channel the team has
 * configured via env vars. Channels are completely optional and independent —
 * configure one, several, or none. Nothing here touches Hostaway or guests;
 * these are internal alerts to the host team only.
 *
 * Supported channels:
 *   • Slack   — set SLACK_WEBHOOK_URL (Slack Incoming Webhook; zero approval).
 *   • WhatsApp— set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_WHATSAPP_FROM
 *               and NOTIFY_WHATSAPP_TO (numbers in "whatsapp:+E164" form).
 *   • SMS     — set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_SMS_FROM
 *               and NOTIFY_SMS_TO (E.164 numbers).
 *
 * The team picks its preferred channel purely through configuration — no code
 * change required to switch between Slack and WhatsApp.
 */

import { getEnv } from "@/lib/env";

export type NotifyUrgency = "low" | "medium" | "high" | "critical";

export interface NotifyInput {
    title: string;
    body: string;
    urgency?: NotifyUrgency;
    /** Optional deep link back into the dashboard (e.g. the inbox thread). */
    link?: string;
}

export interface NotifyResult {
    delivered: string[];
    failed: { channel: string; error: string }[];
    skipped: boolean; // true when no channel is configured
}

const URGENCY_EMOJI: Record<NotifyUrgency, string> = {
    low: "🔵",
    medium: "🟡",
    high: "🟠",
    critical: "🔴",
};

function plainText(input: NotifyInput): string {
    const emoji = URGENCY_EMOJI[input.urgency ?? "medium"];
    const lines = [`${emoji} ${input.title}`, "", input.body];
    if (input.link) lines.push("", input.link);
    return lines.join("\n");
}

async function sendSlack(input: NotifyInput): Promise<void> {
    const url = getEnv("SLACK_WEBHOOK_URL");
    if (!url) throw new Error("not configured");
    const emoji = URGENCY_EMOJI[input.urgency ?? "medium"];
    const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            text: `${emoji} *${input.title}*`,
            blocks: [
                {
                    type: "section",
                    text: { type: "mrkdwn", text: `${emoji} *${input.title}*\n${input.body}` },
                },
                ...(input.link
                    ? [
                          {
                              type: "actions",
                              elements: [
                                  {
                                      type: "button",
                                      text: { type: "plain_text", text: "Open in PriceOS" },
                                      url: input.link,
                                  },
                              ],
                          },
                      ]
                    : []),
            ],
        }),
    });
    if (!res.ok) throw new Error(`Slack ${res.status}: ${(await res.text().catch(() => "")).slice(0, 140)}`);
}

async function sendTwilio(input: NotifyInput, kind: "whatsapp" | "sms"): Promise<void> {
    const sid = getEnv("TWILIO_ACCOUNT_SID");
    const token = getEnv("TWILIO_AUTH_TOKEN");
    const from = kind === "whatsapp" ? getEnv("TWILIO_WHATSAPP_FROM") : getEnv("TWILIO_SMS_FROM");
    const to = kind === "whatsapp" ? getEnv("NOTIFY_WHATSAPP_TO") : getEnv("NOTIFY_SMS_TO");
    if (!sid || !token || !from || !to) throw new Error("not configured");

    // Allow a comma-separated list of recipients.
    const recipients = to.split(",").map((s) => s.trim()).filter(Boolean);
    const auth = Buffer.from(`${sid}:${token}`).toString("base64");

    for (const recipient of recipients) {
        const params = new URLSearchParams({ From: from, To: recipient, Body: plainText(input) });
        const res = await fetch(
            `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`,
            {
                method: "POST",
                headers: {
                    Authorization: `Basic ${auth}`,
                    "Content-Type": "application/x-www-form-urlencoded",
                },
                body: params.toString(),
            },
        );
        if (!res.ok) {
            throw new Error(`Twilio ${res.status}: ${(await res.text().catch(() => "")).slice(0, 140)}`);
        }
    }
}

/**
 * Deliver an alert to every configured team channel. Best-effort: a failure on
 * one channel never blocks the others, and an entirely unconfigured setup
 * resolves cleanly with `skipped: true` so callers never hard-fail on alerts.
 */
export async function notifyTeam(input: NotifyInput): Promise<NotifyResult> {
    const channels: { name: string; configured: boolean; send: () => Promise<void> }[] = [
        { name: "slack", configured: !!getEnv("SLACK_WEBHOOK_URL"), send: () => sendSlack(input) },
        {
            name: "whatsapp",
            configured: !!getEnv("TWILIO_ACCOUNT_SID") && !!getEnv("NOTIFY_WHATSAPP_TO"),
            send: () => sendTwilio(input, "whatsapp"),
        },
        {
            name: "sms",
            configured: !!getEnv("TWILIO_ACCOUNT_SID") && !!getEnv("NOTIFY_SMS_TO"),
            send: () => sendTwilio(input, "sms"),
        },
    ];

    const active = channels.filter((c) => c.configured);
    if (active.length === 0) {
        return { delivered: [], failed: [], skipped: true };
    }

    const delivered: string[] = [];
    const failed: { channel: string; error: string }[] = [];
    await Promise.all(
        active.map(async (c) => {
            try {
                await c.send();
                delivered.push(c.name);
            } catch (err) {
                failed.push({ channel: c.name, error: (err as Error).message });
                console.error(`[notify:${c.name}]`, (err as Error).message);
            }
        }),
    );

    return { delivered, failed, skipped: false };
}

/** True when at least one team channel is configured. */
export function isNotifyConfigured(): boolean {
    return (
        !!getEnv("SLACK_WEBHOOK_URL") ||
        (!!getEnv("TWILIO_ACCOUNT_SID") && (!!getEnv("NOTIFY_WHATSAPP_TO") || !!getEnv("NOTIFY_SMS_TO")))
    );
}
