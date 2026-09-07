/**
 * Recommended DEFAULT permission profiles for the Information-System Access
 * Request form (form 4.A). GENERATED from GTG_Permission_Matrix_Recommended.xlsx
 * by scripts/gen-matrix-defaults.mts — do not edit by hand; re-run the generator.
 *
 * Each profile maps to the exact set of form checkbox names to tick. This is a
 * DOCUMENT default only (pre-fills the request form); it grants no real access.
 * Access codes were mapped: V→Enabled+ReadOnly, E/A/T→Enabled (ERP);
 * A/T→Admin, E→Editor, V→Viewer (Marketing); R→role (Venio/Horganice).
 */

export interface MatrixProfile { code: string; name: string; department: string; scope: string }

export const MATRIX_PROFILES: MatrixProfile[] = [
  {
    "code": "ACC-STAFF",
    "name": "Accounting Staff",
    "department": "Accounting",
    "scope": "DEPARTMENT"
  },
  {
    "code": "ACC-MANAGER",
    "name": "Accounting / Finance Manager",
    "department": "Accounting & Financial",
    "scope": "DEPARTMENT"
  },
  {
    "code": "AGENCY-SUPPORT",
    "name": "Agency Support",
    "department": "Agency Support",
    "scope": "ASSIGNED_PROJECTS"
  },
  {
    "code": "PROJECT-MANAGER",
    "name": "Project Manager",
    "department": "Construction",
    "scope": "ASSIGNED_PROJECTS"
  },
  {
    "code": "PROJECT-STAFF",
    "name": "Project Staff",
    "department": "Construction",
    "scope": "ASSIGNED_PROJECTS"
  },
  {
    "code": "FIN-STAFF",
    "name": "Finance Staff",
    "department": "Finance",
    "scope": "DEPARTMENT"
  },
  {
    "code": "HR-MANAGER",
    "name": "HR Manager",
    "department": "HR",
    "scope": "DEPARTMENT"
  },
  {
    "code": "HR-STAFF",
    "name": "HR Staff",
    "department": "HR",
    "scope": "DEPARTMENT"
  },
  {
    "code": "IT-ADMIN",
    "name": "IT Admin (Technical)",
    "department": "IT",
    "scope": "COMPANY_WIDE_TECHNICAL"
  },
  {
    "code": "IT-SUPPORT",
    "name": "IT Support",
    "department": "IT",
    "scope": "COMPANY_WIDE_SUPPORT"
  },
  {
    "code": "WEB-DEVELOPER",
    "name": "Web Developer",
    "department": "IT",
    "scope": "SELECTED_PROJECTS"
  },
  {
    "code": "MANAGEMENT-VIEWER",
    "name": "Management Viewer",
    "department": "Management",
    "scope": "COMPANY_WIDE_READ_ONLY"
  },
  {
    "code": "MKT-CONTENT-STAFF",
    "name": "Content Creator",
    "department": "Marketing",
    "scope": "ASSIGNED_PROJECTS"
  },
  {
    "code": "MKT-DIGITAL-STAFF",
    "name": "Digital / Performance Marketing",
    "department": "Marketing",
    "scope": "ALL_PROJECTS"
  },
  {
    "code": "MKT-GRAPHIC-STAFF",
    "name": "Graphic Designer",
    "department": "Marketing",
    "scope": "ASSIGNED_PROJECTS"
  },
  {
    "code": "MKT-MANAGER",
    "name": "Marketing Manager",
    "department": "Marketing",
    "scope": "DEPARTMENT"
  },
  {
    "code": "MKT-SOCIAL-STAFF",
    "name": "Social Media Specialist",
    "department": "Marketing",
    "scope": "ALL_PROJECTS"
  },
  {
    "code": "MKT-WEB-STAFF",
    "name": "UX/UI Website",
    "department": "Marketing",
    "scope": "SELECTED_PROJECTS"
  },
  {
    "code": "PROCUREMENT-MANAGER",
    "name": "Procurement Manager",
    "department": "Procurement",
    "scope": "DEPARTMENT"
  },
  {
    "code": "PROCUREMENT-STAFF",
    "name": "Procurement Staff",
    "department": "Procurement",
    "scope": "DEPARTMENT"
  },
  {
    "code": "RENTAL-STAFF",
    "name": "Rental Staff",
    "department": "Rental",
    "scope": "ASSIGNED_PROJECTS"
  },
  {
    "code": "SALE-CLOSER",
    "name": "Closer / Senior Sales",
    "department": "Sales",
    "scope": "OWN_TEAM"
  },
  {
    "code": "SALE-COORDINATOR",
    "name": "Sales Coordinator",
    "department": "Sales",
    "scope": "OWN_TEAM"
  },
  {
    "code": "SALE-MANAGER",
    "name": "Sales Manager",
    "department": "Sales",
    "scope": "OWN_TEAM"
  },
  {
    "code": "SALE-REP",
    "name": "Sales Representative",
    "department": "Sales",
    "scope": "OWN_DATA"
  }
];

