"use client";

import { Button, type ButtonProps } from "@/components/ui/button";

/** Submit button that asks for confirmation before submitting its form. */
export function ConfirmButton({
  confirmText = "ยืนยันการทำรายการ? / Confirm?",
  children,
  ...props
}: ButtonProps & { confirmText?: string }) {
  return (
    <Button
      type="submit"
      onClick={(e) => {
        if (!window.confirm(confirmText)) e.preventDefault();
      }}
      {...props}
    >
      {children}
    </Button>
  );
}
