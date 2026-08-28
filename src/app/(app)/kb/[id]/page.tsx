import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getCurrentUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { updateArticle, deleteArticle } from "../actions";

export const dynamic = "force-dynamic";

const STATUS_VARIANT: Record<string, "success" | "warning" | "secondary"> = { PUBLISHED: "success", DRAFT: "warning", ARCHIVED: "secondary" };

export default async function KbArticlePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user || !user.permissions.has("kb:read")) notFound();

  const a = await prisma.kbArticle.findFirst({ where: { id, organizationId: user.organizationId, deletedAt: null } });
  if (!a) notFound();
  const canManage = user.permissions.has("kb:manage");
  if (a.status !== "PUBLISHED" && !canManage) notFound();

  const update = updateArticle.bind(null, a.id);

  return (
    <div>
      <PageHeader title={a.title} description={a.category ?? "Knowledge Base"}>
        <Button variant="outline" asChild><Link href="/kb"><ArrowLeft className="h-4 w-4" /> กลับ / Back</Link></Button>
      </PageHeader>

      {!canManage ? (
        <Card><CardContent className="prose prose-sm max-w-none p-5 dark:prose-invert">
          <div className="mb-3 flex items-center gap-2"><Badge variant={STATUS_VARIANT[a.status]}>{a.status}</Badge>{a.tags && <span className="text-xs text-muted-foreground">{a.tags}</span>}</div>
          <pre className="whitespace-pre-wrap font-sans text-sm">{a.body}</pre>
        </CardContent></Card>
      ) : (
        <Card><CardContent className="space-y-4 p-5">
          <form action={update} className="grid gap-4">
            <div><Label htmlFor="title">หัวข้อ / Title *</Label><Input id="title" name="title" required minLength={3} maxLength={300} defaultValue={a.title} className="mt-1" /></div>
            <div className="grid gap-4 sm:grid-cols-3">
              <div><Label htmlFor="category">หมวดหมู่ / Category</Label><Input id="category" name="category" defaultValue={a.category ?? ""} className="mt-1" /></div>
              <div><Label htmlFor="tags">แท็ก / Tags</Label><Input id="tags" name="tags" defaultValue={a.tags ?? ""} className="mt-1" /></div>
              <div><Label htmlFor="status">สถานะ / Status *</Label><Select id="status" name="status" required defaultValue={a.status} className="mt-1">{["DRAFT", "PUBLISHED", "ARCHIVED"].map((s) => <option key={s} value={s}>{s}</option>)}</Select></div>
            </div>
            <div><Label htmlFor="body">เนื้อหา / Body *</Label><Textarea id="body" name="body" required rows={16} defaultValue={a.body} className="mt-1 font-mono text-sm" /></div>
            <div className="flex justify-end"><Button type="submit">บันทึก / Save</Button></div>
          </form>
          <form action={deleteArticle} className="border-t pt-3"><input type="hidden" name="id" value={a.id} /><Button type="submit" variant="outline" className="text-red-600">ลบบทความ / Delete article</Button></form>
        </CardContent></Card>
      )}
    </div>
  );
}
