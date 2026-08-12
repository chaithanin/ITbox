/**
 * Notification delivery.
 *  - In-app: Notification rows (implemented everywhere).
 *  - LINE Messaging API: broadcast push when LINE_CHANNEL_ACCESS_TOKEN is set.
 *  - Email/SMTP: NOT IMPLEMENTED (no SMTP client dependency); documented in README.
 *
 * Never include secret values in any notification body.
 */

export async function pushLineMessage(text: string): Promise<boolean> {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!token) return false;
  try {
    const res = await fetch("https://api.line.me/v2/bot/message/broadcast", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        messages: [{ type: "text", text: text.slice(0, 4900) }],
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}
