import NextAuth, { CredentialsSignin } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import { z } from "zod";
import crypto from "node:crypto";
import { prisma } from "@/lib/prisma";
import { verifyPassword } from "@/lib/password";
import { verifyTotp } from "@/lib/mfa";
import { authConfig, SESSION_MAX_AGE_SECONDS } from "@/auth.config";
import { checkRateLimit } from "@/lib/rate-limit";

const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 15;

class LoginError extends CredentialsSignin {
  constructor(code: string) {
    super(code);
    this.code = code;
  }
}

const credentialsSchema = z.object({
  email: z.string().email().toLowerCase(),
  password: z.string().min(1).max(256),
  totp: z.string().max(10).optional(),
});

async function audit(
  organizationId: string,
  userId: string | null,
  action: string,
  result: string,
  detail?: object
) {
  try {
    await prisma.auditLog.create({
      data: {
        organizationId,
        userId,
        action,
        entityType: "AUTH",
        result,
        detail: detail ? JSON.parse(JSON.stringify(detail)) : undefined,
      },
    });
  } catch {
    // Audit failure must not break the login flow, but never swallow secrets.
  }
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: {
        email: {},
        password: {},
        totp: {},
      },
      async authorize(raw) {
        const parsed = credentialsSchema.safeParse(raw);
        if (!parsed.success) throw new LoginError("INVALID_CREDENTIALS");
        const { email, password, totp } = parsed.data;

        // Rate limit login attempts per email (in addition to lockout)
        if (!checkRateLimit(`login:${email}`, 10, 60_000)) {
          throw new LoginError("RATE_LIMITED");
        }

        const user = await prisma.user.findFirst({
          where: { email, deletedAt: null },
        });
        // Uniform error for unknown user vs wrong password
        if (!user || !user.passwordHash) {
          throw new LoginError("INVALID_CREDENTIALS");
        }
        if (user.status === "DISABLED") {
          await audit(user.organizationId, user.id, "LOGIN", "DENIED", { reason: "DISABLED" });
          throw new LoginError("ACCOUNT_DISABLED");
        }
        if (user.lockedUntil && user.lockedUntil > new Date()) {
          await audit(user.organizationId, user.id, "LOGIN", "DENIED", { reason: "LOCKED" });
          throw new LoginError("ACCOUNT_LOCKED");
        }

        const ok = await verifyPassword(user.passwordHash, password);
        if (!ok) {
          const failed = user.failedLoginCount + 1;
          await prisma.user.update({
            where: { id: user.id },
            data: {
              failedLoginCount: failed,
              lockedUntil:
                failed >= MAX_FAILED_ATTEMPTS
                  ? new Date(Date.now() + LOCKOUT_MINUTES * 60_000)
                  : null,
            },
          });
          await audit(user.organizationId, user.id, "LOGIN", "FAILED", {
            failedCount: failed,
          });
          throw new LoginError(
            failed >= MAX_FAILED_ATTEMPTS ? "ACCOUNT_LOCKED" : "INVALID_CREDENTIALS"
          );
        }

        // MFA (TOTP)
        if (user.mfaEnabled) {
          if (!totp) throw new LoginError("MFA_REQUIRED");
          const valid = await verifyTotp(user, totp);
          if (!valid) {
            await audit(user.organizationId, user.id, "LOGIN", "FAILED", { reason: "MFA" });
            throw new LoginError("MFA_INVALID");
          }
        }

        await prisma.user.update({
          where: { id: user.id },
          data: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date() },
        });
        await audit(user.organizationId, user.id, "LOGIN", "SUCCESS");

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          image: user.image,
        };
      },
    }),
    ...(process.env.GOOGLE_CLIENT_ID
      ? [
          Google({
            clientId: process.env.GOOGLE_CLIENT_ID,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET,
          }),
        ]
      : []),
  ],
  callbacks: {
    ...authConfig.callbacks,
    async signIn({ user, account, profile }) {
      if (account?.provider === "google") {
        // Enterprise policy: only pre-provisioned, active users may sign in.
        const email = (profile?.email ?? user.email)?.toLowerCase();
        if (!email || profile?.email_verified === false) return false;
        const existing = await prisma.user.findFirst({
          where: { email, deletedAt: null, status: "ACTIVE" },
        });
        if (!existing) return false;
        // MFA policy note: Google SSO relies on the IdP's own 2SV.
        await audit(existing.organizationId, existing.id, "LOGIN", "SUCCESS", {
          provider: "google",
        });
        await prisma.user.update({
          where: { id: existing.id },
          data: { lastLoginAt: new Date(), failedLoginCount: 0, lockedUntil: null },
        });
      }
      return true;
    },
    async jwt({ token, user, account, trigger }) {
      if (user) {
        // Initial sign-in: resolve DB user and register a revocable session.
        const email = (user.email ?? "").toLowerCase();
        const dbUser = await prisma.user.findFirst({
          where: { email, deletedAt: null },
          select: { id: true, organizationId: true },
        });
        if (dbUser) {
          const jti = crypto.randomUUID();
          token.uid = dbUser.id;
          token.org = dbUser.organizationId;
          token.jti = jti;
          await prisma.userSession.create({
            data: {
              userId: dbUser.id,
              tokenId: jti,
              expiresAt: new Date(Date.now() + SESSION_MAX_AGE_SECONDS * 1000),
            },
          });
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (token.uid) {
        session.user.id = token.uid as string;
        session.user.orgId = token.org as string | undefined;
        session.user.jti = token.jti as string | undefined;
      }
      return session;
    },
  },
  events: {
    async signOut(message) {
      const token = "token" in message ? message.token : null;
      if (token?.jti && token?.uid) {
        await prisma.userSession.updateMany({
          where: { tokenId: token.jti as string, revokedAt: null },
          data: { revokedAt: new Date() },
        });
        if (token.org) {
          await audit(token.org as string, token.uid as string, "LOGOUT", "SUCCESS");
        }
      }
    },
  },
});
