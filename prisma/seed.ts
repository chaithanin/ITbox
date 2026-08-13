/**
 * ITBox seed — demo organization, RBAC, employees, assets, FAKE vault records.
 *
 * Demo user passwords come from SEED_ADMIN_PASSWORD / SEED_USER_PASSWORD env
 * vars (never hard-coded). All vault records contain FAKE demo values only.
 *
 * Run: npm run db:seed
 */
import { PrismaClient } from "@prisma/client";
import { hash } from "@node-rs/argon2";
import crypto from "node:crypto";

const prisma = new PrismaClient();

// --- Envelope encryption for seed vault records (matches src/lib/crypto) ---
// KMS_PROVIDER=local → wrap DEK with LOCAL_KMS_MASTER_KEY (dev)
// KMS_PROVIDER=gcp   → wrap DEK with Cloud KMS via ADC metadata token
//                      (works inside a Cloud Run job)
function localMasterKey(): Buffer {
  const raw = process.env.LOCAL_KMS_MASTER_KEY;
  if (!raw) throw new Error("LOCAL_KMS_MASTER_KEY required for seeding vault demo data");
  return crypto.createHash("sha256").update(Buffer.from(raw, "utf8")).digest();
}

async function wrapDekGcp(dek: Buffer): Promise<{ wrapped: string; keyVersion: string }> {
  const project = process.env.GCP_PROJECT_ID;
  const location = process.env.KMS_LOCATION || "global";
  const ring = process.env.KMS_KEY_RING;
  const key = process.env.KMS_CRYPTO_KEY;
  if (!project || !ring || !key) {
    throw new Error("GCP_PROJECT_ID, KMS_KEY_RING, KMS_CRYPTO_KEY required when KMS_PROVIDER=gcp");
  }
  const tokenRes = await fetch(
    "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token",
    { headers: { "Metadata-Flavor": "Google" } }
  );
  if (!tokenRes.ok) throw new Error("Cannot obtain ADC token for KMS (run inside GCP)");
  const { access_token } = (await tokenRes.json()) as { access_token: string };
  const keyName = `projects/${project}/locations/${location}/keyRings/${ring}/cryptoKeys/${key}`;
  const res = await fetch(`https://cloudkms.googleapis.com/v1/${keyName}:encrypt`, {
    method: "POST",
    headers: { Authorization: `Bearer ${access_token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ plaintext: dek.toString("base64") }),
  });
  if (!res.ok) throw new Error(`Cloud KMS encrypt failed: ${res.status}`);
  const data = (await res.json()) as { ciphertext: string; name?: string };
  return { wrapped: data.ciphertext, keyVersion: data.name ?? keyName };
}

async function encryptSecretForSeed(plaintext: string) {
  const dek = crypto.randomBytes(32);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", dek, iv);
  const ct = Buffer.concat([cipher.update(Buffer.from(plaintext, "utf8")), cipher.final()]);
  const tag = cipher.getAuthTag();

  let dekEnc: string;
  let kmsKeyVersion: string;
  if ((process.env.KMS_PROVIDER || "local") === "gcp") {
    const wrapped = await wrapDekGcp(dek);
    dekEnc = wrapped.wrapped;
    kmsKeyVersion = wrapped.keyVersion;
  } else {
    const wiv = crypto.randomBytes(12);
    const wc = crypto.createCipheriv("aes-256-gcm", localMasterKey(), wiv);
    const wct = Buffer.concat([wc.update(dek), wc.final()]);
    const wtag = wc.getAuthTag();
    dekEnc = Buffer.concat([wiv, wtag, wct]).toString("base64");
    kmsKeyVersion = "local-1";
  }
  dek.fill(0);
  return {
    ciphertext: ct.toString("base64"),
    iv: iv.toString("base64"),
    authTag: tag.toString("base64"),
    dekEnc,
    kmsKeyVersion,
  };
}

// Same permission catalog as src/lib/permissions.ts (kept in sync manually —
// seed re-runs upsert so drift is corrected on next seed).
const PERMISSIONS = [
  "asset:read","asset:create","asset:update","asset:delete","asset:assign","asset:return","asset:transfer","asset:dispose","asset:export",
  "employee:read","employee:create","employee:update","employee:delete",
  "department:read","department:manage","location:read","location:manage",
  "vault:read","vault:create","vault:update","vault:delete","vault:reveal","vault:copy","vault:share","vault:rotate","vault:manage","vault:emergency","vault:audit",
  "license:read","license:manage","subscription:read","subscription:manage",
  "vendor:read","vendor:manage","maintenance:read","maintenance:manage",
  "procurement:read","procurement:create","procurement:approve",
  "report:read","report:export","audit:read","security:read",
  "user:manage","role:manage","settings:manage","offboarding:read","offboarding:manage",
];

const READ_ONLY = [
  "asset:read","employee:read","department:read","location:read","license:read",
  "subscription:read","vendor:read","maintenance:read","procurement:read","report:read",
];

const ROLE_PERMISSIONS: Record<string, string[]> = {
  SUPER_ADMIN: PERMISSIONS,
  ADMIN: PERMISSIONS.filter((p) => p !== "vault:emergency"),
  IT_MANAGER: [
    "asset:read","asset:create","asset:update","asset:delete","asset:assign","asset:return","asset:transfer","asset:dispose","asset:export",
    "employee:read","department:read","location:read","location:manage",
    "vault:read","vault:create","vault:update","vault:delete","vault:reveal","vault:copy","vault:share","vault:rotate","vault:manage","vault:emergency","vault:audit",
    "license:read","license:manage","subscription:read","subscription:manage",
    "vendor:read","vendor:manage","maintenance:read","maintenance:manage",
    "procurement:read","procurement:create","procurement:approve",
    "report:read","report:export","audit:read","security:read","offboarding:read","offboarding:manage",
  ],
  IT_STAFF: [
    "asset:read","asset:create","asset:update","asset:assign","asset:return","asset:transfer",
    "employee:read","department:read","location:read",
    "vault:read","vault:create","vault:update","vault:reveal","vault:copy",
    "license:read","subscription:read","vendor:read","maintenance:read","maintenance:manage",
    "procurement:read","procurement:create","report:read","offboarding:read",
  ],
  SECURITY_ADMIN: [
    "asset:read","employee:read","department:read","location:read",
    "vault:read","vault:reveal","vault:manage","vault:emergency","vault:audit",
    "audit:read","security:read","report:read","report:export","user:manage","role:manage",
  ],
  HR: [
    "employee:read","employee:create","employee:update","employee:delete",
    "department:read","location:read","asset:read","offboarding:read","offboarding:manage","report:read",
  ],
  FINANCE: [...READ_ONLY, "procurement:approve", "report:export"],
  MANAGER: [...READ_ONLY, "procurement:create", "procurement:approve"],
  EMPLOYEE: ["asset:read","vault:read","procurement:read","procurement:create"],
  AUDITOR: [...READ_ONLY, "audit:read","vault:audit","security:read","report:export"],
  VIEWER: READ_ONLY,
};

const ROLE_LABELS: Record<string, { en: string; th: string }> = {
  SUPER_ADMIN: { en: "Super Administrator", th: "ผู้ดูแลระบบสูงสุด" },
  ADMIN: { en: "Administrator", th: "ผู้ดูแลระบบ" },
  IT_MANAGER: { en: "IT Manager", th: "ผู้จัดการฝ่ายไอที" },
  IT_STAFF: { en: "IT Staff", th: "เจ้าหน้าที่ไอที" },
  SECURITY_ADMIN: { en: "Security Administrator", th: "ผู้ดูแลความปลอดภัย" },
  HR: { en: "Human Resources", th: "ฝ่ายบุคคล" },
  FINANCE: { en: "Finance", th: "ฝ่ายการเงิน" },
  MANAGER: { en: "Manager", th: "ผู้จัดการ" },
  EMPLOYEE: { en: "Employee", th: "พนักงาน" },
  AUDITOR: { en: "Auditor", th: "ผู้ตรวจสอบ" },
  VIEWER: { en: "Viewer", th: "ผู้ชม" },
};

async function main() {
  const adminPassword = process.env.SEED_ADMIN_PASSWORD;
  const userPassword = process.env.SEED_USER_PASSWORD;
  if (!adminPassword || !userPassword) {
    throw new Error(
      "SEED_ADMIN_PASSWORD and SEED_USER_PASSWORD must be set (see .env.example). Refusing to seed with hard-coded passwords."
    );
  }

  console.log("Seeding ITBox demo data...");

  // --- Organization ---
  const org = await prisma.organization.upsert({
    where: { slug: "demo-company" },
    update: {},
    create: { name: "Demo Company Co., Ltd.", slug: "demo-company" },
  });

  // --- Permissions ---
  for (const key of PERMISSIONS) {
    await prisma.permission.upsert({ where: { key }, update: {}, create: { key } });
  }
  const allPerms = await prisma.permission.findMany();
  const permByKey = new Map(allPerms.map((p) => [p.key, p.id]));

  // --- Roles ---
  const roleByKey = new Map<string, string>();
  for (const [key, perms] of Object.entries(ROLE_PERMISSIONS)) {
    const role = await prisma.role.upsert({
      where: { organizationId_key: { organizationId: org.id, key } },
      update: {},
      create: {
        organizationId: org.id,
        key,
        name: ROLE_LABELS[key].en,
        nameTh: ROLE_LABELS[key].th,
        isSystem: true,
      },
    });
    roleByKey.set(key, role.id);
    await prisma.rolePermission.deleteMany({ where: { roleId: role.id } });
    await prisma.rolePermission.createMany({
      data: perms.map((p) => ({ roleId: role.id, permissionId: permByKey.get(p)! })),
    });
  }

  // --- Departments ---
  const deptDefs = [
    { code: "IT", name: "Information Technology", division: "Operations", costCenter: "CC-100" },
    { code: "HR", name: "Human Resources", division: "Corporate", costCenter: "CC-200" },
    { code: "FIN", name: "Finance", division: "Corporate", costCenter: "CC-300" },
    { code: "SAL", name: "Sales", division: "Commercial", costCenter: "CC-400" },
    { code: "MKT", name: "Marketing", division: "Commercial", costCenter: "CC-500" },
    { code: "OPS", name: "Operations", division: "Operations", costCenter: "CC-600" },
  ];
  const deptByCode = new Map<string, string>();
  for (const d of deptDefs) {
    const dept = await prisma.department.upsert({
      where: { organizationId_code: { organizationId: org.id, code: d.code } },
      update: {},
      create: { organizationId: org.id, ...d },
    });
    deptByCode.set(d.code, dept.id);
  }

  // --- Locations ---
  const locDefs = [
    { code: "HQ", name: "Head Office", address: "Bangkok", building: "Tower A", floor: "12" },
    { code: "BR1", name: "Branch 1", address: "Chiang Mai", building: "Main", floor: "2" },
    { code: "DC", name: "Data Center", address: "Bangkok", building: "DC Building", floor: "1" },
  ];
  const locByCode = new Map<string, string>();
  for (const l of locDefs) {
    const loc = await prisma.location.upsert({
      where: { organizationId_code: { organizationId: org.id, code: l.code } },
      update: {},
      create: { organizationId: org.id, ...l },
    });
    locByCode.set(l.code, loc.id);
  }

  // --- Users + Employees ---
  const adminHash = await hash(adminPassword);
  const userHash = await hash(userPassword);
  const userDefs = [
    { email: "admin@example.com", name: "System Administrator", role: "SUPER_ADMIN", dept: "IT", code: "EMP-0001", pos: "System Administrator", hash: adminHash },
    { email: "itmanager@example.com", name: "Somchai Jaidee", role: "IT_MANAGER", dept: "IT", code: "EMP-0002", pos: "IT Manager", hash: userHash },
    { email: "itstaff@example.com", name: "Suda Rakdee", role: "IT_STAFF", dept: "IT", code: "EMP-0003", pos: "IT Support", hash: userHash },
    { email: "security@example.com", name: "Prasert Plodpai", role: "SECURITY_ADMIN", dept: "IT", code: "EMP-0004", pos: "Security Officer", hash: userHash },
    { email: "hr@example.com", name: "Malee Sukjai", role: "HR", dept: "HR", code: "EMP-0005", pos: "HR Officer", hash: userHash },
    { email: "employee@example.com", name: "Wichai Tummada", role: "EMPLOYEE", dept: "SAL", code: "EMP-0006", pos: "Sales Executive", hash: userHash },
  ];
  const userByEmail = new Map<string, string>();
  const employeeByCode = new Map<string, string>();
  for (const u of userDefs) {
    const user = await prisma.user.upsert({
      where: { email: u.email },
      update: {},
      create: {
        organizationId: org.id,
        email: u.email,
        name: u.name,
        passwordHash: u.hash,
      },
    });
    userByEmail.set(u.email, user.id);
    await prisma.userRole.upsert({
      where: { userId_roleId: { userId: user.id, roleId: roleByKey.get(u.role)! } },
      update: {},
      create: { userId: user.id, roleId: roleByKey.get(u.role)! },
    });
    const [firstName, ...rest] = u.name.split(" ");
    const emp = await prisma.employee.upsert({
      where: { organizationId_employeeCode: { organizationId: org.id, employeeCode: u.code } },
      update: {},
      create: {
        organizationId: org.id,
        employeeCode: u.code,
        firstName,
        lastName: rest.join(" ") || "-",
        email: u.email,
        position: u.pos,
        departmentId: deptByCode.get(u.dept),
        locationId: locByCode.get("HQ"),
        userId: user.id,
        startDate: new Date("2023-01-16"),
      },
    });
    employeeByCode.set(u.code, emp.id);
  }
  // Extra employees without user accounts
  for (let i = 7; i <= 14; i++) {
    const code = `EMP-${String(i).padStart(4, "0")}`;
    const depts = ["SAL", "MKT", "OPS", "FIN"];
    const emp = await prisma.employee.upsert({
      where: { organizationId_employeeCode: { organizationId: org.id, employeeCode: code } },
      update: {},
      create: {
        organizationId: org.id,
        employeeCode: code,
        firstName: `Demo${i}`,
        lastName: "Employee",
        email: `demo${i}@example.com`,
        position: "Staff",
        departmentId: deptByCode.get(depts[i % depts.length]),
        locationId: locByCode.get(i % 3 === 0 ? "BR1" : "HQ"),
        startDate: new Date("2024-05-01"),
      },
    });
    employeeByCode.set(code, emp.id);
  }

  // --- Asset categories ---
  const catNames = ["Laptop","Desktop","Monitor","Printer","Server","Network","Mobile","Tablet","Software","Other"];
  const catByName = new Map<string, string>();
  for (const name of catNames) {
    const c = await prisma.assetCategory.upsert({
      where: { organizationId_name: { organizationId: org.id, name } },
      update: {},
      create: { organizationId: org.id, name },
    });
    catByName.set(name, c.id);
  }

  // --- Vendors ---
  const vendorDefs = [
    { name: "TechSupply Co., Ltd.", category: "Hardware", email: "sales@techsupply.example", phone: "02-111-1111", taxId: "0105500000001" },
    { name: "SoftHouse Ltd.", category: "Software", email: "contact@softhouse.example", phone: "02-222-2222", taxId: "0105500000002" },
    { name: "NetPro Services", category: "Network", email: "info@netpro.example", phone: "02-333-3333", taxId: "0105500000003" },
  ];
  const vendorIds: string[] = [];
  for (const v of vendorDefs) {
    const existing = await prisma.vendor.findFirst({ where: { organizationId: org.id, name: v.name } });
    const vendor = existing ?? (await prisma.vendor.create({ data: { organizationId: org.id, ...v } }));
    vendorIds.push(vendor.id);
  }

  // --- Assets (30+) ---
  const assetCount = await prisma.asset.count({ where: { organizationId: org.id } });
  if (assetCount < 30) {
    const mk = (i: number) => {
      const defs = [
        { cat: "Laptop", name: "Dell Latitude 5440", brand: "Dell", model: "Latitude 5440", price: 42000 },
        { cat: "Laptop", name: "Lenovo ThinkPad T14", brand: "Lenovo", model: "T14 Gen 4", price: 45000 },
        { cat: "Desktop", name: "HP ProDesk 400", brand: "HP", model: "ProDesk 400 G9", price: 25000 },
        { cat: "Monitor", name: "Dell 24\" Monitor", brand: "Dell", model: "P2422H", price: 6500 },
        { cat: "Printer", name: "Brother Laser Printer", brand: "Brother", model: "HL-L2375DW", price: 5900 },
        { cat: "Server", name: "Dell PowerEdge R650", brand: "Dell", model: "R650", price: 350000 },
        { cat: "Network", name: "Cisco Switch 24-port", brand: "Cisco", model: "C1000-24T", price: 28000 },
        { cat: "Mobile", name: "iPhone 15", brand: "Apple", model: "iPhone 15", price: 32900 },
        { cat: "Tablet", name: "iPad 10th Gen", brand: "Apple", model: "iPad 10", price: 15900 },
      ];
      return defs[i % defs.length];
    };
    const statuses = ["AVAILABLE","IN_USE","IN_USE","AVAILABLE","IN_USE","IN_REPAIR","AVAILABLE","IN_USE"] as const;
    for (let i = 1; i <= 34; i++) {
      const d = mk(i);
      const tag = `IT-${String(i).padStart(4, "0")}`;
      const status = statuses[i % statuses.length];
      const purchaseDate = new Date(2023, (i % 12), 10);
      const isServer = d.cat === "Server";
      await prisma.asset.upsert({
        where: { organizationId_assetTag: { organizationId: org.id, assetTag: tag } },
        update: {},
        create: {
          organizationId: org.id,
          assetTag: tag,
          serialNumber: `SN-2023-${String(10000 + i)}`,
          name: d.name,
          brand: d.brand,
          model: d.model,
          status,
          condition: i % 7 === 0 ? "FAIR" : "GOOD",
          categoryId: catByName.get(d.cat),
          departmentId: deptByCode.get(isServer ? "IT" : ["IT","SAL","MKT","HR","FIN","OPS"][i % 6]),
          locationId: locByCode.get(isServer ? "DC" : i % 3 === 0 ? "BR1" : "HQ"),
          vendorId: vendorIds[i % vendorIds.length],
          purchaseDate,
          purchasePrice: d.price,
          currentValue: Math.round(d.price * 0.7),
          depreciationMonths: 36,
          invoiceNumber: `INV-2023-${String(i).padStart(3, "0")}`,
          warrantyStart: purchaseDate,
          warrantyEnd: new Date(2026, 7 + (i % 6), 10),
          ipAddress: isServer ? `10.10.10.${i}` : null,
        },
      });
    }
    // Special production server for vault-link demo
    await prisma.asset.upsert({
      where: { organizationId_assetTag: { organizationId: org.id, assetTag: "IT-SRV-001" } },
      update: {},
      create: {
        organizationId: org.id,
        assetTag: "IT-SRV-001",
        serialNumber: "SN-SRV-90001",
        name: "Production Server",
        brand: "Dell",
        model: "PowerEdge R650",
        status: "IN_USE",
        condition: "GOOD",
        categoryId: catByName.get("Server"),
        departmentId: deptByCode.get("IT"),
        locationId: locByCode.get("DC"),
        vendorId: vendorIds[0],
        purchaseDate: new Date("2024-02-01"),
        purchasePrice: 380000,
        currentValue: 300000,
        warrantyStart: new Date("2024-02-01"),
        warrantyEnd: new Date("2027-02-01"),
        ipAddress: "10.10.10.10",
        specification: "2x Xeon Silver 4310, 128GB RAM, 4x 1.92TB SSD",
      },
    });
  }

  // --- Vault categories ---
  const vcatNames = ["Server","Network","Firewall","Database","Cloud","Website","VPN","WiFi","CCTV","NVR","Application","API","SSH","Other"];
  const vcatByName = new Map<string, string>();
  for (const name of vcatNames) {
    const c = await prisma.vaultCategory.upsert({
      where: { organizationId_name: { organizationId: org.id, name } },
      update: {},
      create: { organizationId: org.id, name, isSystem: true },
    });
    vcatByName.set(name, c.id);
  }

  // --- Vault items (FAKE DEMO SECRETS ONLY) ---
  const itManagerId = userByEmail.get("itmanager@example.com")!;
  const vaultCount = await prisma.vaultItem.count({ where: { organizationId: org.id } });
  if (vaultCount === 0) {
    const vaultDefs: Array<{
      name: string; type: string; cat: string; cls: string; username?: string;
      host?: string; port?: number; protocol?: string; url?: string; env?: string;
      secret: Record<string, string>; rotationDays?: number; linkToServer?: string;
    }> = [
      { name: "Windows Administrator — Production Server", type: "SERVER", cat: "Server", cls: "HIGH", username: "administrator", host: "10.10.10.10", port: 3389, protocol: "RDP", env: "Production", secret: { password: "FAKE-DEMO-PASSWORD-001" }, rotationDays: 90, linkToServer: "Windows Administrator" },
      { name: "SSH Root — Production Server", type: "SSH_KEY", cat: "SSH", cls: "CRITICAL", username: "root", host: "10.10.10.10", port: 22, protocol: "SSH", env: "Production", secret: { password: "FAKE-DEMO-PASSWORD-002", sshPrivateKey: "-----BEGIN OPENSSH PRIVATE KEY-----\nFAKE-DEMO-KEY-NOT-REAL\n-----END OPENSSH PRIVATE KEY-----" }, rotationDays: 90, linkToServer: "SSH Root" },
      { name: "Database SA — Production Server", type: "DATABASE", cat: "Database", cls: "CRITICAL", username: "sa", host: "10.10.10.10", port: 5432, protocol: "PostgreSQL", env: "Production", secret: { password: "FAKE-DEMO-PASSWORD-003" }, rotationDays: 90, linkToServer: "Database SA" },
      { name: "iDRAC Administrator — Production Server", type: "SERVER", cat: "Server", cls: "HIGH", username: "root", host: "10.10.10.11", port: 443, protocol: "HTTPS", env: "Production", secret: { password: "FAKE-DEMO-PASSWORD-004" }, rotationDays: 180, linkToServer: "iDRAC Administrator" },
      { name: "Office WiFi", type: "WIFI", cat: "WiFi", cls: "LOW", username: "DemoCompany-Staff", env: "Production", secret: { password: "FAKE-DEMO-WIFI-PASS" }, rotationDays: 180 },
      { name: "Firewall Admin", type: "NETWORK_DEVICE", cat: "Firewall", cls: "CRITICAL", username: "admin", host: "10.10.1.1", port: 443, protocol: "HTTPS", env: "Production", secret: { password: "FAKE-DEMO-PASSWORD-005" }, rotationDays: 90 },
      { name: "Core Switch Admin", type: "NETWORK_DEVICE", cat: "Network", cls: "HIGH", username: "admin", host: "10.10.1.2", port: 22, protocol: "SSH", env: "Production", secret: { password: "FAKE-DEMO-PASSWORD-006" }, rotationDays: 90 },
      { name: "Company Website Admin", type: "PASSWORD", cat: "Website", cls: "MEDIUM", username: "webadmin", url: "https://www.example.com/wp-admin", env: "Production", secret: { password: "FAKE-DEMO-PASSWORD-007" }, rotationDays: 60 },
      { name: "GCP Service Console", type: "PASSWORD", cat: "Cloud", cls: "HIGH", username: "cloud-admin@example.com", url: "https://console.cloud.google.com", env: "Production", secret: { password: "FAKE-DEMO-PASSWORD-008" }, rotationDays: 90 },
      { name: "Payment Gateway API Key", type: "API_KEY", cat: "API", cls: "HIGH", env: "Production", url: "https://api.payment.example", secret: { apiKey: "FAKE-DEMO-API-KEY-aaaa-bbbb-cccc" }, rotationDays: 90 },
      { name: "CCTV NVR Admin", type: "PASSWORD", cat: "NVR", cls: "MEDIUM", username: "admin", host: "10.10.5.100", port: 8000, env: "Production", secret: { password: "FAKE-DEMO-PASSWORD-009" }, rotationDays: 180 },
      { name: "VPN Gateway", type: "PASSWORD", cat: "VPN", cls: "HIGH", username: "vpnadmin", host: "vpn.example.com", port: 443, protocol: "HTTPS", env: "Production", secret: { password: "FAKE-DEMO-PASSWORD-010" }, rotationDays: 90 },
    ];
    const srvAsset = await prisma.asset.findFirst({
      where: { organizationId: org.id, assetTag: "IT-SRV-001" },
    });
    for (const v of vaultDefs) {
      const enc = await encryptSecretForSeed(JSON.stringify(v.secret));
      const item = await prisma.vaultItem.create({
        data: {
          organizationId: org.id,
          name: v.name,
          type: v.type as never,
          classification: v.cls as never,
          categoryId: vcatByName.get(v.cat),
          departmentId: deptByCode.get("IT"),
          ownerId: itManagerId,
          createdById: itManagerId,
          updatedById: itManagerId,
          environment: v.env,
          url: v.url,
          host: v.host,
          port: v.port,
          protocol: v.protocol,
          username: v.username,
          notes: "FAKE demo record — not a real credential.",
          ciphertext: enc.ciphertext,
          iv: enc.iv,
          authTag: enc.authTag,
          dekEnc: enc.dekEnc,
          kmsKeyVersion: enc.kmsKeyVersion,
          rotationDays: v.rotationDays,
          lastRotatedAt: new Date("2026-05-01"),
          nextRotationAt: v.rotationDays
            ? new Date(new Date("2026-05-01").getTime() + v.rotationDays * 86_400_000)
            : null,
          requireMfaToReveal: v.cls === "CRITICAL",
        },
      });
      if (srvAsset && v.linkToServer) {
        await prisma.assetVaultLink.upsert({
          where: { assetId_vaultItemId: { assetId: srvAsset.id, vaultItemId: item.id } },
          update: {},
          create: { assetId: srvAsset.id, vaultItemId: item.id, label: v.linkToServer },
        });
      }
    }
  }

  // --- Licenses & subscriptions ---
  if ((await prisma.license.count({ where: { organizationId: org.id } })) === 0) {
    await prisma.license.createMany({
      data: [
        { organizationId: org.id, softwareName: "Microsoft Office LTSC 2024", vendorId: vendorIds[1], licenseType: "VOLUME", totalSeats: 50, purchaseDate: new Date("2025-01-15"), expiresAt: null, cost: 250000 },
        { organizationId: org.id, softwareName: "Adobe Creative Cloud", vendorId: vendorIds[1], licenseType: "SUBSCRIPTION", totalSeats: 10, startDate: new Date("2026-01-01"), expiresAt: new Date("2026-12-31"), cost: 120000, renewalCost: 120000, autoRenewal: true },
        { organizationId: org.id, softwareName: "AutoCAD LT", vendorId: vendorIds[1], licenseType: "SUBSCRIPTION", totalSeats: 5, startDate: new Date("2025-09-01"), expiresAt: new Date("2026-08-31"), cost: 90000 },
      ],
    });
  }
  if ((await prisma.subscription.count({ where: { organizationId: org.id } })) === 0) {
    await prisma.subscription.createMany({
      data: [
        { organizationId: org.id, serviceName: "Google Workspace", plan: "Business Standard", quantity: 60, cost: 43200, billingCycle: "YEARLY", startDate: new Date("2025-10-01"), renewalDate: new Date("2026-10-01"), ownerId: itManagerId },
        { organizationId: org.id, serviceName: "Microsoft 365", plan: "Business Basic", quantity: 20, cost: 30000, billingCycle: "YEARLY", startDate: new Date("2025-11-01"), renewalDate: new Date("2026-11-01"), ownerId: itManagerId },
        { organizationId: org.id, serviceName: "Antivirus Enterprise", plan: "Endpoint Protection", quantity: 80, cost: 56000, billingCycle: "YEARLY", startDate: new Date("2025-09-15"), renewalDate: new Date("2026-09-15"), ownerId: itManagerId },
      ],
    });
  }

  // --- Maintenance ticket demo ---
  if ((await prisma.maintenanceTicket.count({ where: { organizationId: org.id } })) === 0) {
    const repairAsset = await prisma.asset.findFirst({
      where: { organizationId: org.id, status: "IN_REPAIR" },
    });
    if (repairAsset) {
      await prisma.maintenanceTicket.create({
        data: {
          organizationId: org.id,
          ticketNumber: "MT-2026-0001",
          assetId: repairAsset.id,
          problem: "เครื่องเปิดไม่ติด / Does not power on",
          priority: "HIGH",
          status: "IN_PROGRESS",
          reportedById: userByEmail.get("employee@example.com"),
          vendorId: vendorIds[0],
          startedAt: new Date(),
        },
      });
    }
  }

  console.log("Seed completed.");
  console.log("Demo users: admin@example.com (SEED_ADMIN_PASSWORD), itmanager/itstaff/security/hr/employee@example.com (SEED_USER_PASSWORD)");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
