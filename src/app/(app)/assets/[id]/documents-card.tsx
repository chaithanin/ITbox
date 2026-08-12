import { FileText, Upload, Image as ImageIcon } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { ConfirmButton } from "@/components/confirm-button";
import { formatDateTime } from "@/lib/utils";
import { uploadAssetDocumentAction, deleteAssetDocumentAction } from "./document-actions";

function humanSize(bytes: number | null): string {
  if (!bytes) return "-";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Documents & image uploads for an asset (GCS in production, local in dev). */
export async function AssetDocumentsCard({
  assetId,
  organizationId,
  canEdit,
}: {
  assetId: string;
  organizationId: string;
  canEdit: boolean;
}) {
  const docs = await prisma.assetDocument.findMany({
    where: { assetId, organizationId, deletedAt: null },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  const uploadAction = uploadAssetDocumentAction.bind(null, assetId);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileText className="h-4 w-4" />
          เอกสารแนบ / Documents ({docs.length})
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {docs.length === 0 && (
          <p className="text-sm text-muted-foreground">
            ยังไม่มีเอกสารแนบ / No documents uploaded
          </p>
        )}
        {docs.map((d) => {
          const del = deleteAssetDocumentAction.bind(null, assetId, d.id);
          const isImage = (d.contentType ?? "").startsWith("image/");
          return (
            <div key={d.id} className="flex items-center justify-between gap-2 rounded-md border p-2.5 text-sm">
              <a
                href={`/api/documents/${d.id}`}
                target="_blank"
                rel="noreferrer"
                className="flex min-w-0 items-center gap-2 hover:underline"
              >
                {isImage ? (
                  <ImageIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
                ) : (
                  <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                )}
                <span className="truncate font-medium">{d.name}</span>
                <Badge variant="secondary">{d.type}</Badge>
              </a>
              <span className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
                {humanSize(d.sizeBytes)} · {formatDateTime(d.createdAt)}
                {canEdit && (
                  <form action={del}>
                    <ConfirmButton variant="ghost" size="sm" confirmText="ลบเอกสารนี้? / Delete this document?">
                      ลบ
                    </ConfirmButton>
                  </form>
                )}
              </span>
            </div>
          );
        })}

        {canEdit && (
          <form action={uploadAction} className="space-y-2 border-t pt-3">
            <p className="text-xs font-semibold uppercase text-muted-foreground">
              อัปโหลดเอกสาร / Upload (PDF, รูปภาพ, DOCX, XLSX ≤10MB)
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="file"
                name="file"
                required
                accept=".pdf,.png,.jpg,.jpeg,.webp,.docx,.xlsx,.csv,.txt"
                className="flex-1 rounded-md border border-input bg-card px-2 py-1.5 text-sm file:mr-2 file:rounded file:border-0 file:bg-secondary file:px-2 file:py-1 file:text-xs"
              />
              <Select name="docType" defaultValue="OTHER" className="w-36">
                <option value="INVOICE">ใบแจ้งหนี้ / Invoice</option>
                <option value="WARRANTY">ใบรับประกัน / Warranty</option>
                <option value="MANUAL">คู่มือ / Manual</option>
                <option value="PHOTO">รูปภาพ / Photo</option>
                <option value="OTHER">อื่น ๆ / Other</option>
              </Select>
            </div>
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <input type="checkbox" name="setAsImage" className="h-3.5 w-3.5 rounded border-input" />
              ใช้เป็นรูปประจำทรัพย์สิน (เฉพาะไฟล์รูปภาพ) / Set as asset image
            </label>
            <Button type="submit" size="sm">
              <Upload className="h-4 w-4" /> อัปโหลด / Upload
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
