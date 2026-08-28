"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";
import { auditLog } from "@/lib/audit";

const emptyToNull = (v: unknown) => (typeof v === "string" && v.trim() === "" ? null : v);
const optStr = z.preprocess(emptyToNull, z.string().max(2000).nullable().optional());
const optUuid = z.preprocess(emptyToNull, z.string().uuid().nullable().optional());

const DEVICE_TYPES = ["ROUTER", "SWITCH", "FIREWALL", "ACCESS_POINT", "LOAD_BALANCER", "CONTROLLER", "GATEWAY", "OTHER"] as const;
const DEVICE_STATUS = ["ONLINE", "OFFLINE", "MAINTENANCE", "UNKNOWN"] as const;
const IP_STATUS = ["AVAILABLE", "ASSIGNED", "RESERVED"] as const;

const deviceSchema = z.object({
  name: z.string().min(1).max(200),
  deviceType: z.enum(DEVICE_TYPES),
  status: z.enum(DEVICE_STATUS),
  hostname: optStr, mgmtIp: optStr, macAddress: optStr,
  model: optStr, firmware: optStr, owner: optStr, notes: optStr,
  vendorId: optUuid, locationId: optUuid,
});

export async function createDevice(formData: FormData) {
  const user = await requirePermission("network:manage");
  const i = deviceSchema.parse(Object.fromEntries(formData));
  try {
    const d = await prisma.networkDevice.create({
      data: {
        organizationId: user.organizationId,
        name: i.name.trim(), deviceType: i.deviceType, status: i.status,
        hostname: i.hostname ?? null, mgmtIp: i.mgmtIp ?? null, macAddress: i.macAddress ?? null,
        model: i.model ?? null, firmware: i.firmware ?? null, owner: i.owner ?? null, notes: i.notes ?? null,
        vendorId: i.vendorId ?? null, locationId: i.locationId ?? null,
      },
    });
    await auditLog(user, { action: "CREATE", entityType: "NETWORK_DEVICE", entityId: d.id, detail: { name: d.name } });
  } catch {
    redirect("/network?error=dup");
  }
  revalidatePath("/network");
  redirect("/network?ok=created");
}

export async function setDeviceStatus(id: string, status: string) {
  const user = await requirePermission("network:manage");
  const s = z.enum(DEVICE_STATUS).parse(status);
  const d = await prisma.networkDevice.findFirst({ where: { id, organizationId: user.organizationId, deletedAt: null }, select: { id: true } });
  if (!d) redirect("/network");
  await prisma.networkDevice.update({ where: { id }, data: { status: s } });
  await auditLog(user, { action: "UPDATE", entityType: "NETWORK_DEVICE", entityId: id, detail: { status: s } });
  revalidatePath("/network");
  redirect("/network?ok=updated");
}

export async function deleteDevice(formData: FormData) {
  const user = await requirePermission("network:manage");
  const id = z.string().uuid().parse(formData.get("id"));
  await prisma.networkDevice.updateMany({ where: { id, organizationId: user.organizationId }, data: { deletedAt: new Date() } });
  await auditLog(user, { action: "DELETE", entityType: "NETWORK_DEVICE", entityId: id });
  revalidatePath("/network");
  redirect("/network?ok=deleted");
}

// ---------------- IPAM ----------------

const vlanSchema = z.object({
  vlanId: z.coerce.number().int().min(1).max(4094),
  name: z.string().min(1).max(200),
  purpose: optStr, locationId: optUuid,
});
export async function createVlan(formData: FormData) {
  const user = await requirePermission("network:manage");
  const i = vlanSchema.parse(Object.fromEntries(formData));
  try {
    await prisma.vlan.create({ data: { organizationId: user.organizationId, vlanId: i.vlanId, name: i.name.trim(), purpose: i.purpose ?? null, locationId: i.locationId ?? null } });
    await auditLog(user, { action: "CREATE", entityType: "VLAN", detail: { vlanId: i.vlanId } });
  } catch { redirect("/network/ipam?error=vlandup"); }
  revalidatePath("/network/ipam");
  redirect("/network/ipam?ok=vlan");
}

const subnetSchema = z.object({
  cidr: z.string().min(1).max(64),
  gateway: optStr, dns: optStr, purpose: optStr, vlanRef: optUuid, locationId: optUuid,
});
export async function createSubnet(formData: FormData) {
  const user = await requirePermission("network:manage");
  const i = subnetSchema.parse(Object.fromEntries(formData));
  try {
    await prisma.subnet.create({ data: { organizationId: user.organizationId, cidr: i.cidr.trim(), gateway: i.gateway ?? null, dns: i.dns ?? null, purpose: i.purpose ?? null, vlanRef: i.vlanRef ?? null, locationId: i.locationId ?? null } });
    await auditLog(user, { action: "CREATE", entityType: "SUBNET", detail: { cidr: i.cidr } });
  } catch { redirect("/network/ipam?error=subnetdup"); }
  revalidatePath("/network/ipam");
  redirect("/network/ipam?ok=subnet");
}

const ipSchema = z.object({
  address: z.string().min(1).max(64),
  status: z.enum(IP_STATUS),
  subnetId: optUuid, hostname: optStr, macAddress: optStr, assignedTo: optStr, notes: optStr,
});
export async function createIp(formData: FormData) {
  const user = await requirePermission("network:manage");
  const i = ipSchema.parse(Object.fromEntries(formData));
  try {
    await prisma.ipAddress.create({ data: { organizationId: user.organizationId, address: i.address.trim(), status: i.status, subnetId: i.subnetId ?? null, hostname: i.hostname ?? null, macAddress: i.macAddress ?? null, assignedTo: i.assignedTo ?? null, notes: i.notes ?? null } });
    await auditLog(user, { action: "CREATE", entityType: "IP_ADDRESS", detail: { address: i.address } });
  } catch { redirect("/network/ipam?error=ipdup"); }
  revalidatePath("/network/ipam");
  redirect("/network/ipam?ok=ip");
}

export async function deleteIp(formData: FormData) {
  const user = await requirePermission("network:manage");
  const id = z.string().uuid().parse(formData.get("id"));
  await prisma.ipAddress.updateMany({ where: { id, organizationId: user.organizationId }, data: { deletedAt: new Date() } });
  revalidatePath("/network/ipam");
  redirect("/network/ipam?ok=ipdel");
}
