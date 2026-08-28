import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requirePermission } from "@/lib/session";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { createArticle } from "../actions";

export default async function NewArticle() {
  await requirePermission("kb:manage");
  return (
    <div>
      <PageHeader title="เขียนบทความ / New Article">
        <Button variant="outline" asChild><Link href="/kb"><ArrowLeft className="h-4 w-4" /> กลับ / Back</Link></Button>
      </PageHeader>
      <Card><CardContent className="p-5">
        <form action={createArticle} className="grid gap-4">
          <div><Label htmlFor="title">หัวข้อ / Title *</Label><Input id="title" name="title" required minLength={3} maxLength={300} className="mt-1" /></div>
          <div className="grid gap-4 sm:grid-cols-3">
            <div><Label htmlFor="category">หมวดหมู่ / Category</Label><Input id="category" name="category" className="mt-1" placeholder="Network, Email ..." /></div>
            <div><Label htmlFor="tags">แท็ก / Tags</Label><Input id="tags" name="tags" className="mt-1" placeholder="vpn, printer" /></div>
            <div><Label htmlFor="status">สถานะ / Status *</Label><Select id="status" name="status" required defaultValue="DRAFT" className="mt-1">{["DRAFT", "PUBLISHED", "ARCHIVED"].map((s) => <option key={s} value={s}>{s}</option>)}</Select></div>
          </div>
          <div><Label htmlFor="body">เนื้อหา / Body *</Label><Textarea id="body" name="body" required rows={14} className="mt-1 font-mono text-sm" placeholder="ขั้นตอนการแก้ปัญหา..." /></div>
          <div className="flex justify-end"><Button type="submit">บันทึก / Save</Button></div>
        </form>
      </CardContent></Card>
    </div>
  );
}
