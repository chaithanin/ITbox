import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requirePermission } from "@/lib/session";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { SimUploader } from "./uploader";

export default async function SimImportPage() {
  await requirePermission("sim:manage");
  return (
    <div className="mx-auto max-w-2xl">
      <Button variant="ghost" size="sm" asChild className="mb-2"><Link href="/sim"><ArrowLeft className="h-4 w-4" /> กลับ / Back</Link></Button>
      <PageHeader title="นำเข้าเบอร์/ซิม / Import SIM Lines" description="อัปโหลด CSV หรือ Excel (รองรับไฟล์ aisdtac.csv)" />
      <Card><CardContent className="pt-4"><SimUploader /></CardContent></Card>
    </div>
  );
}
