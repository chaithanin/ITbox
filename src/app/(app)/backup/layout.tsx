import { notFound } from "next/navigation";
import { BACKUP_ENABLED } from "@/lib/features";

/** Hidden via BACKUP_ENABLED; every /backup page 404s when off. Flip the flag in
 *  src/lib/features.ts and redeploy to re-open. Data is retained. */
export default function BackupLayout({ children }: { children: React.ReactNode }) {
  if (!BACKUP_ENABLED) notFound();
  return <>{children}</>;
}
