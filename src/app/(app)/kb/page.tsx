import Link from "next/link";
import { BookOpen, Plus } from "lucide-react";
import { getCurrentUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/page-header";
import { SearchFilterBar } from "@/components/list-controls";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

export const dynamic = "force-dynamic";

const STATUS_VARIANT: Record<string, "success" | "warning" | "secondary"> = {
  PUBLISHED: "success", DRAFT: "warning", ARCHIVED: "secondary",
};

export default async function KbPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const user = await getCurrentUser();
  if (!user || !user.permissions.has("kb:read")) {
    return <div className="rounded-lg border bg-card p-6 text-sm text-muted-foreground">ไม่มีสิทธิ์เข้าถึงหน้านี้ / No access.</div>;
  }
  const canManage = user.permissions.has("kb:manage");
  const orgId = user.organizationId;
  const q = sp.q?.trim() || undefined;

  const articles = await prisma.kbArticle.findMany({
    where: {
      organizationId: orgId, deletedAt: null,
      // Non-editors only see published articles.
      ...(canManage ? {} : { status: "PUBLISHED" }),
      ...(q ? { OR: [
        { title: { contains: q, mode: "insensitive" as const } },
        { category: { contains: q, mode: "insensitive" as const } },
        { tags: { contains: q, mode: "insensitive" as const } },
        { body: { contains: q, mode: "insensitive" as const } },
      ] } : {}),
    },
    orderBy: { updatedAt: "desc" },
    take: 100,
  });

  return (
    <div>
      <PageHeader title="ฐานความรู้ / Knowledge Base" description="บทความวิธีแก้ปัญหา คู่มือ และแนวทางปฏิบัติ (SOP)">
        {canManage && <Button asChild><Link href="/kb/new"><Plus className="h-4 w-4" /> เขียนบทความ / New article</Link></Button>}
      </PageHeader>

      <SearchFilterBar action="/kb" q={q} placeholder="ค้นหาบทความ / Search articles..." />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {articles.length === 0 && <p className="col-span-full rounded-lg border bg-card p-6 text-center text-sm text-muted-foreground">ไม่พบบทความ / No articles</p>}
        {articles.map((a) => (
          <Link key={a.id} href={`/kb/${a.id}`}>
            <Card className="h-full transition-shadow hover:shadow-md">
              <CardContent className="p-4">
                <div className="mb-2 flex items-start justify-between gap-2">
                  <BookOpen className="h-4 w-4 shrink-0 text-primary" />
                  <Badge variant={STATUS_VARIANT[a.status]}>{a.status}</Badge>
                </div>
                <p className="font-medium leading-tight">{a.title}</p>
                {a.category && <p className="mt-1 text-xs text-muted-foreground">{a.category}</p>}
                <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">{a.body.slice(0, 160)}</p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
