import { notFound } from "next/navigation";
import { VULN_ENABLED } from "@/lib/features";

/** Hidden via VULN_ENABLED; every /vulnerabilities page 404s when off. Flip the
 *  flag in src/lib/features.ts and redeploy to re-open. Data is retained. */
export default function VulnerabilitiesLayout({ children }: { children: React.ReactNode }) {
  if (!VULN_ENABLED) notFound();
  return <>{children}</>;
}
