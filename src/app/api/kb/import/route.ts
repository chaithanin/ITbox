import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resolveIngestOrg } from "@/lib/ingest-auth";

export const dynamic = "force-dynamic";

/**
 * Knowledge Base bulk import — push model.
 * Loads KB articles (e.g. parsed from a Word manual) into the org's KB, upserting
 * by title so re-runs update rather than duplicate. Authenticated by the org
 * collector API key. Body: { articles: [{ title, category?, body, tags?, status? }] }.
 */
const KB_STATUS = new Set(["DRAFT", "PUBLISHED", "ARCHIVED"]);
const MAX = 2000;
const str = (v: unknown, max = 20000): string => (typeof v === "string" ? v.trim().slice(0, max) : "");

export async function POST(req: Request) {
  const auth = await resolveIngestOrg(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const orgId = auth.orgId;

  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "invalid_json" }, { status: 400 }); }
  const articles = (body as { articles?: unknown[] }).articles;
  if (!Array.isArray(articles)) return NextResponse.json({ error: "articles_required" }, { status: 400 });
  if (articles.length > MAX) return NextResponse.json({ error: "too_many_articles", max: MAX }, { status: 400 });

  let created = 0, updated = 0;
  const errors: { title: string; error: string }[] = [];

  for (const raw of articles) {
    const a = raw as Record<string, unknown>;
    const title = str(a.title, 300);
    const bodyText = str(a.body, 100000);
    if (!title) { errors.push({ title: "(blank)", error: "title required" }); continue; }
    if (!bodyText) { errors.push({ title, error: "body required" }); continue; }
    const status = KB_STATUS.has(str(a.status).toUpperCase()) ? str(a.status).toUpperCase() : "PUBLISHED";
    const data = { category: str(a.category, 200) || null, body: bodyText, tags: str(a.tags, 500) || null, status: status as never };
    try {
      const existing = await prisma.kbArticle.findFirst({ where: { organizationId: orgId, title, deletedAt: null }, select: { id: true } });
      if (existing) { await prisma.kbArticle.update({ where: { id: existing.id }, data }); updated++; }
      else { await prisma.kbArticle.create({ data: { organizationId: orgId, title, ...data } }); created++; }
    } catch {
      errors.push({ title, error: "upsert_failed" });
    }
  }

  await prisma.auditLog.create({
    data: { organizationId: orgId, action: "IMPORT", entityType: "KB_ARTICLE", detail: { via: "kb-import", created, updated, failed: errors.length } },
  }).catch(() => {});

  return NextResponse.json({ created, updated, failed: errors.length, errors: errors.slice(0, 100) });
}
