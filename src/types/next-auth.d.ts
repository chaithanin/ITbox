import { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      orgId?: string;
      jti?: string;
    } & DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    uid?: string;
    org?: string;
    // Server-side session id (revocation key). NOTE: not `jti` — Auth.js
    // overwrites the jti claim with a random UUID on every JWT encode.
    sid?: string;
  }
}
