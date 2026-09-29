import { notFound } from "next/navigation";
import { CCTV_ENABLED } from "@/lib/features";

/**
 * The CCTV module is closed via the CCTV_ENABLED feature flag. When off, every
 * /cctv page 404s (can't be reached by typing the URL directly either). Flip the
 * flag in src/lib/features.ts and redeploy to re-open it.
 */
export default function CctvLayout({ children }: { children: React.ReactNode }) {
  if (!CCTV_ENABLED) notFound();
  return <>{children}</>;
}
