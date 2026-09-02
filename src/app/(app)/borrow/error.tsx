"use client";

import { useEffect } from "react";
import { RotateCcw, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Error boundary for the Borrow & Return segment. Turns an opaque white-screen
 * "server-side exception" into a readable card. A full reload is offered as
 * well as a soft retry: after a redeploy an already-open tab holds stale server
 * action references, and only a full reload fetches the current build.
 */
export default function BorrowError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("borrow segment error", error);
  }, [error]);

  return (
    <div className="mx-auto max-w-lg py-10 text-center">
      <h2 className="text-lg font-semibold">เกิดข้อผิดพลาด / Something went wrong</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        โหลดหน้านี้ไม่สำเร็จ กรุณาลองใหม่ หากเพิ่งมีการอัปเดตระบบ ให้กด “โหลดหน้าใหม่”.
        <br />
        The page failed to load. Try again — if the app was just updated, use “Reload”.
      </p>
      {error?.digest && (
        <p className="mt-3 font-mono text-xs text-muted-foreground">Ref: {error.digest}</p>
      )}
      <div className="mt-5 flex justify-center gap-2">
        <Button variant="outline" onClick={() => reset()}>
          <RotateCcw className="h-4 w-4" /> ลองใหม่ / Retry
        </Button>
        <Button onClick={() => window.location.reload()}>
          <RefreshCw className="h-4 w-4" /> โหลดหน้าใหม่ / Reload
        </Button>
      </div>
    </div>
  );
}