/** profile code → list of form checkbox `name`s to check. */
export const PROFILE_DEFAULT_SELECTIONS: Record<string, string[]> = {"ACC-STAFF":["erp:AP:0:enabled","erp:AP:10:enabled","erp:AP:11:enabled","erp:AP:11:readOnly","erp:AP:12:enabled","erp:AP:12:readOnly","erp:AP:13:enabled","erp:AP:13:readOnly","erp:AP:14:enabled","erp:AP:14:readOnly","erp:AP:15:enabled","erp:AP:15:readOnly","erp:AP:16:enabled","erp:AP:16:readOnly","erp:AP:17:enabled","erp:AP:17:readOnly","erp:AP:1:enabled","erp:AP:2:enabled","erp:AP:3:enabled","erp:AP:3:readOnly","erp:AP:4:enabled","erp:AP:4:readOnly","erp:AP:5:enabled","erp:AP:5:readOnly","erp:AP:6:enabled","erp:AP:7:enabled","erp:AP:8:enabled","erp:AP:9:enabled","erp:AR:0:enabled","erp:AR:10:enabled","erp:AR:10:readOnly","erp:AR:11:enabled","erp:AR:11:readOnly","erp:AR:12:enabled","erp:AR:12:readOnly","erp:AR:13:enabled","erp:AR:13:readOnly","erp:AR:1:enabled","erp:AR:2:enabled","erp:AR:3:enabled","erp:AR:4:enabled","erp:AR:4:readOnly","erp:AR:5:enabled","erp:AR:5:readOnly","erp:AR:6:enabled","erp:AR:7:enabled","erp:AR:8:enabled","erp:AR:8:readOnly","erp:AR:9:enabled","erp:AR:9:readOnly","erp:FA:0:enabled","erp:FA:1:enabled","erp:FA:2:enabled","erp:FA:3:enabled","erp:FA:4:enabled","erp:FA:5:enabled","erp:FA:5:readOnly","erp:FA:6:enabled","erp:FA:6:readOnly","erp:FA:7:enabled","erp:FA:7:readOnly","erp:FA:8:enabled","erp:FA:8:readOnly","erp:FA:9:enabled","erp:FA:9:readOnly","erp:FIN:0:enabled","erp:FIN:0:readOnly","erp:FIN:1:enabled","erp:FIN:1:readOnly","erp:FIN:2:enabled","erp:FIN:2:readOnly","erp:FIN:3:enabled","erp:FIN:3:readOnly","erp:FIN:4:enabled","erp:FIN:4:readOnly","erp:FIN:5:enabled","erp:FIN:5:readOnly","erp:FIN:6:enabled","erp:FIN:6:readOnly","erp:GL:0:enabled","erp:GL:10:enabled","erp:GL:10:readOnly","erp:GL:11:enabled","erp:GL:11:readOnly","erp:GL:1:enabled","erp:GL:1:readOnly","erp:GL:2:enabled","erp:GL:3:enabled","erp:GL:4:enabled","erp:GL:5:enabled","erp:GL:5:readOnly","erp:GL:6:enabled","erp:GL:6:readOnly","erp:GL:7:enabled","erp:GL:7:readOnly","erp:GL:8:enabled","erp:GL:8:readOnly","erp:GL:9:enabled","erp:GL:9:readOnly","erp:MASTER:10:enabled","erp:MASTER:10:readOnly","erp:MASTER:4:enabled","erp:MASTER:7:enabled","erp:MASTER:7:readOnly","erp:MASTER:9:enabled","erp:MASTER:9:readOnly","erp:REWEB:12:enabled","erp:REWEB:4:enabled","erp:REWEB:4:readOnly","module:AP","module:AR","module:FA","module:FIN","module:GL","module:MASTER","module:REWEB"],"ACC-MANAGER":["erp:AP:0:enabled","erp:AP:10:enabled","erp:AP:11:enabled","erp:AP:11:readOnly","erp:AP:12:enabled","erp:AP:12:readOnly","erp:AP:13:enabled","erp:AP:13:readOnly","erp:AP:14:enabled","erp:AP:14:readOnly","erp:AP:15:enabled","erp:AP:15:readOnly","erp:AP:16:enabled","erp:AP:16:readOnly","erp:AP:17:enabled","erp:AP:1:enabled","erp:AP:2:enabled","erp:AP:3:enabled","erp:AP:4:enabled","erp:AP:5:enabled","erp:AP:6:enabled","erp:AP:7:enabled","erp:AP:8:enabled","erp:AP:9:enabled","erp:AR:0:enabled","erp:AR:10:enabled","erp:AR:10:readOnly","erp:AR:11:enabled","erp:AR:11:readOnly","erp:AR:12:enabled","erp:AR:12:readOnly","erp:AR:13:enabled","erp:AR:13:readOnly","erp:AR:1:enabled","erp:AR:2:enabled","erp:AR:3:enabled","erp:AR:4:enabled","erp:AR:5:enabled","erp:AR:6:enabled","erp:AR:7:enabled","erp:AR:8:enabled","erp:AR:8:readOnly","erp:AR:9:enabled","erp:AR:9:readOnly","erp:FA:0:enabled","erp:FA:1:enabled","erp:FA:2:enabled","erp:FA:3:enabled","erp:FA:4:enabled","erp:FA:5:enabled","erp:FA:6:enabled","erp:FA:6:readOnly","erp:FA:7:enabled","erp:FA:7:readOnly","erp:FA:8:enabled","erp:FA:8:readOnly","erp:FA:9:enabled","erp:FA:9:readOnly","erp:FIN:0:enabled","erp:FIN:1:enabled","erp:FIN:2:enabled","erp:FIN:3:enabled","erp:FIN:4:enabled","erp:FIN:5:enabled","erp:FIN:6:enabled","erp:FIN:6:readOnly","erp:GL:0:enabled","erp:GL:10:enabled","erp:GL:10:readOnly","erp:GL:11:enabled","erp:GL:11:readOnly","erp:GL:1:enabled","erp:GL:2:enabled","erp:GL:3:enabled","erp:GL:4:enabled","erp:GL:5:enabled","erp:GL:6:enabled","erp:GL:6:readOnly","erp:GL:7:enabled","erp:GL:7:readOnly","erp:GL:8:enabled","erp:GL:8:readOnly","erp:GL:9:enabled","erp:GL:9:readOnly","erp:MASTER:10:enabled","erp:MASTER:3:enabled","erp:MASTER:3:readOnly","erp:MASTER:4:enabled","erp:MASTER:7:enabled","erp:MASTER:8:enabled","erp:MASTER:9:enabled","erp:OF:0:enabled","erp:PM:4:enabled","erp:PM:4:readOnly","erp:PM:5:enabled","erp:PM:5:readOnly","erp:PM:6:enabled","erp:PM:6:readOnly","erp:PM:7:enabled","erp:PM:7:readOnly","erp:PM:8:enabled","erp:PM:8:readOnly","erp:PM:9:enabled","erp:PM:9:readOnly","erp:PO:10:enabled","erp:PO:10:readOnly","erp:PO:6:enabled","erp:PO:6:readOnly","erp:PO:7:enabled","erp:PO:7:readOnly","erp:PO:8:enabled","erp:PO:8:readOnly","erp:PO:9:enabled","erp:PO:9:readOnly","erp:REWEB:11:enabled","erp:REWEB:12:enabled","erp:REWEB:14:enabled","erp:REWEB:14:readOnly","erp:REWEB:15:enabled","erp:REWEB:15:readOnly","module:AP","module:AR","module:FA","module:FIN","module:GL","module:MASTER","module:OF","module:PM","module:PO","module:REWEB"],"AGENCY-SUPPORT":["erp:REWEB:0:enabled","erp:REWEB:1:enabled","erp:REWEB:1:readOnly","mkt:12:0:editor","module:REWEB","sales:2:editor"],"PROJECT-MANAGER":["erp:BD:0:enabled","erp:BD:0:readOnly","erp:BD:1:enabled","erp:BD:1:readOnly","erp:BD:2:enabled","erp:BD:2:readOnly","erp:BD:3:enabled","erp:BD:3:readOnly","erp:BD:4:enabled","erp:BD:4:readOnly","erp:BD:5:enabled","erp:BD:5:readOnly","erp:IC:0:enabled","erp:IC:10:enabled","erp:IC:10:readOnly","erp:IC:1:enabled","erp:IC:2:enabled","erp:IC:3:enabled","erp:IC:4:enabled","erp:IC:5:enabled","erp:IC:6:enabled","erp:IC:6:readOnly","erp:IC:7:enabled","erp:IC:7:readOnly","erp:IC:8:enabled","erp:IC:8:readOnly","erp:IC:9:enabled","erp:IC:9:readOnly","erp:MASTER:11:enabled","erp:MASTER:5:enabled","erp:MASTER:6:enabled","erp:OF:0:enabled","erp:OF:1:enabled","erp:OF:1:readOnly","erp:OF:2:enabled","erp:OF:3:enabled","erp:OF:4:enabled","erp:OF:4:readOnly","erp:OF:5:enabled","erp:OF:5:readOnly","erp:OF:6:enabled","erp:OF:6:readOnly","erp:OF:7:enabled","erp:OF:7:readOnly","erp:OF:8:enabled","erp:OF:8:readOnly","erp:OF:9:enabled","erp:PM:0:enabled","erp:PM:1:enabled","erp:PM:2:enabled","erp:PM:3:enabled","erp:PM:4:enabled","erp:PM:4:readOnly","erp:PM:5:enabled","erp:PM:5:readOnly","erp:PM:6:enabled","erp:PM:6:readOnly","erp:PM:7:enabled","erp:PM:7:readOnly","erp:PM:8:enabled","erp:PM:8:readOnly","erp:PM:9:enabled","erp:PM:9:readOnly","erp:PN:0:enabled","erp:PN:1:enabled","erp:PN:2:enabled","erp:PN:3:enabled","erp:PN:3:readOnly","erp:PN:4:enabled","erp:PN:4:readOnly","erp:PN:5:enabled","erp:PN:5:readOnly","erp:PN:6:enabled","erp:PN:6:readOnly","erp:PN:7:enabled","erp:PO:0:enabled","erp:PO:0:readOnly","erp:PO:10:enabled","erp:PO:10:readOnly","erp:PO:1:enabled","erp:PO:1:readOnly","erp:PO:2:enabled","erp:PO:2:readOnly","erp:PO:3:enabled","erp:PO:3:readOnly","erp:PO:4:enabled","erp:PO:4:readOnly","erp:PO:5:enabled","erp:PO:5:readOnly","erp:PO:6:enabled","erp:PO:6:readOnly","erp:PO:7:enabled","erp:PO:7:readOnly","erp:PO:8:enabled","erp:PO:8:readOnly","erp:PO:9:enabled","erp:PO:9:readOnly","erp:QCC:0:enabled","erp:QCC:1:enabled","erp:QCC:2:enabled","erp:QCC:3:enabled","erp:QCC:3:readOnly","erp:REPM:0:enabled","erp:REPM:1:enabled","erp:REPM:1:readOnly","erp:REPM:2:enabled","erp:REPM:2:readOnly","erp:REPM:3:enabled","erp:REPM:3:readOnly","erp:REWEB:14:enabled","erp:REWEB:14:readOnly","erp:REWEB:15:enabled","erp:REWEB:15:readOnly","erp:REWEB:9:enabled","erp:REWEB:9:readOnly","module:BD","module:IC","module:MASTER","module:OF","module:PM","module:PN","module:PO","module:QCC","module:REPM","module:REWEB"],"PROJECT-STAFF":["erp:IC:0:enabled","erp:IC:10:enabled","erp:IC:10:readOnly","erp:IC:1:enabled","erp:IC:2:enabled","erp:IC:3:enabled","erp:IC:3:readOnly","erp:IC:4:enabled","erp:IC:5:enabled","erp:IC:6:enabled","erp:IC:6:readOnly","erp:IC:7:enabled","erp:IC:7:readOnly","erp:IC:8:enabled","erp:IC:8:readOnly","erp:IC:9:enabled","erp:IC:9:readOnly","erp:MASTER:11:enabled","erp:MASTER:11:readOnly","erp:MASTER:5:enabled","erp:MASTER:5:readOnly","erp:MASTER:6:enabled","erp:MASTER:6:readOnly","erp:OF:0:enabled","erp:OF:2:enabled","erp:OF:3:enabled","erp:OF:5:enabled","erp:OF:5:readOnly","erp:OF:6:enabled","erp:OF:6:readOnly","erp:OF:7:enabled","erp:OF:7:readOnly","erp:OF:8:enabled","erp:OF:8:readOnly","erp:PM:0:enabled","erp:PM:1:enabled","erp:PM:2:enabled","erp:PM:2:readOnly","erp:PM:3:enabled","erp:PM:4:enabled","erp:PM:4:readOnly","erp:PM:5:enabled","erp:PM:5:readOnly","erp:PM:6:enabled","erp:PM:6:readOnly","erp:PM:7:enabled","erp:PM:7:readOnly","erp:PM:8:enabled","erp:PM:8:readOnly","erp:PM:9:enabled","erp:PM:9:readOnly","erp:PN:0:enabled","erp:PN:1:enabled","erp:PN:1:readOnly","erp:PN:2:enabled","erp:PN:3:enabled","erp:PN:3:readOnly","erp:PN:4:enabled","erp:PN:4:readOnly","erp:PN:5:enabled","erp:PN:5:readOnly","erp:PN:6:enabled","erp:PN:6:readOnly","erp:QCC:0:enabled","erp:QCC:1:enabled","erp:QCC:2:enabled","erp:QCC:3:enabled","erp:QCC:3:readOnly","module:IC","module:MASTER","module:OF","module:PM","module:PN","module:QCC"],"FIN-STAFF":["erp:AP:10:enabled","erp:AP:11:enabled","erp:AP:11:readOnly","erp:AP:12:enabled","erp:AP:12:readOnly","erp:AP:13:enabled","erp:AP:13:readOnly","erp:AP:14:enabled","erp:AP:14:readOnly","erp:AP:15:enabled","erp:AP:15:readOnly","erp:AP:16:enabled","erp:AP:16:readOnly","erp:AP:3:enabled","erp:AP:3:readOnly","erp:AP:4:enabled","erp:AP:5:enabled","erp:AP:7:enabled","erp:AP:8:enabled","erp:AP:9:enabled","erp:AP:9:readOnly","erp:AR:0:enabled","erp:AR:0:readOnly","erp:AR:10:enabled","erp:AR:10:readOnly","erp:AR:11:enabled","erp:AR:11:readOnly","erp:AR:12:enabled","erp:AR:12:readOnly","erp:AR:13:enabled","erp:AR:13:readOnly","erp:AR:1:enabled","erp:AR:1:readOnly","erp:AR:2:enabled","erp:AR:2:readOnly","erp:AR:3:enabled","erp:AR:3:readOnly","erp:AR:4:enabled","erp:AR:5:enabled","erp:AR:6:enabled","erp:AR:6:readOnly","erp:AR:8:enabled","erp:AR:8:readOnly","erp:AR:9:enabled","erp:AR:9:readOnly","erp:FIN:0:enabled","erp:FIN:1:enabled","erp:FIN:2:enabled","erp:FIN:3:enabled","erp:FIN:4:enabled","erp:FIN:5:enabled","erp:FIN:6:enabled","erp:FIN:6:readOnly","erp:GL:2:enabled","erp:GL:2:readOnly","erp:GL:8:enabled","erp:GL:8:readOnly","erp:MASTER:8:enabled","erp:OF:0:enabled","erp:PM:4:enabled","erp:PM:4:readOnly","erp:PM:5:enabled","erp:PM:5:readOnly","erp:PM:6:enabled","erp:PM:6:readOnly","erp:PM:7:enabled","erp:PM:7:readOnly","erp:PM:8:enabled","erp:PM:8:readOnly","erp:PM:9:enabled","erp:PM:9:readOnly","erp:REWEB:11:enabled","erp:REWEB:12:enabled","erp:REWEB:14:enabled","erp:REWEB:14:readOnly","erp:REWEB:15:enabled","erp:REWEB:15:readOnly","erp:REWEB:4:enabled","erp:REWEB:4:readOnly","module:AP","module:AR","module:FIN","module:GL","module:MASTER","module:OF","module:PM","module:REWEB"],"HR-MANAGER":["erp:OF:0:enabled","erp:OF:3:enabled","erp:OF:5:enabled","erp:OF:5:readOnly","erp:OF:6:enabled","erp:OF:6:readOnly","erp:OF:7:enabled","erp:OF:7:readOnly","erp:OF:8:enabled","erp:OF:8:readOnly","module:OF"],"HR-STAFF":["erp:OF:0:enabled","erp:OF:3:enabled","erp:OF:5:enabled","erp:OF:5:readOnly","erp:OF:6:enabled","erp:OF:6:readOnly","erp:OF:7:enabled","erp:OF:7:readOnly","erp:OF:8:enabled","erp:OF:8:readOnly","module:OF"],"IT-ADMIN":["erp:MASTER:0:enabled","erp:MASTER:10:enabled","erp:MASTER:11:enabled","erp:MASTER:1:enabled","erp:MASTER:2:enabled","erp:MASTER:3:enabled","erp:MASTER:4:enabled","erp:MASTER:5:enabled","erp:MASTER:6:enabled","erp:MASTER:7:enabled","erp:MASTER:8:enabled","erp:MASTER:9:enabled","erp:REWEB:10:enabled","erp:REWEB:11:enabled","mkt:0:0:admin","mkt:0:1:admin","mkt:0:2:admin","mkt:0:3:admin","mkt:0:4:admin","mkt:0:5:admin","mkt:0:6:admin","mkt:10:0:admin","mkt:11:0:admin","mkt:12:0:admin","module:MASTER","module:REWEB","sales:0:admin"],"IT-SUPPORT":["mkt:0:0:viewer","mkt:0:1:viewer","mkt:10:0:viewer","mkt:11:0:viewer","mkt:12:0:viewer"],"WEB-DEVELOPER":["mkt:0:0:admin","mkt:0:1:admin","mkt:0:2:admin","mkt:0:3:admin","mkt:0:4:admin","mkt:0:5:admin","mkt:0:6:admin","mkt:1:1:viewer","mkt:1:3:editor","mkt:1:4:admin","mkt:2:0:viewer","mkt:2:1:viewer","mkt:2:2:viewer","mkt:2:3:viewer","mkt:2:4:viewer","mkt:2:5:viewer","mkt:2:6:viewer","mkt:2:7:viewer"],"MANAGEMENT-VIEWER":["erp:AP:11:enabled","erp:AP:11:readOnly","erp:AP:12:enabled","erp:AP:12:readOnly","erp:AP:13:enabled","erp:AP:13:readOnly","erp:AP:14:enabled","erp:AP:14:readOnly","erp:AP:15:enabled","erp:AP:15:readOnly","erp:AP:16:enabled","erp:AP:16:readOnly","erp:AR:10:enabled","erp:AR:10:readOnly","erp:AR:11:enabled","erp:AR:11:readOnly","erp:AR:12:enabled","erp:AR:12:readOnly","erp:AR:13:enabled","erp:AR:13:readOnly","erp:AR:8:enabled","erp:AR:8:readOnly","erp:AR:9:enabled","erp:AR:9:readOnly","erp:BD:4:enabled","erp:BD:4:readOnly","erp:BD:5:enabled","erp:BD:5:readOnly","erp:FA:6:enabled","erp:FA:6:readOnly","erp:FA:7:enabled","erp:FA:7:readOnly","erp:FA:8:enabled","erp:FA:8:readOnly","erp:FA:9:enabled","erp:FA:9:readOnly","erp:FIN:3:enabled","erp:FIN:3:readOnly","erp:FIN:6:enabled","erp:FIN:6:readOnly","erp:GL:10:enabled","erp:GL:10:readOnly","erp:GL:11:enabled","erp:GL:11:readOnly","erp:GL:6:enabled","erp:GL:6:readOnly","erp:GL:7:enabled","erp:GL:7:readOnly","erp:GL:8:enabled","erp:GL:8:readOnly","erp:GL:9:enabled","erp:GL:9:readOnly","erp:IC:10:enabled","erp:IC:10:readOnly","erp:IC:6:enabled","erp:IC:6:readOnly","erp:IC:7:enabled","erp:IC:7:readOnly","erp:IC:8:enabled","erp:IC:8:readOnly","erp:IC:9:enabled","erp:IC:9:readOnly","erp:OF:5:enabled","erp:OF:5:readOnly","erp:OF:6:enabled","erp:OF:6:readOnly","erp:OF:7:enabled","erp:OF:7:readOnly","erp:OF:8:enabled","erp:OF:8:readOnly","erp:PM:4:enabled","erp:PM:4:readOnly","erp:PM:5:enabled","erp:PM:5:readOnly","erp:PM:6:enabled","erp:PM:6:readOnly","erp:PM:7:enabled","erp:PM:7:readOnly","erp:PM:8:enabled","erp:PM:8:readOnly","erp:PM:9:enabled","erp:PM:9:readOnly","erp:PN:3:enabled","erp:PN:3:readOnly","erp:PN:4:enabled","erp:PN:4:readOnly","erp:PN:5:enabled","erp:PN:5:readOnly","erp:PN:6:enabled","erp:PN:6:readOnly","erp:PO:10:enabled","erp:PO:10:readOnly","erp:PO:6:enabled","erp:PO:6:readOnly","erp:PO:7:enabled","erp:PO:7:readOnly","erp:PO:8:enabled","erp:PO:8:readOnly","erp:PO:9:enabled","erp:PO:9:readOnly","erp:QCC:3:enabled","erp:QCC:3:readOnly","erp:REPM:0:enabled","erp:REPM:0:readOnly","erp:REPM:3:enabled","erp:REPM:3:readOnly","erp:REWEB:14:enabled","erp:REWEB:14:readOnly","erp:REWEB:15:enabled","erp:REWEB:15:readOnly","erp:REWEB:5:enabled","erp:REWEB:5:readOnly","erp:REWEB:6:enabled","erp:REWEB:6:readOnly","mkt:1:1:viewer","mkt:1:2:viewer","mkt:1:3:viewer","mkt:3:0:viewer","mkt:3:1:viewer","mkt:3:2:viewer","mkt:3:3:viewer","mkt:3:4:viewer","mkt:3:5:viewer","mkt:4:0:viewer","mkt:4:1:viewer","mkt:4:2:viewer","mkt:4:3:viewer","mkt:4:4:viewer","mkt:4:5:viewer","mkt:5:0:viewer","mkt:5:1:viewer","mkt:5:2:viewer","mkt:5:3:viewer","mkt:5:4:viewer","mkt:5:5:viewer","mkt:6:0:viewer","mkt:6:1:viewer","mkt:6:2:viewer","mkt:6:3:viewer","mkt:6:4:viewer","mkt:6:5:viewer","mkt:7:0:viewer","mkt:7:1:viewer","mkt:7:2:viewer","mkt:7:3:viewer","mkt:7:4:viewer","mkt:7:5:viewer","mkt:8:0:viewer","mkt:9:0:viewer","mkt:9:1:viewer","module:AP","module:AR","module:BD","module:FA","module:FIN","module:GL","module:IC","module:OF","module:PM","module:PN","module:PO","module:QCC","module:REPM","module:REWEB","sales:1:admin"],"MKT-CONTENT-STAFF":["mkt:0:2:editor","mkt:0:3:editor","mkt:0:4:editor","mkt:0:5:editor","mkt:0:6:editor","mkt:10:0:editor","mkt:11:0:editor","mkt:1:1:viewer","mkt:2:0:editor","mkt:2:1:editor","mkt:2:2:editor","mkt:2:3:editor","mkt:2:4:editor","mkt:2:5:editor","mkt:2:6:editor","mkt:2:7:editor","mkt:2:8:editor","mkt:3:0:editor","mkt:3:1:editor","mkt:3:2:editor","mkt:3:3:editor","mkt:3:4:editor","mkt:3:5:editor","mkt:4:0:editor","mkt:4:1:editor","mkt:4:2:editor","mkt:4:3:editor","mkt:4:4:editor","mkt:4:5:editor","mkt:5:0:editor","mkt:5:1:editor","mkt:5:2:editor","mkt:5:3:editor","mkt:5:4:editor","mkt:5:5:editor","mkt:6:0:editor","mkt:6:1:editor","mkt:6:2:editor","mkt:6:3:editor","mkt:6:4:editor","mkt:6:5:editor","mkt:7:0:editor","mkt:7:1:editor","mkt:7:2:editor","mkt:7:3:editor","mkt:7:4:editor","mkt:7:5:editor","mkt:8:0:editor","mkt:9:0:editor","mkt:9:1:editor"],"MKT-DIGITAL-STAFF":["erp:REWEB:0:enabled","erp:REWEB:0:readOnly","erp:REWEB:6:enabled","erp:REWEB:6:readOnly","erp:REWEB:7:enabled","erp:REWEB:8:enabled","mkt:1:0:editor","mkt:1:1:editor","mkt:1:2:editor","mkt:1:3:editor","mkt:1:4:editor","mkt:2:0:editor","mkt:2:1:editor","mkt:2:2:editor","mkt:2:3:editor","mkt:2:4:editor","mkt:2:5:editor","mkt:2:6:editor","mkt:2:7:editor","mkt:2:8:editor","mkt:3:0:viewer","mkt:3:1:viewer","mkt:3:2:viewer","mkt:3:3:viewer","mkt:3:4:viewer","mkt:3:5:viewer","mkt:3:6:editor","mkt:4:0:viewer","mkt:4:1:viewer","mkt:4:2:viewer","mkt:4:3:viewer","mkt:4:4:viewer","mkt:4:5:viewer","mkt:5:0:viewer","mkt:5:1:viewer","mkt:5:2:viewer","mkt:5:3:viewer","mkt:5:4:viewer","mkt:5:5:viewer","mkt:6:0:viewer","mkt:6:1:viewer","mkt:6:2:viewer","mkt:6:3:viewer","mkt:6:4:viewer","mkt:6:5:viewer","mkt:7:0:viewer","mkt:7:1:viewer","mkt:7:2:viewer","mkt:7:3:viewer","mkt:7:4:viewer","mkt:7:5:viewer","mkt:8:0:viewer","mkt:8:1:editor","mkt:9:0:viewer","mkt:9:1:viewer","module:REWEB"],"MKT-GRAPHIC-STAFF":["mkt:11:0:editor","mkt:2:0:editor","mkt:2:1:editor","mkt:2:2:editor","mkt:2:3:editor","mkt:2:4:editor","mkt:2:5:editor","mkt:2:6:editor","mkt:2:7:editor","mkt:2:8:editor"],"MKT-MANAGER":["erp:REWEB:0:enabled","erp:REWEB:0:readOnly","erp:REWEB:13:enabled","erp:REWEB:14:enabled","erp:REWEB:14:readOnly","erp:REWEB:15:enabled","erp:REWEB:15:readOnly","erp:REWEB:6:enabled","erp:REWEB:7:enabled","erp:REWEB:8:enabled","mkt:0:2:admin","mkt:0:3:admin","mkt:0:4:admin","mkt:0:5:admin","mkt:0:6:admin","mkt:10:0:admin","mkt:11:0:admin","mkt:12:0:admin","mkt:1:0:admin","mkt:1:1:admin","mkt:1:2:admin","mkt:1:3:admin","mkt:1:4:admin","mkt:2:0:admin","mkt:2:1:admin","mkt:2:2:admin","mkt:2:3:admin","mkt:2:4:admin","mkt:2:5:admin","mkt:2:6:admin","mkt:2:7:admin","mkt:2:8:admin","mkt:3:0:admin","mkt:3:1:admin","mkt:3:2:admin","mkt:3:3:admin","mkt:3:4:admin","mkt:3:5:admin","mkt:3:6:admin","mkt:4:0:admin","mkt:4:1:admin","mkt:4:2:admin","mkt:4:3:admin","mkt:4:4:admin","mkt:4:5:admin","mkt:5:0:admin","mkt:5:1:admin","mkt:5:2:admin","mkt:5:3:admin","mkt:5:4:admin","mkt:5:5:admin","mkt:6:0:admin","mkt:6:1:admin","mkt:6:2:admin","mkt:6:3:admin","mkt:6:4:admin","mkt:6:5:admin","mkt:7:0:admin","mkt:7:1:admin","mkt:7:2:admin","mkt:7:3:admin","mkt:7:4:admin","mkt:7:5:admin","mkt:8:0:admin","mkt:8:1:admin","mkt:9:0:admin","mkt:9:1:admin","module:REWEB"],"MKT-SOCIAL-STAFF":["erp:REWEB:0:enabled","erp:REWEB:0:readOnly","erp:REWEB:13:enabled","erp:REWEB:6:enabled","erp:REWEB:6:readOnly","erp:REWEB:7:enabled","erp:REWEB:8:enabled","mkt:10:0:editor","mkt:11:0:editor","mkt:1:0:viewer","mkt:1:1:viewer","mkt:1:2:editor","mkt:2:0:editor","mkt:2:1:editor","mkt:2:2:editor","mkt:2:3:editor","mkt:2:4:editor","mkt:2:5:editor","mkt:2:6:editor","mkt:2:7:editor","mkt:2:8:editor","mkt:3:0:editor","mkt:3:1:editor","mkt:3:2:editor","mkt:3:3:editor","mkt:3:4:editor","mkt:3:5:editor","mkt:3:6:viewer","mkt:4:0:editor","mkt:4:1:editor","mkt:4:2:editor","mkt:4:3:editor","mkt:4:4:editor","mkt:4:5:editor","mkt:5:0:editor","mkt:5:1:editor","mkt:5:2:editor","mkt:5:3:editor","mkt:5:4:editor","mkt:5:5:editor","mkt:6:0:editor","mkt:6:1:editor","mkt:6:2:editor","mkt:6:3:editor","mkt:6:4:editor","mkt:6:5:editor","mkt:7:0:editor","mkt:7:1:editor","mkt:7:2:editor","mkt:7:3:editor","mkt:7:4:editor","mkt:7:5:editor","mkt:8:0:editor","mkt:8:1:viewer","mkt:9:0:editor","mkt:9:1:editor","module:REWEB"],"MKT-WEB-STAFF":["erp:REWEB:8:enabled","mkt:0:2:editor","mkt:0:3:editor","mkt:0:4:editor","mkt:0:5:editor","mkt:0:6:editor","mkt:11:0:editor","mkt:1:1:viewer","mkt:1:3:editor","mkt:1:4:viewer","mkt:2:0:viewer","mkt:2:1:viewer","mkt:2:2:viewer","mkt:2:3:viewer","mkt:2:4:viewer","mkt:2:5:viewer","mkt:2:6:viewer","mkt:2:7:viewer","module:REWEB"],"PROCUREMENT-MANAGER":["erp:BD:0:enabled","erp:BD:1:enabled","erp:BD:2:enabled","erp:BD:3:enabled","erp:BD:4:enabled","erp:BD:4:readOnly","erp:BD:5:enabled","erp:BD:5:readOnly","erp:IC:0:enabled","erp:IC:0:readOnly","erp:IC:10:enabled","erp:IC:10:readOnly","erp:IC:1:enabled","erp:IC:1:readOnly","erp:IC:2:enabled","erp:IC:2:readOnly","erp:IC:3:enabled","erp:IC:3:readOnly","erp:IC:4:enabled","erp:IC:4:readOnly","erp:IC:5:enabled","erp:IC:5:readOnly","erp:IC:6:enabled","erp:IC:6:readOnly","erp:IC:7:enabled","erp:IC:7:readOnly","erp:IC:8:enabled","erp:IC:8:readOnly","erp:IC:9:enabled","erp:IC:9:readOnly","erp:MASTER:11:enabled","erp:MASTER:4:enabled","erp:MASTER:5:enabled","erp:MASTER:6:enabled","erp:OF:0:enabled","erp:OF:1:enabled","erp:OF:3:enabled","erp:OF:4:enabled","erp:OF:5:enabled","erp:OF:5:readOnly","erp:OF:6:enabled","erp:OF:6:readOnly","erp:OF:7:enabled","erp:OF:7:readOnly","erp:OF:8:enabled","erp:OF:8:readOnly","erp:OF:9:enabled","erp:PM:4:enabled","erp:PM:4:readOnly","erp:PM:5:enabled","erp:PM:5:readOnly","erp:PM:6:enabled","erp:PM:6:readOnly","erp:PM:7:enabled","erp:PM:7:readOnly","erp:PM:8:enabled","erp:PM:8:readOnly","erp:PM:9:enabled","erp:PM:9:readOnly","erp:PO:0:enabled","erp:PO:10:enabled","erp:PO:10:readOnly","erp:PO:1:enabled","erp:PO:2:enabled","erp:PO:3:enabled","erp:PO:4:enabled","erp:PO:5:enabled","erp:PO:6:enabled","erp:PO:6:readOnly","erp:PO:7:enabled","erp:PO:7:readOnly","erp:PO:8:enabled","erp:PO:8:readOnly","erp:PO:9:enabled","erp:PO:9:readOnly","module:BD","module:IC","module:MASTER","module:OF","module:PM","module:PO"],"PROCUREMENT-STAFF":["erp:BD:0:enabled","erp:BD:1:enabled","erp:BD:2:enabled","erp:BD:3:enabled","erp:BD:4:enabled","erp:BD:4:readOnly","erp:BD:5:enabled","erp:BD:5:readOnly","erp:IC:0:enabled","erp:IC:0:readOnly","erp:IC:10:enabled","erp:IC:10:readOnly","erp:IC:1:enabled","erp:IC:1:readOnly","erp:IC:2:enabled","erp:IC:2:readOnly","erp:IC:3:enabled","erp:IC:3:readOnly","erp:IC:4:enabled","erp:IC:4:readOnly","erp:IC:5:enabled","erp:IC:5:readOnly","erp:IC:6:enabled","erp:IC:6:readOnly","erp:IC:7:enabled","erp:IC:7:readOnly","erp:IC:8:enabled","erp:IC:8:readOnly","erp:IC:9:enabled","erp:IC:9:readOnly","erp:MASTER:11:enabled","erp:MASTER:11:readOnly","erp:MASTER:4:enabled","erp:MASTER:5:enabled","erp:MASTER:5:readOnly","erp:MASTER:6:enabled","erp:MASTER:6:readOnly","erp:OF:0:enabled","erp:OF:1:enabled","erp:OF:3:enabled","erp:OF:4:enabled","erp:OF:5:enabled","erp:OF:5:readOnly","erp:OF:6:enabled","erp:OF:6:readOnly","erp:OF:7:enabled","erp:OF:7:readOnly","erp:OF:8:enabled","erp:OF:8:readOnly","erp:PO:0:enabled","erp:PO:10:enabled","erp:PO:10:readOnly","erp:PO:1:enabled","erp:PO:2:enabled","erp:PO:3:enabled","erp:PO:4:enabled","erp:PO:4:readOnly","erp:PO:5:enabled","erp:PO:6:enabled","erp:PO:6:readOnly","erp:PO:7:enabled","erp:PO:7:readOnly","erp:PO:8:enabled","erp:PO:8:readOnly","erp:PO:9:enabled","erp:PO:9:readOnly","module:BD","module:IC","module:MASTER","module:OF","module:PO"],"RENTAL-STAFF":["erp:REWEB:9:enabled","module:REWEB","rental:0:editor"],"SALE-CLOSER":["erp:REWEB:0:enabled","erp:REWEB:1:enabled","erp:REWEB:2:enabled","erp:REWEB:2:readOnly","erp:REWEB:3:enabled","erp:REWEB:3:readOnly","erp:REWEB:4:enabled","erp:REWEB:4:readOnly","erp:REWEB:5:enabled","erp:REWEB:5:readOnly","module:REWEB","sales:5:editor"],"SALE-COORDINATOR":["erp:REWEB:0:enabled","erp:REWEB:10:enabled","erp:REWEB:10:readOnly","erp:REWEB:12:enabled","erp:REWEB:12:readOnly","erp:REWEB:13:enabled","erp:REWEB:1:enabled","erp:REWEB:2:enabled","erp:REWEB:3:enabled","erp:REWEB:4:enabled","erp:REWEB:5:enabled","erp:REWEB:5:readOnly","erp:REWEB:9:enabled","module:REWEB","sales:6:editor"],"SALE-MANAGER":["erp:AR:10:enabled","erp:AR:10:readOnly","erp:AR:11:enabled","erp:AR:11:readOnly","erp:AR:12:enabled","erp:AR:12:readOnly","erp:AR:13:enabled","erp:AR:13:readOnly","erp:AR:8:enabled","erp:AR:8:readOnly","erp:AR:9:enabled","erp:AR:9:readOnly","erp:REPM:0:enabled","erp:REPM:0:readOnly","erp:REPM:1:enabled","erp:REPM:1:readOnly","erp:REPM:2:enabled","erp:REPM:2:readOnly","erp:REPM:3:enabled","erp:REPM:3:readOnly","erp:REWEB:0:enabled","erp:REWEB:10:enabled","erp:REWEB:11:enabled","erp:REWEB:11:readOnly","erp:REWEB:13:enabled","erp:REWEB:14:enabled","erp:REWEB:14:readOnly","erp:REWEB:15:enabled","erp:REWEB:15:readOnly","erp:REWEB:1:enabled","erp:REWEB:2:enabled","erp:REWEB:3:enabled","erp:REWEB:4:enabled","erp:REWEB:4:readOnly","erp:REWEB:5:enabled","erp:REWEB:6:enabled","erp:REWEB:6:readOnly","erp:REWEB:7:enabled","erp:REWEB:7:readOnly","erp:REWEB:9:enabled","erp:REWEB:9:readOnly","mkt:12:0:viewer","module:AR","module:REPM","module:REWEB","sales:1:admin"],"SALE-REP":["erp:REWEB:0:enabled","erp:REWEB:1:enabled","erp:REWEB:2:enabled","erp:REWEB:2:readOnly","erp:REWEB:4:enabled","erp:REWEB:4:readOnly","module:REWEB","sales:7:editor"]};
