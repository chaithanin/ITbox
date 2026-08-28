import Link from "next/link";
import { Check, X } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import { formatDate } from "@/lib/utils";
import { StatusBadge } from "@/components/status-badge";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";

function ChecklistIcon({ done, label }: { done: boolean; label: string }) {
  return (
    <span title={label} className="inline-flex">
      {done ? <Check className="h-4 w-4 text-emerald-600 dark:text-emerald-400" /> : <X className="h-4 w-4 text-muted-foreground" />}
    </span>
  );
}

/** Offboarding (Leaver) board — recent cases, linking to the full detail route. */
export async function OffboardingBoard() {
  const user = await getCurrentUser();
  if (!user || !user.permissions.has("offboarding:read")) {
    return <div className="rounded-lg border bg-card p-6 text-sm text-muted-foreground">ไม่มีสิทธิ์เข้าถึง Offboarding / No access.</div>;
  }
  const rows = await prisma.offboarding.findMany({
    where: { organizationId: user.organizationId },
    include: { employee: { select: { employeeCode: true, firstName: true, lastName: true, department: { select: { name: true } } } } },
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    take: 100,
  });

  return (
    <div className="rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>พนักงาน / Employee</TableHead>
            <TableHead className="hidden md:table-cell">แผนก / Department</TableHead>
            <TableHead className="hidden sm:table-cell">เริ่ม / Started</TableHead>
            <TableHead>สถานะ / Status</TableHead>
            <TableHead>เช็คลิสต์ / Checklist</TableHead>
            <TableHead className="hidden lg:table-cell">เสร็จสิ้น</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 && (
            <TableRow><TableCell colSpan={6} className="py-8 text-center text-muted-foreground">ยังไม่มีรายการ Offboarding — ระบบจะสร้างอัตโนมัติเมื่อ HR แจ้งพนักงานลาออก</TableCell></TableRow>
          )}
          {rows.map((o) => (
            <TableRow key={o.id}>
              <TableCell>
                <Link href={`/offboarding/${o.id}`} className="font-medium text-primary hover:underline">{o.employee.firstName} {o.employee.lastName}</Link>
                <span className="ml-2 font-mono text-xs text-muted-foreground">{o.employee.employeeCode}</span>
              </TableCell>
              <TableCell className="hidden md:table-cell">{o.employee.department?.name ?? "-"}</TableCell>
              <TableCell className="hidden sm:table-cell">{formatDate(o.createdAt)}</TableCell>
              <TableCell><StatusBadge status={o.status} /></TableCell>
              <TableCell>
                <div className="flex items-center gap-2">
                  <ChecklistIcon done={o.assetsReturned} label="ทรัพย์สิน / Assets" />
                  <ChecklistIcon done={o.licensesRevoked} label="ไลเซนส์ / Licenses" />
                  <ChecklistIcon done={o.vaultRevoked} label="Vault" />
                  <ChecklistIcon done={o.accountDisabled} label="บัญชีผู้ใช้ / Account" />
                </div>
              </TableCell>
              <TableCell className="hidden lg:table-cell">{formatDate(o.completedAt)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
