/**
 * RBAC permission catalog. Permission keys are `<resource>:<action>`.
 * Roles are seeded per-organization and mapped to permission sets below.
 */

export const PERMISSIONS = [
  // Assets
  "asset:read", "asset:create", "asset:update", "asset:delete",
  "asset:assign", "asset:return", "asset:transfer", "asset:dispose", "asset:export",
  // Asset borrowing & return (temporary loans)
  "borrow:read", "borrow:create", "borrow:approve",
  "borrow:issue", "borrow:return", "borrow:manage", "borrow:export",
  // People & org structure
  "employee:read", "employee:create", "employee:update", "employee:delete",
  "department:read", "department:manage",
  "location:read", "location:manage",
  // Vault
  "vault:read", "vault:create", "vault:update", "vault:delete",
  "vault:reveal", "vault:copy", "vault:share", "vault:rotate",
  "vault:manage", "vault:emergency", "vault:audit",
  // Licenses & subscriptions
  "license:read", "license:manage",
  "subscription:read", "subscription:manage",
  // SIM / phone-line registry
  "sim:read", "sim:manage",
  // Vendors / maintenance / procurement
  "vendor:read", "vendor:manage",
  "maintenance:read", "maintenance:manage",
  "procurement:read", "procurement:create", "procurement:approve",
  // Reports / audit / security
  "report:read", "report:export",
  "audit:read",
  "security:read",
  // IT Support / ITSM
  "support:create", "support:read", "support:work",
  "support:manage", "support:settings",
  // Network & IPAM
  "network:read", "network:manage",
  // Change management
  "change:read", "change:manage", "change:approve",
  // Backup & DR
  "backup:read", "backup:manage",
  // Contracts
  "contract:read", "contract:manage",
  // Problem / Knowledge base / Vulnerability
  "problem:read", "problem:manage",
  "kb:read", "kb:manage",
  "vuln:read", "vuln:manage",
  // CMDB
  "cmdb:read", "cmdb:manage",
  // Onboarding / Service catalog / Monitoring & EDR
  "onboarding:read", "onboarding:manage",
  "catalog:read", "catalog:manage",
  "monitoring:read",
  // CCTV monitoring
  "cctv:view", "cctv:manage",
  // Access-request profiles (RBAC matrix)
  "permprofile:manage", "accessreq:read", "accessreq:manage",
  // Admin
  "user:manage", "role:manage", "settings:manage",
  "offboarding:read", "offboarding:manage",
] as const;

export type PermissionKey = (typeof PERMISSIONS)[number];

const ALL = [...PERMISSIONS] as PermissionKey[];

const READ_ONLY: PermissionKey[] = [
  "asset:read", "borrow:read", "employee:read", "department:read", "location:read",
  "license:read", "subscription:read", "vendor:read", "maintenance:read",
  "procurement:read", "report:read", "sim:read",
  "network:read", "change:read", "backup:read", "contract:read",
  "problem:read", "kb:read", "vuln:read", "cmdb:read",
  "onboarding:read", "catalog:read", "monitoring:read", "cctv:view",
];

/** Default permission sets per system role key. */
export const ROLE_PERMISSIONS: Record<string, PermissionKey[]> = {
  SUPER_ADMIN: ALL,
  ADMIN: ALL.filter((p) => p !== "vault:emergency"),
  IT_MANAGER: [
    "asset:read", "asset:create", "asset:update", "asset:delete",
    "asset:assign", "asset:return", "asset:transfer", "asset:dispose", "asset:export",
    "borrow:read", "borrow:create", "borrow:approve", "borrow:issue", "borrow:return", "borrow:manage", "borrow:export",
    "employee:read", "department:read", "location:read", "location:manage",
    "vault:read", "vault:create", "vault:update", "vault:delete",
    "vault:reveal", "vault:copy", "vault:share", "vault:rotate",
    "vault:manage", "vault:emergency", "vault:audit",
    "license:read", "license:manage", "subscription:read", "subscription:manage",
    "vendor:read", "vendor:manage", "maintenance:read", "maintenance:manage",
    "sim:read", "sim:manage",
    "procurement:read", "procurement:create", "procurement:approve",
    "report:read", "report:export", "audit:read", "security:read",
    "support:create", "support:read", "support:work", "support:manage", "support:settings",
    "offboarding:read", "offboarding:manage",
    "network:read", "network:manage", "change:read", "change:manage", "change:approve",
    "backup:read", "backup:manage", "contract:read", "contract:manage",
    "problem:read", "problem:manage", "kb:read", "kb:manage", "vuln:read", "vuln:manage",
    "cmdb:read", "cmdb:manage",
    "onboarding:read", "onboarding:manage", "catalog:read", "catalog:manage", "monitoring:read",
    "cctv:view", "cctv:manage",
    "permprofile:manage", "accessreq:read", "accessreq:manage",
  ],
  IT_STAFF: [
    "asset:read", "asset:create", "asset:update",
    "asset:assign", "asset:return", "asset:transfer",
    "borrow:read", "borrow:create", "borrow:issue", "borrow:return",
    "employee:read", "department:read", "location:read",
    "vault:read", "vault:create", "vault:update", "vault:reveal", "vault:copy",
    "license:read", "subscription:read",
    "vendor:read", "maintenance:read", "maintenance:manage",
    "sim:read", "sim:manage",
    "procurement:read", "procurement:create",
    "support:create", "support:read", "support:work",
    "report:read", "offboarding:read", "offboarding:manage",
    "network:read", "network:manage", "change:read", "change:manage",
    "backup:read", "backup:manage", "contract:read",
    "problem:read", "problem:manage", "kb:read", "kb:manage", "vuln:read", "vuln:manage",
    "cmdb:read", "cmdb:manage",
    "onboarding:read", "onboarding:manage", "catalog:read", "monitoring:read",
    "cctv:view", "cctv:manage",
    "accessreq:read", "accessreq:manage",
  ],
  SECURITY_ADMIN: [
    "asset:read", "employee:read", "department:read", "location:read",
    "vault:read", "vault:reveal", "vault:manage", "vault:emergency", "vault:audit",
    "audit:read", "security:read", "report:read", "report:export",
    "support:read", "support:work",
    "user:manage", "role:manage",
    "monitoring:read", "cctv:view",
  ],
  HR: [
    "employee:read", "employee:create", "employee:update", "employee:delete",
    "department:read", "location:read", "asset:read", "borrow:read",
    "offboarding:read", "offboarding:manage", "report:read", "support:create",
    "onboarding:read", "onboarding:manage", "catalog:read",
  ],
  FINANCE: [
    ...READ_ONLY, "procurement:approve", "report:export", "support:create",
  ],
  MANAGER: [
    ...READ_ONLY, "procurement:create", "procurement:approve", "support:create", "support:read",
    "borrow:create", "borrow:approve",
  ],
  EMPLOYEE: [
    "asset:read", "vault:read", "procurement:read", "procurement:create", "support:create",
    "borrow:read", "borrow:create",
  ],
  AUDITOR: [
    ...READ_ONLY, "audit:read", "vault:audit", "security:read", "report:export",
  ],
  VIEWER: READ_ONLY,
};

export const ROLE_LABELS: Record<string, { en: string; th: string }> = {
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
