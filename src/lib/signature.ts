/**
 * Email signature renderer — pure, dependency-free so it runs identically on the
 * server (save/download) and in the browser (live preview). Produces Outlook-safe
 * HTML: nested tables, inline CSS, fixed widths, web-safe fonts, no JS/external
 * CSS/SVG. Every dynamic value is HTML-escaped and every URL validated (XSS-safe).
 *
 * Layout ("Chaithanin Executive"): a warm beige band with the company monogram on
 * the left and the person's name/title + a divider + icon contact rows on the
 * right, followed by a full-width row of subsidiary buttons underneath.
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
  primaryColor: string; // brand brown — monogram, name, icons
  secondaryColor: string; // muted tone — job title
  fontFamily: string;
  fontSize: number;
  dividerStyle: string; // solid | dashed | none
  bgColor?: string | null; // band background (beige)
  dividerColor?: string | null; // hairline under the name
}

/** Corporate defaults prefilled on every new signature. */
export const DEFAULT_WEBSITE = "https://chaithanin.com/";
export const DEFAULT_ADDRESS =
  "193, 442 M.10 Nongprue, Pattaya City, Bang Lamung District, Chon Buri 20150";

/** Corporate subsidiary buttons shown by default when a user has none of their own. */
export const DEFAULT_COMPANY_LINKS: CompanyLink[] = [
  { name: "Marina Golden Bay Victoria Co.,Ltd.", url: "https://chaithanin.com/properties/marina-golden-bay/" },
  { name: "Marina Golden Bay Elya Co., Ltd.", url: "https://chaithanin.com/properties/marina-golden-bay/" },
  { name: "Harmonia City Garden Co.,Ltd.", url: "https://chaithanin.com/properties/harmonia-city-garden/" },
  { name: "Global Top Group Co.,Ltd.", url: "https://chaithanin.com/" },
];

export const DEFAULT_TEMPLATE: TemplateConfig = {
  companyName: "Chaithanin Co.,Ltd.",
  logoUrl: "",
  primaryColor: "#6E4030",
  secondaryColor: "#8B7B6E",
  fontFamily: "Arial, Helvetica, sans-serif",
  fontSize: 13,
  dividerStyle: "solid",
  bgColor: "#EDE5DD",
  dividerColor: "#CBB9A9",
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

/** Strip a leading "Address:" label a user may have pasted into the field. */
function cleanAddress(address: string): string {
  return address.replace(/^\s*address\s*:\s*/i, "").trim();
}

function mapsHref(address: string): string {
  return "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(cleanAddress(address));
}

/** Drop a trailing "Co.,Ltd." / "Co., Ltd." so a subsidiary button label stays short. */
function shortLabel(name: string): string {
  return name.replace(/\s*co\.?\,?\s*ltd\.?\s*$/i, "").trim() || name;
}

// Graduated brown shades for the subsidiary buttons (cycled when there are more).
const BUTTON_SHADES = ["#6e4030", "#80513d", "#966b54", "#ad8972"];

function isEmail(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());
}

// ---------- renderer ----------
// "Chaithanin Executive" — a white rounded card with a brown accent bar, the
// CHTNN monogram (or a logo image) + company on the left, name/title + text-
// labelled contact rows on the right, and a graduated "Our Project" button row
// underneath. Outlook-safe: nested tables, inline CSS, web-safe fonts, solid
// colors, plain-text labels (no SVG, no emoji glyphs).

