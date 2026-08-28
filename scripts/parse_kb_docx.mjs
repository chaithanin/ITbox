#!/usr/bin/env node
/**
 * Parse the "IT Support Knowledge Base — 100 Topics (TH)" .docx into clean KB
 * article records for TECHCORE. Each Heading2 is one article; its body is the
 * paragraphs up to the next Heading2/Heading1, rendered as light Markdown
 * (KBSubhead -> **bold**, KBStep -> numbered, KBBullet -> bullet). Each article
 * is tagged with the category section (Heading1) it falls under.
 *
 * Usage: node scripts/parse_kb_docx.mjs <input.docx> [out.json]
 * Requires: jszip (in the TECHCORE repo).
 */
import JSZip from "jszip";
import { readFileSync, writeFileSync } from "node:fs";

const [input, out = "kb_articles.json"] = process.argv.slice(2);
if (!input) { console.error("usage: node parse_kb_docx.mjs <input.docx> [out.json]"); process.exit(1); }

const dec = (s) => s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'");

const CATEGORY_SECTIONS = new Set([
  "IT Service Management, Account & Access",
  "Computer, Notebook & Endpoint",
  "Internet, Network & Wi-Fi",
  "Email, Collaboration & Communication",
  "Printer, Scanner & Office Equipment",
  "CRM, Lead & Real Estate Sales Support",
  "Property, Unit, Booking & Payment Systems",
  "Website, Digital Marketing & Lead Integration",
  "CCTV, Access Control & Project Technology",
  "Security, Backup, Incident Response & BCP",
]);

const buf = readFileSync(input);
const zip = await JSZip.loadAsync(buf);
const xml = await zip.file("word/document.xml").async("string");

const paras = xml.split(/<w:p[ >]/).map((p) => {
  const texts = [...p.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map((m) => dec(m[1]));
  const style = (p.match(/w:pStyle w:val="([^"]+)"/) || [])[1] || "";
  return { text: texts.join("").replace(/\s+/g, " ").trim(), style };
}).filter((p) => p.text);

const articles = [];
let category = "General";
let cur = null;

function pushBody(a, p) {
  if (p.style === "KBSubhead") a.bodyLines.push(`\n**${p.text}**`);
  else if (p.style === "KBStep") { a._step = (a._step || 0) + 1; a.bodyLines.push(`${a._step}. ${p.text}`); }
  else if (p.style === "KBBullet") { a._step = 0; a.bodyLines.push(`- ${p.text}`); }
  else { a._step = 0; a.bodyLines.push(p.text); }
}

for (const p of paras) {
  if (p.style === "Heading1") {
    if (CATEGORY_SECTIONS.has(p.text)) category = p.text;
    // A new H1 also ends the current article.
    if (cur) { articles.push(cur); cur = null; }
    continue;
  }
  if (p.style === "Heading2") {
    if (cur) articles.push(cur);
    cur = { title: p.text, category, bodyLines: [], _step: 0 };
    continue;
  }
  if (cur) pushBody(cur, p);
}
if (cur) articles.push(cur);

// Only keep real articles (skip appendix H1s that produced no H2)
const records = articles
  .filter((a) => a.title && a.bodyLines.length)
  .map((a, i) => ({
    title: a.title,
    category: a.category,
    body: a.bodyLines.join("\n").trim(),
    tags: `KB,${a.category.split(",")[0].trim()}`,
    status: "PUBLISHED",
    order: i + 1,
  }));

writeFileSync(out, JSON.stringify(records, null, 2));
const byCat = {};
for (const r of records) byCat[r.category] = (byCat[r.category] || 0) + 1;
console.log(`Parsed ${records.length} KB articles -> ${out}`);
console.log("By category:");
for (const [c, n] of Object.entries(byCat)) console.log(`  ${n}  ${c}`);
console.log("\nSample:", JSON.stringify({ ...records[0], body: records[0].body.slice(0, 200) + "..." }, null, 2));
