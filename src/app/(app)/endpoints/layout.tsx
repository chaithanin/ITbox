import { notFound } from "next/navigation";
import { ENDPOINTS_ENABLED } from "@/lib/features";

/** Hidden via ENDPOINTS_ENABLED; every /endpoints page 404s when off. Flip the
 *  flag in src/lib/features.ts and redeploy to re-open. Data is retained. */
export default function EndpointsLayout({ children }: { children: React.ReactNode }) {
  if (!ENDPOINTS_ENABLED) notFound();
  return <>{children}</>;
}
