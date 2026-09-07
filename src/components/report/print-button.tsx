"use client";

import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Prints the current dashboard. The global print stylesheet hides the sidebar
 *  and topbar, so the browser's "Save as PDF" yields a clean report in the
 *  Summary → KPIs → Charts → Detail order the page already lays out. */
export function PrintButton({ label = "พิมพ์ / Print" }: { label?: string }) {
  return (
    <Button variant="outline" size="sm" className="no-print" onClick={() => window.print()}>
      <Printer className="h-4 w-4" /> {label}
    </Button>
  );
}
