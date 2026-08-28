#!/usr/bin/env node
/**
 * Push parsed KB articles into TECHCORE's Knowledge Base.
 * Reads kb_articles.json (from parse_kb_docx.mjs) and POSTs to /api/kb/import,
 * which upserts by title (idempotent — safe to re-run).
 *
 * Usage:
 *   TECHCORE_URL=https://<techcore>/api/kb/import TECHCORE_KEY=tck_xxx \
 *   node scripts/push_kb_to_techcore.mjs kb_articles.json
 * Requires: Node 18+.
 */
import { readFileSync } from "node:fs";

const URL = process.env.TECHCORE_URL || "https://itbox-ppjbzqdu3q-as.a.run.app/api/kb/import";
const KEY = process.env.TECHCORE_KEY;
const [file = "kb_articles.json"] = process.argv.slice(2);
if (!KEY) { console.error("ERROR: set TECHCORE_KEY (tck_...)"); process.exit(1); }

const articles = JSON.parse(readFileSync(file, "utf-8")).map((a) => ({
  title: a.title, category: a.category, body: a.body, tags: a.tags, status: a.status || "PUBLISHED",
}));
console.log(`Loaded ${articles.length} KB articles -> ${URL}`);

const res = await fetch(URL, {
  method: "POST",
  headers: { "Content-Type": "application/json", Authorization: `Bearer ${KEY}` },
  body: JSON.stringify({ articles }),
});
const text = await res.text();
if (!res.ok) { console.error(`HTTP ${res.status}: ${text.slice(0, 400)}`); process.exit(1); }
console.log("Result:", text);
