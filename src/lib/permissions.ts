/**
 * RBAC permission catalog. Permission keys are `<resource>:<action>`.
 * Roles are seeded per-organization and mapped to permission sets below.
 */

export const PERMISSIONS = [
  // Assets
  "asset:read", "asset:create", "asset:update", "asset:delete",
  "asset:assign", "asset:return", "asset:transfer", "asset:dispose", "asset:export",
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
  // Admin
  "user:manage", "role:manage", "settings:manage",
  "offboarding:read", "offboarding:manage",
] as const;

export type PermissionKey = (typeof PERMISSIONS)[number];

const ALL = [...PERMISSIONS] as PermissionKey[];

const READ_ONLY: PermissionKey[] = [
  "asset:read", "employee:read", "department:read", "location:read",
  "license:read", "subscription:read", "vendor:read", "maintenance:read",
  "procurement:read", "report:read",
  "network:read", "change:read", "backup:read", "contract:read",
];

/** Default permission sets per system role key. */
export const ROLE_PERMISSIONS: Record<string, PermissionKey[]> = {
  SUPER_ADMIN: ALL,
  ADMIN: ALL.filter((p) => p !== "vault:emergency"),
  IT_MANAGER: [
    "asset:read", "asset:create", "asset:update", "asset:delete",
    "asset:assign", "asset:return", "asset:transfer", "asset:dispose", "asset:export",
    "employee:read", "department:read", "location:read", "location:manage",
    "vault:read", "vault:create", "vault:update", "vault:delete",
    "vault:reveal", "vault:copy", "vault:share", "vault:rotate",
    "vault:manage", "vault:emergency", "vault:audit",
    "license:read", "license:manage", "subscription:read", "subscription:manage",
    "vendor:read", "vendor:manage", "maintenance:read", "maintenance:manage",
    "procurement:read", "procurement:create", "procurement:approve",
    "report:read", "report:export", "audit:read", "security:read",
    "support:create", "support:read", "support:work", "support:manage", "support:settings",
    "offboarding:read", "offboarding:manage",
    "network:read", "network:manage", "change:read", "change:manage", "change:approve",
    "backup:read", "backup:manage", "contract:read", "contract:manage",
  ],
  IT_STAFF: [
    "asset:read", "asset:create", "asset:update",
    "asset:assign", "asset:return", "asset:transfer",
    "employee:read", "department:read", "location:read",
    "vault:read", "vault:create", "vault:update", "vault:reveal", "vault:copy",
    "license:read", "subscription:read",
    "vendor:read", "maintenance:read", "maintenance:manage",
    "procurement:read", "procurement:create",
    "support:create", "support:read", "support:work",
    "report:read", "offboarding:read",
    "network:read", "network:manage", "change:read", "change:manage",
    "backup:read", "backup:manage", "contract:read",
  ],
  SECURITY_ADMIN: [
    "asset:read", "employee:read", "department:read", "location:read",
    "vault:read", "vault:reveal", "vault:manage", "vault:emergency", "vault:audit",
    "audit:read", "security:read", "report:read", "report:export",
    "support:read", "support:work",
    "user:manage", "role:manage",
  ],
  HR: [
    "employee:read", "employee:create", "employee:update", "employee:delete",
    "department:read", "location:read", "asset:read",
    "offboarding:read", "offboarding:manage", "report:read", "support:create",
  ],
  FINANCE: [
    ...READ_ONLY, "procurement:approve", "report:export", "support:create",
  ],
  MANAGER: [
    ...READ_ONLY, "procurement:create", "procurement:approve", "support:create", "support:read",
  ],
  EMPLOYEE: [
    "asset:read", "vault:read", "procurement:read", "procurement:create", "support:create",
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
