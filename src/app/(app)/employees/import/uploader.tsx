"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { Download, Loader2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

interface RowError {
  row: number;
  employeeCode: string;
  error: string;
}
interface ImportResult {
  created: number;
  updated: number;
  failed: number;
  errors: RowError[];
}

function csvEscape(v: string | number): string {
  return `"${String(v).replaceAll('"', '""')}"`;
}

export function EmployeeImportUploader() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const file = fileInputRef.current?.files?.[0];
    if (!file) {
      setErrorMessage("กรุณาเลือกไฟล์ CSV หรือ Excel (.xlsx) / Please choose a CSV or Excel (.xlsx) file");
      return;
    }
    setLoading(true);
    setResult(null);
    setErrorMessage(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/employees/import", { method: "POST", body: formData });
      const body: unknown = await res.json().catch(() => null);
      if (!res.ok) {
        const msg =
          body && typeof body === "object" && "message" in body && typeof body.message === "string"
            ? body.message
            : "การนำเข้าล้มเหลว / Import failed";
        setErrorMessage(msg);
        return;
      }
      setResult(body as ImportResult);
    } catch {
      setErrorMessage("การนำเข้าล้มเหลว กรุณาลองใหม่ / Import failed, please try again");
    } finally {
      setLoading(false);
    }
  }

  function downloadErrorReport() {
    if (!result || result.errors.length === 0) return;
    const lines = [
      ["row", "employeeCode", "error"].map(csvEscape).join(","),
      ...result.errors.map((e) =>
        [csvEscape(e.row), csvEscape(e.employeeCode), csvEscape(e.error)].join(",")
      ),
    ];
    const blob = new Blob(["﻿" + lines.join("\r\n") + "\r\n"], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "employee-import-errors.csv";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-4">
      <form onSubmit={handleSubmit} className="flex flex-wrap items-center gap-3">
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          disabled={loading}
          onChange={(e) => {
            setFileName(e.target.files?.[0]?.name ?? null);
            setResult(null);
            setErrorMessage(null);
          }}
          className="text-sm file:mr-3 file:cursor-pointer file:rounded-md file:border file:border-input file:bg-transparent file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-foreground hover:file:bg-accent"
        />
        <Button type="submit" disabled={loading || !fileName}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
          {loading ? "กำลังนำเข้า... / Importing..." : "นำเข้า / Import"}
        </Button>
      </form>

      {errorMessage && (
        <p className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          {errorMessage}
        </p>
      )}

      {result && (
        <div className="space-y-4">
          <div className="rounded-md border bg-muted/30 p-4 text-sm">
            <p className="font-medium">ผลการนำเข้า / Import Result</p>
            <p className="mt-1">
              สร้างใหม่ / Created: <span className="font-semibold text-primary">{result.created}</span> ·
              อัปเดต / Updated: <span className="font-semibold text-primary">{result.updated}</span> ·
              ข้าม / Skipped:{" "}
              <span className={result.failed > 0 ? "font-semibold text-destructive" : "font-semibold"}>
                {result.failed}
              </span>
            </p>
          </div>

          {result.errors.length > 0 && (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-medium">ข้อผิดพลาด / Errors ({result.errors.length})</p>
                <Button type="button" variant="outline" size="sm" onClick={downloadErrorReport}>
                  <Download className="h-4 w-4" />
                  ดาวน์โหลดรายงาน / Download errors
                </Button>
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>แถว / Row</TableHead>
                    <TableHead>รหัสพนักงาน / Code</TableHead>
                    <TableHead>ข้อผิดพลาด / Error</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {result.errors.map((e, i) => (
                    <TableRow key={`${e.row}-${i}`}>
                      <TableCell>{e.row}</TableCell>
                      <TableCell className="font-mono text-xs">{e.employeeCode || "-"}</TableCell>
                      <TableCell className="text-destructive">{e.error}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          {(result.created > 0 || result.updated > 0) && (
            <Button variant="outline" asChild>
              <Link href="/employees">ไปที่รายชื่อพนักงาน / Go to Employees</Link>
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
