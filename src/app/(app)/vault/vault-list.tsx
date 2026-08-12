import Link from "next/link";
import { KeyRound, Server, Database, Wifi, Globe, Terminal, FileKey, Star } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { StatusBadge } from "@/components/status-badge";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/utils";

const TYPE_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  PASSWORD: KeyRound,
  SERVER: Server,
  DATABASE: Database,
  WIFI: Wifi,
  API_KEY: Globe,
  SSH_KEY: Terminal,
  NETWORK_DEVICE: Server,
  CERTIFICATE: FileKey,
  LICENSE_KEY: FileKey,
  TOKEN: FileKey,
  OTHER: KeyRound,
};

export interface VaultListItem {
  id: string;
  name: string;
  type: string;
  classification: string;
  environment: string | null;
  username: string | null;
  host: string | null;
  url: string | null;
  nextRotationAt: Date | null;
  expiresAt: Date | null;
  category: { name: string } | null;
  department: { name: string } | null;
  owner: { name: string } | null;
  isFavorite?: boolean;
}

export function VaultGrid({ items }: { items: VaultListItem[] }) {
  if (items.length === 0) {
    return (
      <Card>
        <CardContent className="p-8 text-center text-sm text-muted-foreground">
          ไม่พบข้อมูลรหัสผ่าน / No secrets found
        </CardContent>
      </Card>
    );
  }
  const now = Date.now();
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {items.map((item) => {
        const Icon = TYPE_ICONS[item.type] ?? KeyRound;
        const rotationDue =
          item.nextRotationAt && item.nextRotationAt.getTime() < now;
        const expired = item.expiresAt && item.expiresAt.getTime() < now;
        return (
          <Link key={item.id} href={`/vault/${item.id}`}>
            <Card className="h-full transition-shadow hover:shadow-md">
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                      <Icon className="h-4.5 w-4.5" />
                    </div>
                    <div className="min-w-0">
                      <p className="truncate font-medium leading-tight">
                        {item.name}
                        {item.isFavorite && (
                          <Star className="ml-1 inline h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                        )}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {item.username ?? item.host ?? item.url ?? item.type}
                      </p>
                    </div>
                  </div>
                  <StatusBadge status={item.classification} />
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-1.5 text-xs">
                  {item.category && <Badge variant="secondary">{item.category.name}</Badge>}
                  {item.environment && <Badge variant="outline">{item.environment}</Badge>}
                  {item.department && (
                    <span className="text-muted-foreground">{item.department.name}</span>
                  )}
                </div>
                {(rotationDue || expired) && (
                  <div className="mt-2 flex gap-2 text-xs">
                    {expired && <Badge variant="destructive">หมดอายุ / Expired</Badge>}
                    {rotationDue && !expired && (
                      <Badge variant="warning">
                        ถึงรอบเปลี่ยนรหัส / Rotation due {formatDate(item.nextRotationAt)}
                      </Badge>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </Link>
        );
      })}
    </div>
  );
}