export function renderSignatureHtml(data: SignatureData, cfg: TemplateConfig): string {
  const brown = escapeHtml(cfg.primaryColor || "#6e4030");
  const font = cfg.fontFamily || "Arial, Helvetica, sans-serif";
  const serif = "Georgia, 'Times New Roman', serif";
  const logo = safeUrl(data.logoUrl) ?? safeUrl(cfg.logoUrl);
  const companyName = (cfg.companyName ?? "Chaithanin Co.,Ltd.").trim();

  // Warm design tokens (shades of the brand brown).
  const nameColor = "#5d3528";
  const titleColor = "#a18370";
  const companyColor = "#8b6b5a";
  const textColor = "#5f524b";
  const cardBorder = "#e7ddd4";
  const innerLine = "#e5d9cf";
  const accentLine = "#c4a58f";

  // ----- contact rows (text labels: Tel / E-mail / Website / Address) -----
  const contactRow = (label: string, valueHtml: string) =>
    `<tr>` +
    `<td valign="top" style="padding:2px 10px 2px 0;font-family:${font};font-size:11px;font-weight:bold;line-height:18px;color:${brown};white-space:nowrap;">${escapeHtml(label)}</td>` +
    `<td valign="top" style="padding:2px 0;font-family:${font};font-size:11px;line-height:18px;color:${textColor};">${valueHtml}</td>` +
    `</tr>`;

  const rows: string[] = [];

  const phones: string[] = [];
  if (data.mobilePhone)
    phones.push(`<a href="${escapeHtml(telHref(data.mobilePhone))}" style="color:${textColor};text-decoration:none;">${escapeHtml(data.mobilePhone)}</a>`);
  if (data.officePhone) {
    const ext = data.extension ? ` ${escapeHtml("ext. " + data.extension)}` : "";
    phones.push(`<a href="${escapeHtml(telHref(data.officePhone))}" style="color:${textColor};text-decoration:none;">${escapeHtml(data.officePhone)}</a>${ext}`);
  }
  if (phones.length) rows.push(contactRow("Tel", phones.join(" / ")));

  if (data.email && isEmail(data.email))
    rows.push(contactRow("E-mail", `<a href="mailto:${escapeHtml(data.email)}" style="color:${textColor};text-decoration:none;">${escapeHtml(data.email)}</a>`));

  const web = safeUrl(data.website);
  if (web)
    rows.push(contactRow("Website", `<a href="${escapeHtml(web)}" style="color:${textColor};text-decoration:none;">${escapeHtml(data.website!.replace(/^https?:\/\//i, "").replace(/\/$/, ""))}</a>`));

  if (data.address) {
    const addr = cleanAddress(data.address);
    rows.push(contactRow("Address", `<a href="${escapeHtml(mapsHref(data.address))}" style="color:${textColor};text-decoration:none;">${escapeHtml(addr)}</a>`));
  }

  // ----- name / title -----
  const nameHtml = `<tr><td style="font-family:${font};font-size:20px;font-weight:bold;line-height:25px;letter-spacing:.2px;color:${nameColor};">${escapeHtml(data.fullName)}</td></tr>`;
  const titleText = [data.position, data.department].filter(Boolean).join("  ·  ");
  const titleHtml = titleText
    ? `<tr><td style="padding-top:4px;font-family:${font};font-size:11px;font-weight:bold;line-height:16px;letter-spacing:2px;text-transform:uppercase;color:${titleColor};">${escapeHtml(titleText)}</td></tr>`
    : "";
  const dividerHtml =
    cfg.dividerStyle === "none"
      ? `<tr><td style="height:10px;font-size:0;line-height:0;">&nbsp;</td></tr>`
      : `<tr><td style="padding:13px 0 8px;"><div style="border-top:1px ${cfg.dividerStyle === "dashed" ? "dashed" : "solid"} ${innerLine};font-size:0;line-height:0;">&nbsp;</div></td></tr>`;

  // ----- left logo column -----
  const logoBlock = logo
    ? `<div style="text-align:center;"><img src="${escapeHtml(logo)}" alt="${escapeHtml(companyName)}" width="150" style="display:block;border:0;width:150px;height:auto;margin:0 auto;" /></div>`
    : `<div style="font-family:${serif};color:${brown};font-size:38px;font-weight:bold;line-height:36px;letter-spacing:3px;white-space:nowrap;">CH<span style="font-size:56px;line-height:40px;letter-spacing:0;">T</span>NN</div>`;
  const leftCol =
    `<td width="190" valign="middle" style="width:190px;padding:0 22px 0 4px;text-align:center;border-right:1px solid ${innerLine};">` +
    logoBlock +
    `<div style="padding-top:9px;font-family:${serif};color:${companyColor};font-size:12px;line-height:16px;letter-spacing:.3px;">${escapeHtml(companyName)}</div>` +
    `<div style="margin:13px auto 0;width:42px;border-top:2px solid ${accentLine};font-size:0;line-height:0;">&nbsp;</div>` +
    `</td>`;

  // ----- subsidiary buttons ("Our Project") -----
  const links = (data.companyLinks ?? [])
    .map((l) => ({ name: (l.name ?? "").trim(), url: safeUrl(l.url) }))
    .filter((l) => l.name);

  const buttonCell = (l: { name: string; url: string | null }, i: number, n: number) => {
    const shade = BUTTON_SHADES[i % BUTTON_SHADES.length];
    const w = Math.round(100 / n);
    const label = escapeHtml(shortLabel(l.name));
    const style = `display:block;padding:8px 5px;color:#ffffff;font-family:${serif};font-size:10px;line-height:13px;font-weight:bold;text-decoration:none;text-align:center;`;
    const inner = l.url
      ? `<a href="${escapeHtml(l.url)}" style="${style}">${label}</a>`
      : `<span style="${style}">${label}</span>`;
    return `<td width="${w}%" valign="middle" style="background-color:${shade};border-radius:5px;text-align:center;">${inner}</td>`;
  };

  const buttonsRow = links.length
    ? `<tr><td colspan="2" style="padding-top:21px;">` +
      `<div style="font-family:${font};font-size:10px;font-weight:bold;line-height:14px;letter-spacing:1.5px;color:${titleColor};text-align:center;text-transform:uppercase;">Our Project</div>` +
      `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-top:9px;border-collapse:separate;border-spacing:4px 0;"><tr>` +
      links.map((l, i) => buttonCell(l, i, links.length)).join("") +
      `</tr></table></td></tr>`
    : "";

  // ----- assemble -----
  return (
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="640" style="width:640px;max-width:100%;border-collapse:separate;border-spacing:0;background-color:#ffffff;font-family:${font};color:#4c4039;border:1px solid ${cardBorder};border-radius:14px;overflow:hidden;">` +
    `<tr>` +
    `<td width="8" style="width:8px;background-color:${brown};font-size:0;line-height:0;">&nbsp;</td>` +
    `<td style="padding:24px 24px 20px 22px;">` +
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;">` +
    `<tr>` +
    leftCol +
    `<td valign="middle" style="padding:0 0 0 24px;">` +
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;">` +
    nameHtml +
    titleHtml +
    dividerHtml +
    `<tr><td><table role="presentation" cellpadding="0" cellspacing="0" border="0">${rows.join("")}</table></td></tr>` +
    `</table></td></tr>` +
    buttonsRow +
    `</table>` +
    `</td></tr></table>`
  );
}
