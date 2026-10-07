import { notFound } from "next/navigation";
import { CMDB_ENABLED } from "@/lib/features";

/** Hidden via CMDB_ENABLED; every /cmdb page 404s when off. Flip the flag in
 *  src/lib/features.ts and redeploy to re-open. Data is retained. */
export default function CmdbLayout({ children }: { children: React.ReactNode }) {
  if (!CMDB_ENABLED) notFound();
  return <>{children}</>;
}
