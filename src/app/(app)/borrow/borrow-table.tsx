import Link from "next/link";
import { formatDate, daysUntil } from "@/lib/utils";
import { StatusBadge } from "@/components/status-badge";
import { Card } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { deriveDisplayStatus } from "@/lib/borrow/status";

export interface BorrowRow {
  id: string;
  refNo: string;
  status: string;
  requesterName: string | null;
  dueDate: Date | null;
  itemCount: number;
  requesterFallback: string;
  departmentName: string | null;
}

export function BorrowTable({ rows, emptyText }: { rows: BorrowRow[]; emptyText: string }) {
  const now = new Date();
  return (
    <Card>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>เลขที่ / Ref No.</TableHead>
            <TableHead>ผู้ขอ / Requester</TableHead>
            <TableHead>แผนก / Department</TableHead>
            <TableHead className="text-center">รายการ / Items</TableHead>
            <TableHead>กำหนดคืน / Due</TableHead>
            <TableHead>สถานะ / Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 && (
            <TableRow>
              <TableCell colSpan={6} className="py-10 text-center text-sm text-muted-foreground">
                {emptyText}
              </TableCell>
            </TableRow>
          )}
          {rows.map((r) => {
            const display = deriveDisplayStatus(r.status as never, r.dueDate, now);
            const dleft = r.dueDate ? daysUntil(r.dueDate) : null;
            return (
              <TableRow key={r.id}>
                <TableCell className="font-medium">
                  <Link href={`/borrow/${r.id}`} className="hover:underline">{r.refNo}</Link>
                </TableCell>
                <TableCell>{r.requesterName ?? r.requesterFallback}</TableCell>
                <TableCell>{r.departmentName ?? "—"}</TableCell>
                <TableCell className="text-center">{r.itemCount}</TableCell>
                <TableCell>
                  {r.dueDate ? (
                    <span className={dleft !== null && dleft < 0 ? "text-destructive" : ""}>{formatDate(r.dueDate)}</span>
                  ) : "—"}
                </TableCell>
                <TableCell><StatusBadge status={display} /></TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </Card>
  );
}
