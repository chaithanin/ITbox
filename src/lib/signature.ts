/**
 * Email signature renderer — pure, dependency-free so it runs identically on the
 * server (save/download) and in the browser (live preview). Produces Outlook-safe
 * HTML: nested tables, inline CSS, fixed widths, web-safe fonts, no JS/external
 * CSS. Every dynamic value is HTML-escaped and every URL validated (XSS-safe).
 */

export interface CompanyLink {
  name: string;
  url: string;
  icon?: string;
}

export interface SignatureData {
  fullName: string;
  position?: string | null;
  department?: string | null;
  mobilePhone?: string | null;
  officePhone?: string | null;
  extension?: string | null;
  email?: string | null;
  website?: string | null;
  address?: string | null;
  logoUrl?: string | null;
  companyLinks?: CompanyLink[];
}

export interface TemplateConfig {
  companyName?: string | null;
  logoUrl?: string | null;
  primaryColor: string;
  secondaryColor: string;
  fontFamily: string;
  fontSize: number;
  dividerStyle: string; // solid | dashed | none
}

export const DEFAULT_TEMPLATE: TemplateConfig = {
  companyName: "",
  logoUrl: "",
  primaryColor: "#24386F",
  secondaryColor: "#6b7280",
  fontFamily: "Arial, Helvetica, sans-serif",
  fontSize: 13,
  dividerStyle: "solid",
};

// ---------- safety helpers ----------

