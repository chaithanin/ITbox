import { NextResponse } from "next/server";
import { z } from "zod";
import { apiHandler } from "@/lib/api";
import { requirePermission } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { createVaultItem, vaultVisibilityWhere } from "@/lib/services/vault";

/**
 * GET /api/vault — METADATA ONLY listing (never returns ciphertext or secrets).
 * POST /api/vault — create a secret (encrypted server-side).
 */
export const GET = apiHandler(async (req: Request) => {
  const user = await requirePermission("vault:read");
  const url = new URL(req.url);
  const page = Math.max(1, Number(url.searchParams.get("page")) || 1);
  const take = Math.min(100, Math.max(1, Number(url.searchParams.get("pageSize")) || 20));
  const q = url.searchParams.get("q") ?? undefined;

  const visibility = await vaultVisibilityWhere(user);
  const where = {
    AND: [
      visibility,
      q
        ? {
            OR: [
              { name: { contains: q, mode: "insensitive" as const } },
              { username: { contains: q, mode: "insensitive" as const } },
              { host: { contains: q, mode: "insensitive" as const } },
            ],
          }
        : {},
    ],
  };
  const [data, total] = await Promise.all([
    prisma.vaultItem.findMany({
      where,
      select: {
        id: true, name: true, type: true, classification: true, environment: true,
        username: true, url: true, host: true, port: true, protocol: true,
        tags: true, rotationDays: true, lastRotatedAt: true, nextRotationAt: true,
        expiresAt: true, createdAt: true, updatedAt: true,
        category: { select: { id: true, name: true } },
        department: { select: { id: true, name: true } },
      },
      orderBy: { updatedAt: "desc" },
      skip: (page - 1) * take,
      take,
    }),
    prisma.vaultItem.count({ where }),
  ]);
  return NextResponse.json({ data, page, pageSize: take, total });
});

const createSchema = z.object({
  name: z.string().min(1).max(200),
  type: z.enum(["PASSWORD","SERVER","DATABASE","API_KEY","SSH_KEY","WIFI","NETWORK_DEVICE","CERTIFICATE","LICENSE_KEY","TOKEN","OTHER"]).default("PASSWORD"),
  classification: z.enum(["LOW","MEDIUM","HIGH","CRITICAL"]).default("MEDIUM"),
  categoryId: z.string().uuid().nullish(),
  departmentId: z.string().uuid().nullish(),
  environment: z.string().max(50).nullish(),
  url: z.string().max(500).nullish(),
  host: z.string().max(200).nullish(),
  port: z.number().int().min(1).max(65535).nullish(),
  protocol: z.string().max(50).nullish(),
  username: z.string().max(200).nullish(),
  tags: z.array(z.string().max(50)).max(20).default([]),
  notes: z.string().max(2000).nullish(),
  rotationDays: z.number().int().min(1).max(3650).nullish(),
  requireMfaToReveal: z.boolean().default(false),
  requireApprovalToReveal: z.boolean().default(false),
  secret: z.object({
    password: z.string().max(4096).optional(),
    apiKey: z.string().max(4096).optional(),
    token: z.string().max(8192).optional(),
    sshPrivateKey: z.string().max(16384).optional(),
    sshPublicKey: z.string().max(8192).optional(),
    certificate: z.string().max(32768).optional(),
    extra: z.string().max(8192).optional(),
  }),
});

export const POST = apiHandler(async (req: Request) => {
  const user = await requirePermission("vault:create");
  const body = createSchema.parse(await req.json());
  const item = await createVaultItem(user, {
    ...body,
    categoryId: body.categoryId ?? null,
    departmentId: body.departmentId ?? null,
    environment: body.environment ?? null,
    url: body.url ?? null,
    host: body.host ?? null,
    port: body.port ?? null,
    protocol: body.protocol ?? null,
    username: body.username ?? null,
    notes: body.notes ?? null,
    rotationDays: body.rotationDays ?? null,
    expiresAt: null,
  });
  return NextResponse.json({ id: item.id, name: item.name }, { status: 201 });
});
