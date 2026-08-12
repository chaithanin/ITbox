import Link from "next/link";
import { CheckCheck, Check, ExternalLink } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { cn, formatDateTime } from "@/lib/utils";
import { PageHeader } from "@/components/page-header";
import { Pagination, parsePage } from "@/components/list-controls";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { markAllRead, markRead } from "./actions";
import type { NotificationLevel } from "@prisma/client";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 30;

const LEVEL_VARIANT: Record<NotificationLevel, "default" | "warning" | "destructive"> = {
  INFO: "default",
  WARNING: "warning",
  CRITICAL: "destructive",
};

function str(v: string | string[] | undefined): string | undefined {
  const s = Array.isArray(v) ? v[0] : v;
  return s ? s : undefined;
}

export default async function NotificationsPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const user = await requireUser();
  const sp = await searchParams;
  const { page, skip, take } = parsePage(str(sp.page), PAGE_SIZE);

  const where = { organizationId: user.organizationId, userId: user.id };

  const [total, unread, notifications] = await Promise.all([
    prisma.notification.count({ where }),
    prisma.notification.count({ where: { ...where, readAt: null } }),
    prisma.notification.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take,
    }),
  ]);
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div>
      <PageHeader
        title="การแจ้งเตือน / Notifications"
        description={`ยังไม่อ่าน ${unread.toLocaleString()} จากทั้งหมด ${total.toLocaleString()} รายการ / ${unread.toLocaleString()} unread of ${total.toLocaleString()}`}
      >
        {unread > 0 && (
          <form action={markAllRead}>
            <Button type="submit" variant="outline" size="sm">
              <CheckCheck className="h-4 w-4" />
              อ่านทั้งหมด / Mark all read
            </Button>
          </form>
        )}
      </PageHeader>

      {notifications.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-sm text-muted-foreground">
            ไม่มีการแจ้งเตือน / No notifications
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {notifications.map((n) => {
            const isUnread = n.readAt === null;
            return (
              <Card
                key={n.id}
                className={cn(isUnread && "border-l-2 border-l-primary bg-primary/5")}
              >
                <CardContent className="flex flex-wrap items-start justify-between gap-3 p-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant={LEVEL_VARIANT[n.level]}>{n.level}</Badge>
                      <span className={cn("text-sm", isUnread && "font-semibold")}>{n.title}</span>
                    </div>
                    {n.body && (
                      <p className="mt-1 text-sm text-muted-foreground">{n.body}</p>
                    )}
                    <p className="mt-1 text-xs text-muted-foreground">
                      {formatDateTime(n.createdAt)}
                      {n.type ? ` · ${n.type}` : ""}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {n.link && (
                      <Button variant="ghost" size="sm" asChild>
                        <Link href={n.link}>
                          <ExternalLink className="h-4 w-4" />
                          เปิด / Open
                        </Link>
                      </Button>
                    )}
                    {isUnread && (
                      <form action={markRead.bind(null, n.id)}>
                        <Button type="submit" variant="outline" size="sm">
                          <Check className="h-4 w-4" />
                          อ่านแล้ว / Read
                        </Button>
                      </form>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Pagination page={page} pageCount={pageCount} basePath="/notifications" searchParams={{}} />
    </div>
  );
}
