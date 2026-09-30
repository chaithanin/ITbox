"use client";

import { useEffect } from "react";
import { RotateCcw, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function DriveMappingsError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error("drive-mappings segment error", error); }, [error]);
  return (
    <div className="mx-auto max-w-lg py-10 text-center">
      <h2 className="text-lg font-semibold">เปิดหน้านี้ไม่สำเร็จ / Something went wrong</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        อาจเป็นเพราะสิทธิ์การเข้าถึงยังไม่ครบ หรือระบบเพิ่งอัปเดต กรุณากด “โหลดหน้าใหม่”.
        <br />
        This may be a missing access permission or a just-updated app. Use “Reload”.
      </p>
      {error?.digest && <p className="mt-3 font-mono text-xs text-muted-foreground">Ref: {error.digest}</p>}
      <div className="mt-5 flex justify-center gap-2">
        <Button variant="outline" onClick={() => reset()}><RotateCcw className="h-4 w-4" /> ลองใหม่ / Retry</Button>
        <Button onClick={() => window.location.reload()}><RefreshCw className="h-4 w-4" /> โหลดหน้าใหม่ / Reload</Button>
      </div>
    </div>
  );
}
