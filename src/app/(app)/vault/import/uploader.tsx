"use client";

import { useState } from "react";
import Link from "next/link";
import { Upload, Loader2, CheckCircle2, AlertTriangle, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";

interface RowError { row: number; name: string; error: string }
interface ImportResult { created: number; failed: number; errors: RowError[] }

const ERR_MESSAGES: Record<string, string> = {
  no_file: "กรุณาเลือกไฟล์ CSV หรือ Excel / Please choose a CSV or Excel file",
  file_too_large: "ไฟล์ใหญ่เกิน 5MB / File exceeds 5MB",
  invalid_file: "ไฟล์ไม่ถูกต้อง / Invalid file",
  empty_file: "ไม่มีข้อมูลในไฟล์ / Empty file",
  missing_name_column: "ต้องมีคอลัมน์ name / Missing 'name' column",
  too_many_rows: "แถวเกิน 5000 / Too many rows (max 5000)",
};

export function VaultImportUploader() {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/vault/import", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) {
        setError(ERR_MESSAGES[data.error] ?? "นำเข้าไม่สำเร็จ / Import failed");
        return;
      }
      setResult(data as ImportResult);
    } catch {
      setError("เกิดข้อผิดพลาด / Request failed");
    } finally {
      setLoading(false);
    }
  };

  const downloadErrors = () => {
    if (!result?.errors.length) return;
    const rows = [["row", "name", "error"], ...result.errors.map((e) => [String(e.row), e.name, e.error])];
    const csv = "﻿" + rows.map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "vault-import-errors.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-5">
          <form onSubmit={submit} className="space-y-3">
            <input
              type="file"
              accept=".csv,.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="block w-full rounded-md border border-input bg-card px-2 py-1.5 text-sm file:mr-2 file:rounded file:border-0 file:bg-secondary file:px-2 file:py-1 file:text-xs"
            />
            <div className="flex gap-2">
              <Button type="submit" disabled={!file || loading}>
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                นำเข้ารหัสผ่าน / Import Secrets
              </Button>
              <Button type="button" variant="outline" asChild>
                <a href="/api/vault/import"><Download className="h-4 w-4" /> เทมเพลต / Template</a>
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {error && (
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
      )}

      {result && (
        <Card>
          <CardContent className="space-y-3 p-5">
            <div className="flex flex-wrap items-center gap-4">
              <span className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400">
                <CheckCircle2 className="h-5 w-5" />
                นำเข้าสำเร็จ {result.created} รายการ / {result.created} imported
              </span>
              {result.failed > 0 && (
                <span className="flex items-center gap-2 text-amber-600 dark:text-amber-400">
                  <AlertTriangle className="h-5 w-5" />
                  ข้าม {result.failed} รายการ / {result.failed} skipped
                </span>
              )}
            </div>
            {result.errors.length > 0 && (
              <>
                <Button variant="outline" size="sm" onClick={downloadErrors}>
                  <Download className="h-4 w-4" /> ดาวน์โหลดรายการที่ผิดพลาด / Error report
                </Button>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>แถว / Row</TableHead>
                      <TableHead>ชื่อ / Name</TableHead>
                      <TableHead>ข้อผิดพลาด / Error</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {result.errors.slice(0, 100).map((e, i) => (
                      <TableRow key={i}>
                        <TableCell>{e.row}</TableCell>
                        <TableCell className="max-w-xs truncate">{e.name}</TableCell>
                        <TableCell>{e.error}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </>
            )}
            <Button asChild variant="secondary" size="sm">
              <Link href="/vault">ไปที่ตู้เซฟ / Go to Vault</Link>
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
