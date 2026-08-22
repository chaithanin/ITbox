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

function mapsHref(address: string): string {
  return "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(address);
}

function isEmail(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(n, hi));
}

// Text-presentation glyphs (VS-16 -> VS-15 requested where relevant) so mail
// clients render them monochrome and honor our brown color, no external images.
const ICON = {
  phone: "☎︎", // ☎
  email: "✉︎", // ✉
  web: "🌐︎", // 🌐 (text style)
  pin: "📍︎", // 📍 (text style)
};

// ---------- renderer ----------

export function renderSignatureHtml(data: SignatureData, cfg: TemplateConfig): string {
  const brown = escapeHtml(cfg.primaryColor || "#6E4030");
  const titleColor = escapeHtml(cfg.secondaryColor || "#8B7B6E");
  const bg = escapeHtml(cfg.bgColor || "#EDE5DD");
  const line = escapeHtml(cfg.dividerColor || "#CBB9A9");
  const textColor = "#5A4A40";
  const font = cfg.fontFamily || "Arial, Helvetica, sans-serif";
  const serif = "Georgia, 'Times New Roman', serif";
  const size = clamp(cfg.fontSize || 13, 9, 20);
  const small = size - 2;
  const logo = safeUrl(data.logoUrl) ?? safeUrl(cfg.logoUrl);
  const companyName = (cfg.companyName ?? "Chaithanin Co.,Ltd.").trim();

  // ----- contact rows -----
  const iconCell = (glyph: string) =>
    `<td width="20" valign="top" style="padding:3px 8px 3px 0;font-family:${font};font-size:${size}px;line-height:1.4;color:${brown};">${glyph}</td>`;
  const textCell = (html: string) =>
    `<td valign="top" style="padding:3px 0;font-family:${font};font-size:${small}px;line-height:1.4;color:${textColor};">${html}</td>`;
  const row = (glyph: string, html: string) => `<tr>${iconCell(glyph)}${textCell(html)}</tr>`;

  const rows: string[] = [];

  // Phone — mobile / office on one line, like the reference.
  const phones: string[] = [];
  if (data.mobilePhone) {
    phones.push(
      `<a href="${escapeHtml(telHref(data.mobilePhone))}" style="color:${textColor};text-decoration:none;">${escapeHtml(data.mobilePhone)}</a>`
    );
  }
  if (data.officePhone) {
    const ext = data.extension ? ` ${escapeHtml("ext. " + data.extension)}` : "";
    phones.push(
      `<a href="${escapeHtml(telHref(data.officePhone))}" style="color:${textColor};text-decoration:none;">${escapeHtml(data.officePhone)}</a>${ext}`
    );
  }
  if (phones.length) rows.push(row(ICON.phone, phones.join(" / ")));

  if (data.email && isEmail(data.email)) {
    rows.push(
      row(
        ICON.email,
        `<a href="mailto:${escapeHtml(data.email)}" style="color:${textColor};text-decoration:none;">${escapeHtml(data.email)}</a>`
      )
    );
  }

  const web = safeUrl(data.website);
  if (web) {
    rows.push(
      row(
        ICON.web,
        `<a href="${escapeHtml(web)}" style="color:${textColor};text-decoration:none;">${escapeHtml(data.website!.replace(/^https?:\/\//i, "").replace(/\/$/, ""))}</a>`
      )
    );
  }

  if (data.address) {
    rows.push(
      row(
        ICON.pin,
        `<a href="${escapeHtml(mapsHref(data.address))}" style="color:${textColor};text-decoration:none;">${escapeHtml(data.address)}</a>`
      )
    );
  }

  // ----- name / title / divider -----
  const nameHtml = `<tr><td style="font-family:${font};font-size:${size + 5}px;font-weight:bold;color:${brown};letter-spacing:0.3px;padding-bottom:3px;">${escapeHtml(data.fullName)}</td></tr>`;
  const titleText = [data.position, data.department].filter(Boolean).join(" · ");
  const titleHtml = titleText
    ? `<tr><td style="font-family:${font};font-size:${small}px;font-weight:bold;color:${titleColor};letter-spacing:2px;text-transform:uppercase;padding-bottom:8px;">${escapeHtml(titleText)}</td></tr>`
    : "";
  const dividerHtml =
    cfg.dividerStyle === "none"
      ? `<tr><td style="height:6px;font-size:0;line-height:0;">&nbsp;</td></tr>`
      : `<tr><td style="padding:0 0 8px 0;"><table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"><tr><td style="border-top:1px ${cfg.dividerStyle === "dashed" ? "dashed" : "solid"} ${line};font-size:0;line-height:0;">&nbsp;</td></tr></table></td></tr>`;

  // ----- left logo column -----
  const logoBlock = logo
    ? `<img src="${escapeHtml(logo)}" alt="${escapeHtml(companyName)}" width="150" style="display:block;border:0;width:150px;height:auto;margin:0 auto;" />` +
      `<div style="font-family:${serif};color:${brown};font-size:${size}px;text-align:center;margin-top:6px;">${escapeHtml(companyName)}</div>`
    : `<div style="font-family:${serif};color:${brown};line-height:1;white-space:nowrap;">` +
      `<span style="font-size:${size + 21}px;font-weight:bold;letter-spacing:1px;">CH<span style="font-size:${size + 39}px;">T</span>NN</span>` +
      `</div>` +
      `<div style="font-family:${serif};color:${brown};font-size:${size + 2}px;margin-top:2px;">${escapeHtml(companyName)}</div>`;

  const leftCol =
    `<td valign="middle" width="200" style="padding:0 20px 0 4px;text-align:center;">${logoBlock}</td>`;

  // ----- subsidiary buttons row -----
  const links = (data.companyLinks ?? [])
    .map((l) => ({ name: (l.name ?? "").trim(), url: safeUrl(l.url) }))
    .filter((l) => l.name);

  const buttonCell = (l: { name: string; url: string | null }) => {
    const inner = l.url
      ? `<a href="${escapeHtml(l.url)}" style="display:block;text-align:center;font-family:${serif};font-size:${small}px;font-weight:bold;color:#ffffff;text-decoration:none;padding:7px 6px;">${escapeHtml(l.name)}</a>`
      : `<span style="display:block;text-align:center;font-family:${serif};font-size:${small}px;font-weight:bold;color:#ffffff;padding:7px 6px;">${escapeHtml(l.name)}</span>`;
    return (
      `<td valign="middle" style="padding:0 2px;">` +
      `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:${brown};background-image:linear-gradient(180deg,#7A4A38,#5E3628);border-collapse:collapse;">` +
      `<tr><td style="background-color:${brown};background-image:linear-gradient(180deg,#7A4A38,#5E3628);">${inner}</td></tr>` +
      `</table></td>`
    );
  };

  const buttonsRow = links.length
    ? `<tr><td colspan="2" style="padding:14px 0 0 0;">` +
      `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:separate;"><tr>` +
      links.map(buttonCell).join("") +
      `</tr></table></td></tr>`
    : "";

  // ----- assemble -----
  return (
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="620" style="border-collapse:collapse;background-color:${bg};font-family:${font};max-width:620px;">` +
    `<tr><td style="padding:20px 22px 18px 22px;">` +
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;">` +
    `<tr>` +
    leftCol +
    `<td valign="middle" style="padding:0;">` +
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