export function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Accept only http(s) URLs; normalize bare domains to https://. Reject the rest. */
export function safeUrl(raw?: string | null): string | null {
  if (!raw) return null;
  let u = raw.trim();
  if (!u) return null;
  if (/^javascript:|^data:|^vbscript:/i.test(u)) return null;
  if (!/^https?:\/\//i.test(u)) {
    if (/^[\w.-]+\.[a-z]{2,}([/?#].*)?$/i.test(u)) u = "https://" + u;
    else return null;
  }
  try {
    const parsed = new URL(u);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

export function isValidUrl(raw: string): boolean {
  return safeUrl(raw) !== null;
}

/** tel: link — keep digits and a leading +. */
function telHref(phone: string): string {
  const cleaned = phone.replace(/[^\d+]/g, "");
  return "tel:" + cleaned;
}

function mapsHref(address: string): string {
  return "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(address);
}

function isEmail(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());
}

// ---------- renderer ----------

/**
 * "Executive Classic": logo + company on the left, contact block on the right,
 * a horizontal divider, then a row of company link buttons underneath.
 */
export function renderSignatureHtml(data: SignatureData, cfg: TemplateConfig): string {
  const primary = escapeHtml(cfg.primaryColor || "#24386F");
  const secondary = escapeHtml(cfg.secondaryColor || "#6b7280");
  const font = cfg.fontFamily || "Arial, Helvetica, sans-serif";
  const size = Math.max(9, Math.min(cfg.fontSize || 13, 20));
  const small = size - 1;
  const logo = safeUrl(data.logoUrl) ?? safeUrl(cfg.logoUrl);
  const companyName = (cfg.companyName ?? "").trim();

  const label = (text: string) =>
    `<span style="color:${secondary};font-family:${font};font-size:${small}px;">${escapeHtml(text)}</span>`;

  const contactRow = (labelText: string, valueHtml: string) =>
    `<tr><td style="padding:1px 0;font-family:${font};font-size:${small}px;line-height:1.5;">` +
    `${label(labelText)}&nbsp;${valueHtml}</td></tr>`;

  const rows: string[] = [];

  if (data.mobilePhone) {
    rows.push(
      contactRow(
        "Mobile:",
        `<a href="${escapeHtml(telHref(data.mobilePhone))}" style="color:#1f2937;text-decoration:none;">${escapeHtml(data.mobilePhone)}</a>`
      )
    );
  }
  if (data.officePhone) {
    const ext = data.extension ? ` ${escapeHtml("ext. " + data.extension)}` : "";
    rows.push(
      contactRow(
        "Office:",
        `<a href="${escapeHtml(telHref(data.officePhone))}" style="color:#1f2937;text-decoration:none;">${escapeHtml(data.officePhone)}</a>${ext}`
      )
    );
  }
  if (data.email && isEmail(data.email)) {
    rows.push(
      contactRow(
        "Email:",
        `<a href="mailto:${escapeHtml(data.email)}" style="color:${primary};text-decoration:none;">${escapeHtml(data.email)}</a>`
      )
    );
  }
  const web = safeUrl(data.website);
  if (web) {
    rows.push(
      contactRow(
        "Web:",
        `<a href="${escapeHtml(web)}" style="color:${primary};text-decoration:none;">${escapeHtml(data.website!.replace(/^https?:\/\//i, ""))}</a>`
      )
    );
  }
  if (data.address) {
    rows.push(
      contactRow(
        "Address:",
        `<a href="${escapeHtml(mapsHref(data.address))}" style="color:#1f2937;text-decoration:none;">${escapeHtml(data.address)}</a>`
      )
    );
  }

  const divider =
    cfg.dividerStyle === "none"
      ? ""
      : `<tr><td style="padding:6px 0;"><table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"><tr><td style="border-top:1px ${cfg.dividerStyle === "dashed" ? "dashed" : "solid"} ${primary};font-size:0;line-height:0;">&nbsp;</td></tr></table></td></tr>`;

  const links = (data.companyLinks ?? [])
    .map((l) => ({ name: (l.name ?? "").trim(), url: safeUrl(l.url) }))
    .filter((l) => l.name && l.url);

  const linksHtml = links.length
    ? `<tr><td style="padding-top:10px;">` +
      `<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>` +
      links
        .map(
          (l) =>
            `<td style="padding:0 6px 0 0;"><a href="${escapeHtml(l.url!)}" style="display:inline-block;padding:5px 10px;background-color:${primary};color:#ffffff;font-family:${font};font-size:${small - 1}px;text-decoration:none;border-radius:3px;">${escapeHtml(l.name)}</a></td>`
        )
        .join("") +
      `</tr></table></td></tr>`
    : "";

  const logoCell = logo
    ? `<img src="${escapeHtml(logo)}" alt="${escapeHtml(companyName || "Company logo")}" width="96" style="display:block;border:0;width:96px;height:auto;" />`
    : companyName
      ? `<span style="font-family:${font};font-size:${size + 3}px;font-weight:bold;color:${primary};">${escapeHtml(companyName)}</span>`
      : "";

  const leftCol =
    logoCell || companyName
      ? `<td valign="top" style="padding:0 16px 0 0;border-right:1px solid #e5e7eb;">` +
        `<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td style="text-align:center;">${logoCell}</td></tr>` +
        (logo && companyName
          ? `<tr><td style="text-align:center;padding-top:6px;font-family:${font};font-size:${small}px;font-weight:bold;color:${primary};">${escapeHtml(companyName)}</td></tr>`
          : "") +
        `</table></td>`
      : "";

  return (
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;font-family:${font};">` +
    `<tr>` +
    leftCol +
    `<td valign="top" style="padding:0 0 0 ${leftCol ? "16" : "0"}px;">` +
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0">` +
    `<tr><td style="font-family:${font};font-size:${size + 3}px;font-weight:bold;color:${primary};padding-bottom:1px;">${escapeHtml(data.fullName)}</td></tr>` +
    (data.position
      ? `<tr><td style="font-family:${font};font-size:${small}px;color:${secondary};padding-bottom:1px;">${escapeHtml(data.position)}${data.department ? " · " + escapeHtml(data.department) : ""}</td></tr>`
      : "") +
    divider +
    rows.join("") +
    linksHtml +
    `</table></td></tr></table>`
  );
}
