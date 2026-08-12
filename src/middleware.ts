import NextAuth from "next-auth";
import { authConfig } from "@/auth.config";

// Edge middleware: JWT cookie check only (no DB). Full session validation
// (revocation, user status, permissions) happens server-side in getCurrentUser.
export const { auth: middleware } = NextAuth(authConfig);

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|svg|jpg|ico)$).*)"],
};
