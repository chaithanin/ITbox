/**
 * WebAuthn / Passkey support (@simplewebauthn v13).
 *
 * Passkeys act as an MFA factor equivalent to TOTP for vault step-up
 * verification. Only public keys are stored; ceremony challenges are kept
 * server-side in webauthn_challenges (short-lived, single-use) so the flow
 * is safe across multiple Cloud Run instances.
 */
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
  type RegistrationResponseJSON,
  type AuthenticationResponseJSON,
  type PublicKeyCredentialCreationOptionsJSON,
  type PublicKeyCredentialRequestOptionsJSON,
  type AuthenticatorTransportFuture,
} from "@simplewebauthn/server";
import { prisma } from "@/lib/prisma";
import { AuthError } from "@/lib/errors";

const RP_NAME = "ITBox";
const CHALLENGE_TTL_MS = 5 * 60_000;

function rpConfig(): { rpID: string; origin: string } {
  const url = new URL(process.env.AUTH_URL ?? "http://localhost:3000");
  return { rpID: url.hostname, origin: url.origin };
}

async function storeChallenge(userId: string, type: "REGISTRATION" | "AUTHENTICATION", challenge: string) {
  // Invalidate previous pending challenges of the same type
  await prisma.webAuthnChallenge.updateMany({
    where: { userId, type, usedAt: null },
    data: { usedAt: new Date() },
  });
  await prisma.webAuthnChallenge.create({
    data: {
      userId,
      type,
      challenge,
      expiresAt: new Date(Date.now() + CHALLENGE_TTL_MS),
    },
  });
}

async function consumeChallenge(
  userId: string,
  type: "REGISTRATION" | "AUTHENTICATION"
): Promise<string> {
  const row = await prisma.webAuthnChallenge.findFirst({
    where: { userId, type, usedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "desc" },
  });
  if (!row) throw new AuthError("WEBAUTHN_CHALLENGE_EXPIRED", 400);
  await prisma.webAuthnChallenge.update({
    where: { id: row.id },
    data: { usedAt: new Date() },
  });
  return row.challenge;
}

export async function hasPasskeys(userId: string): Promise<boolean> {
  return (await prisma.webAuthnCredential.count({ where: { userId } })) > 0;
}

export async function startPasskeyRegistration(user: {
  id: string;
  email: string;
  name: string;
}): Promise<PublicKeyCredentialCreationOptionsJSON> {
  const { rpID } = rpConfig();
  const existing = await prisma.webAuthnCredential.findMany({
    where: { userId: user.id },
    select: { id: true, transports: true },
  });
  const options = await generateRegistrationOptions({
    rpName: RP_NAME,
    rpID,
    userName: user.email,
    userDisplayName: user.name,
    attestationType: "none",
    excludeCredentials: existing.map((c) => ({
      id: c.id,
      transports: c.transports as AuthenticatorTransportFuture[],
    })),
    authenticatorSelection: {
      residentKey: "preferred",
      userVerification: "preferred",
    },
  });
  await storeChallenge(user.id, "REGISTRATION", options.challenge);
  return options;
}

export async function finishPasskeyRegistration(
  userId: string,
  response: RegistrationResponseJSON,
  name?: string
): Promise<{ id: string }> {
  const { rpID, origin } = rpConfig();
  const expectedChallenge = await consumeChallenge(userId, "REGISTRATION");
  const verification = await verifyRegistrationResponse({
    response,
    expectedChallenge,
    expectedOrigin: origin,
    expectedRPID: rpID,
  });
  if (!verification.verified || !verification.registrationInfo) {
    throw new AuthError("WEBAUTHN_VERIFICATION_FAILED", 400);
  }
  const { credential, credentialDeviceType, credentialBackedUp } =
    verification.registrationInfo;
  await prisma.webAuthnCredential.create({
    data: {
      id: credential.id,
      userId,
      publicKey: Buffer.from(credential.publicKey).toString("base64url"),
      counter: BigInt(credential.counter),
      transports: (credential.transports ?? []) as string[],
      deviceType: credentialDeviceType,
      backedUp: credentialBackedUp,
      name: name?.slice(0, 100) || null,
    },
  });
  return { id: credential.id };
}

export async function startPasskeyAuthentication(
  userId: string
): Promise<PublicKeyCredentialRequestOptionsJSON> {
  const { rpID } = rpConfig();
  const creds = await prisma.webAuthnCredential.findMany({
    where: { userId },
    select: { id: true, transports: true },
  });
  if (creds.length === 0) throw new AuthError("NO_PASSKEYS", 400);
  const options = await generateAuthenticationOptions({
    rpID,
    allowCredentials: creds.map((c) => ({
      id: c.id,
      transports: c.transports as AuthenticatorTransportFuture[],
    })),
    userVerification: "preferred",
  });
  await storeChallenge(userId, "AUTHENTICATION", options.challenge);
  return options;
}

/** Verify a passkey assertion. Returns true only on cryptographic success. */
export async function verifyPasskeyAuthentication(
  userId: string,
  response: AuthenticationResponseJSON
): Promise<boolean> {
  try {
    const { rpID, origin } = rpConfig();
    const cred = await prisma.webAuthnCredential.findFirst({
      where: { id: response.id, userId },
    });
    if (!cred) return false;
    const expectedChallenge = await consumeChallenge(userId, "AUTHENTICATION");
    const verification = await verifyAuthenticationResponse({
      response,
      expectedChallenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      credential: {
        id: cred.id,
        publicKey: new Uint8Array(Buffer.from(cred.publicKey, "base64url")),
        counter: Number(cred.counter),
        transports: cred.transports as AuthenticatorTransportFuture[],
      },
    });
    if (!verification.verified) return false;
    await prisma.webAuthnCredential.update({
      where: { id: cred.id },
      data: {
        counter: BigInt(verification.authenticationInfo.newCounter),
        lastUsedAt: new Date(),
      },
    });
    return true;
  } catch {
    return false;
  }
}
