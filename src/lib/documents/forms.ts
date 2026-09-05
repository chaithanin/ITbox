// ============================================================================
// IT document templates (Chaithanin) — data-driven definitions.
//
// Each form is described once here; the fill-in page (src/app/(app)/documents)
// and the PDF generator (src/lib/documents/pdf.ts) both read these definitions,
// so the on-screen form and the generated PDF match the paper originals:
// the same top options, requester block, per-system permission levels, ERP
// module matrix, administrator section and signature blocks.
//
// Two entries (pm-schedule, active-backup-server) are reference documents:
// download-only, served from /public/forms.
// ============================================================================

export type FieldType = "text" | "textarea" | "date" | "time" | "number";

export interface Field {
  name: string;
  th: string;
  en?: string;
  type: FieldType;
  half?: boolean;
}

export interface Option { value: string; th: string; en?: string }

export interface OptionGroup {
  name: string;
  th: string;
  en?: string;
  options: Option[];
  multi?: boolean;         // checkboxes vs single-choice
  other?: boolean;         // append an "Other: ____" free-text option
  levels?: Option[];       // permission-level checkboxes shown after the label (e.g. Admin/Editor/Viewer)
  matrix?: string[];       // a labelled checkbox row (e.g. Mango ERP module codes)
  inline?: boolean;        // render options in a single wrapped line (short lists)
}

export interface TableColumn { key: string; th: string; en?: string; width: number }
export interface TableSpec { name: string; th: string; en?: string; columns: TableColumn[]; rows: number }

export interface Section {
  title?: string;
  fields?: Field[];
  groups?: OptionGroup[];
  tables?: TableSpec[];
  note?: string;
}

export type SignatureRole = "requester" | "deptManager" | "itSupport" | "itManager" | "management";

export interface FormDef {
  slug: string;
  titleTh: string;
  titleEn: string;
  descTh: string;
  category: "request" | "record" | "reference";
  topGroups?: OptionGroup[];
  sections: Section[];
  requesterSignatures?: SignatureRole[];
  adminSection?: Section;         // "For administrator privileges" (section 2)
  adminSignatures?: SignatureRole[];
  referenceOnly?: boolean;
}

// ---- shared building blocks ------------------------------------------------

const DEPARTMENTS: Option[] = [
  "Rental", "Sales", "Sale Support", "Online Sales", "Online Marketing",
  "Graphic", "Agency", "Admin", "Accounting", "Purchasing", "HR", "Outsource",
].map((d) => ({ value: d, th: d }));

const DEPARTMENTS_SHORT: Option[] = [
  "Sales", "Marketing", "Online Marketing", "Graphic", "HR", "Admin", "Accounting", "Rental",
].map((d) => ({ value: d, th: d }));

const DAYS: Option[] = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]
  .map((d) => ({ value: d, th: d }));

const TIMES: Option[] = [
  { value: "09.00-18.00", th: "09.00am-18.00pm" },
  { value: "09.00-12.00", th: "09.00am-12.00pm" },
  { value: "13.00-18.00", th: "13.00pm-18.00pm" },
];

const AEV: Option[] = [
  { value: "admin", th: "Admin Permission" },
  { value: "editor", th: "Editor Permission" },
  { value: "viewer", th: "Viewer Permission" },
];
const AEVA: Option[] = [...AEV, { value: "approved", th: "Approved" }];

const ERP_MODULES = ["AP", "AR", "BD", "FA", "FIN", "GL", "IC", "MASTER", "OF", "OTHER", "PM", "PN", "PO", "QCC", "REPM", "REWEB", "SE"];

const opts = (...v: string[]): Option[] => v.map((x) => ({ value: x, th: x }));

/** A Mango ERP role block: permission levels + role checkboxes + module matrix. */
function mango(key: string, label: string, roles: string[]): OptionGroup {
  return { name: `mango_${key}`, th: `Mango ERP — ${label}`, levels: AEVA, options: opts(...roles), multi: true, matrix: ERP_MODULES };
}

/** Standard requester identity block (staff ID first). */
function requester(extra: Field[] = []): Section {
  return {
    title: "สำหรับผู้ขอสิทธิ์ / For the Requester",
    fields: [
      { name: "employeeCode", th: "รหัสพนักงาน / Staff ID", type: "text" },
      { name: "nameTh", th: "ชื่อ-สกุลภาษาไทย (นาย/นาง/นางสาว)", type: "text" },
      { name: "nameEn", th: "ชื่อ-สกุลภาษาอังกฤษ (Mr./Mrs./Ms.)", type: "text" },
      { name: "phone", th: "เบอร์โทรศัพท์ / Phone No", type: "text", half: true },
      { name: "email", th: "อีเมล / Email", type: "text", half: true },
      ...extra,
    ],
  };
}

/** Standard admin "check correctness" section. */
function adminCheck(extraGroups: OptionGroup[] = [], note?: string): Section {
  return {
    title: "สำหรับเจ้าหน้าที่สิทธิ์ผู้ดูแลระบบ / For administrator privileges",
    groups: [
      { name: "adminChecked", th: "", options: [{ value: "checked", th: "ตรวจสอบความถูกต้อง / Check the Correctness" }], multi: true },
      ...extraGroups,
    ],
    fields: [{ name: "adminNote", th: "หมายเหตุ / Note", type: "textarea" }],
    note,
  };
}

// ---- form catalogue --------------------------------------------------------

export const FORMS: FormDef[] = [
  // ============================ 4.A Access request ============================
  {
    slug: "access-request",
    titleTh: "แบบฟอร์มขอสิทธิ์การใช้งานระบบสารสนเทศ",
    titleEn: "Information system license request form",
    descTh: "ขอเปิดสิทธิ์เข้าใช้งานระบบ/แอปพลิเคชันต่าง ๆ",
    category: "request",
    topGroups: [{ name: "department", th: "แผนก / Department", options: DEPARTMENTS, multi: true, other: true }],
    sections: [
      requester([
        { name: "department2", th: "แผนก / Department", type: "text" },
        { name: "note", th: "หมายเหตุ / Note", type: "textarea" },
      ]),
      {
        title: "Online Marketing Permission",
        groups: [
          { name: "website", th: "Website", levels: [...AEV, { value: "cpanel", th: "cPanel (Create New Account)" }], multi: true,
            options: opts("globaltopgroup.com/wp-admin", "thepremierresidence.com/wp-admin", "vanneegoldensands.com/wp-admin", "foundationthailandisrael.com/wp-admin", "helitonrealestate.com/wp-admin") },
          { name: "ftp", th: "FTP (Create New Account)", multi: true,
            options: opts("globaltopgroup.com", "thepremierresidence.com", "vanneegoldensands.com", "foundationthailandisrael.com", "helitonrealestate.com") },
          { name: "google", th: "Google", levels: AEV, multi: true, options: opts("google Ads", "google analytics", "google page") },
          { name: "googleDrive", th: "Google Drive", levels: AEV, multi: true,
            options: opts("City Garden Pattaya", "City Garden Pratumnak", "City Garden Tower", "City Garden Tropicana", "Marina Golden Bay", "Olympus City Garden", "Paradise Ocean View", "The Cloud", "Graphic") },
          { name: "facebook", th: "Facebook", levels: AEV, multi: true,
            options: opts("globaltopgroup", "thepremierresidence", "vanneegoldensands", "harmonia", "Facebook Ads", "Facebook Page", "munhies cafe", "LE Cocktail Kitchen And Bar") },
          { name: "twitter", th: "Twitter", levels: AEV, multi: true,
            options: opts("globaltopgroup", "thepremierresidence", "vanneegoldensands", "harmonia", "munhies cafe", "LE Cocktail Kitchen And Bar") },
          { name: "onlineFoodShop", th: "Online Food Shop", levels: AEV, multi: true, options: opts("Grab", "Food Panda", "Hungry Now") },
          { name: "instagram", th: "Instagram", levels: AEV, multi: true,
            options: opts("globaltopgroup", "thepremierresidence", "vanneegoldensands", "harmonia", "munhies cafe", "LE Cocktail Kitchen And Bar") },
          { name: "linkedin", th: "Linked In", levels: AEV, multi: true,
            options: opts("globaltopgroup", "thepremierresidence", "vanneegoldensands", "harmonia", "munhies cafe", "LE Cocktail Kitchen And Bar") },
          { name: "pinterest", th: "Pinterest", levels: AEV, multi: true,
            options: opts("globaltopgroup", "thepremierresidence", "vanneegoldensands", "harmonia", "munhies cafe", "LE Cocktail Kitchen And Bar") },
          { name: "tiktok", th: "Tiktok", levels: AEV, multi: true, options: opts("Tiktok Ads") },
          { name: "line", th: "Line", levels: AEV, multi: true, options: opts("Line Account", "Line Official") },
          { name: "hootsuite", th: "Hootsuite", multi: true, options: opts("Admin Permission", "Editor Permission", "Create New Account") },
          { name: "canva", th: "CANVAS ACCOUNTS", levels: AEV, multi: true, options: opts("Admin Account", "Create New Account") },
          { name: "chineseSocial", th: "CHINESE Social", levels: AEV, multi: true,
            options: opts("WEIBO", "ALIBABA", "XIAOHONGSHU", "Toutiao (头条)", "Douyin 抖音 (TikTok China)", "Momo (陌陌)", "TIKTOK 去海外 (qHiWi)", "TAOBAO", "WEIXIN / WeChat, WeChat Official") },
        ],
      },
      {
        title: "CRM / Rental / Juristic Permission",
        groups: [
          { name: "zoho", th: "Zoho CRM", multi: true, options: opts("Administrator Permission", "Standard Permission", "Viewer Permission") },
          { name: "venio", th: "Venio CRM", levels: AEV, multi: true,
            options: opts("Admin", "Agency Support", "Agency Support Team A", "Agency Support Team B", "Closer", "Management", "Sales Coordinator", "Sales Representative", "Sales Representative A", "Sales Representative B", "Trainer") },
          { name: "horganice", th: "Horganice (Rental)", levels: AEV, multi: true, options: opts("Rental Staff", "Inspector", "Technical", "House Keeping") },
          { name: "silverman", th: "Silverman (Juristic)", levels: AEV, multi: true, options: opts("Manager", "Staff", "Operator", "Account") },
        ],
      },
      {
        title: "ERP Permission (Mango ERP)",
        groups: [
          mango("exec", "Executive", ["Chief Executive Officer Secretary", "Chief Executive Assistant", "Chief Executive Officer", "Chief Operating Officer", "Chief Support Officer", "Chief Marketing Officer", "Chief Finance Officer"]),
          mango("acc", "Accounting / Finance", ["Accounting Manager", "Accounting Assistant Manager", "Accounting Supervisor AP", "Accounting Supervisor AR", "Accounting AP", "Accounting AR", "Finance Manager", "Finance Officer"]),
          mango("hr", "HR / Admin", ["Human Resource Manager", "Human Resource Assistant", "Human Resource Supervisor", "Human Resource Officer", "Admin Supervisor", "Admin Officer"]),
          mango("sales", "Sales", ["Sales Manager", "Sales Manager Assistant", "Sales Coordinator", "Sales Officer"]),
          mango("salesSupport", "Sales Support", ["Sales Support Manager", "Senior Executive Sales Support", "Sales Support Officer"]),
          mango("online", "Online Sales / Graphic", ["Senior Executive Online Sales", "Online Sales", "Graphic"]),
          mango("procurement", "Procurement / Audit", ["Procurement Manager", "Procurement Supervisor", "Procurement Officer", "Internal Audit"]),
          mango("it", "IT", ["IT Manager", "IT Assistant Manager", "IT Supervisor", "IT Executive", "IT Officer"]),
          mango("messenger", "Messenger / Driver", ["Messenger", "Driver"]),
          mango("rental", "Rental", ["Rental Manager", "Rental Assistant Manager", "Rental Supervisor", "Rental Officer", "Rental Housekeeping", "Rental Inspector", "Rental Technical"]),
          mango("warehouse", "Structure / Warehouse", ["Structure Design Manager", "Structure Design Assistant Manager", "Architect Manager", "Architect Assistant Manager", "Warehouse Manager", "Warehouse Assistant Manager", "Warehouse Senior Executive", "Warehouse Supervisor"]),
        ],
      },
      {
        title: "Other Systems",
        groups: [
          { name: "express", th: "Express", levels: AEVA, multi: true,
            options: opts("Accounting Manager", "Accounting Assistant Manager", "Accounting Supervisor AP", "Accounting Supervisor AR", "Accounting AP", "Accounting AR", "Finance Manager", "Finance Officer") },
          { name: "cheque", th: "Cheque System", levels: AEV, multi: true, options: opts("Manage", "Member", "User", "Print Cheque") },
          { name: "bplus", th: "Bplus HR", levels: AEVA, multi: true, options: opts("Human Resource Manager", "Human Resource Assistant", "Human Resource Supervisor", "Human Resource Officer", "Admin Supervisor", "Admin Officer") },
          { name: "hip", th: "HIP Premium Time", levels: AEVA, multi: true, options: opts("Human Resource Manager", "Human Resource Assistant", "Human Resource Supervisor", "Human Resource Officer", "Admin Supervisor", "Admin Officer") },
        ],
      },
    ],
    requesterSignatures: ["requester", "deptManager"],
    adminSection: {
      title: "สำหรับเจ้าหน้าที่สิทธิ์ผู้ดูแลระบบ / For administrator privileges",
      groups: [{
        name: "adminAccess", th: "", multi: true,
        options: opts("ตรวจสอบความถูกต้อง / Check the Correctness", "ยกเลิกสิทธิ์ หรือ บันทึก User & Password เรียบร้อยแล้ว / Close permissions or Save User & Password"),
      }],
      note: "(1) ผู้ดูแลระบบจะตรวจสอบและเปิดสิทธิ์ภายใน 3 วันทำการ (2) ผู้ขอสิทธิ์ต้องยืนยันตัวตนก่อนการเข้าใช้งานทุกครั้ง (3) สิทธิ์ใช้งานได้ไม่เกิน 1 ปีนับจากวันยื่นขอ (4) เอกสารจะดำเนินการก็ต่อเมื่อผู้จัดการแผนกลงนามอนุมัติแล้วเท่านั้น",
    },
    adminSignatures: ["itSupport", "itManager", "management"],
  },

  // ============================ 4.C Software install ==========================
  {
    slug: "software-install",
    titleTh: "แบบฟอร์มขอติดตั้ง-เปลี่ยนแปลง-แก้ไขซอฟต์แวร์",
    titleEn: "Software installation-change-modification request form",
    descTh: "ขอติดตั้ง เปลี่ยนแปลง หรือแก้ไขซอฟต์แวร์",
    category: "request",
    topGroups: [{ name: "department", th: "แผนก / Department", options: DEPARTMENTS, multi: true, other: true }],
    sections: [
      requester([
        { name: "department2", th: "แผนก / Department", type: "text" },
        { name: "reason", th: "เหตุผลความจำเป็น / Necessary reason", type: "textarea" },
        { name: "software", th: "ซอฟต์แวร์ / Software", type: "text" },
      ]),
    ],
    requesterSignatures: ["requester", "deptManager"],
    adminSection: adminCheck([], "(1) หากซอฟต์แวร์ที่ติดตั้งไม่มี จะส่งเรื่องกลับให้ร้องขอจัดซื้อก่อน (2) ตรวจสอบลิขสิทธิ์ หากไม่ถูกต้องจะยกเลิกการร้องขอทันที (3) ห้ามติดตั้งโปรแกรมเสริมเองโดยไม่ได้รับอนุญาต (4) ดำเนินการเมื่อผู้จัดการแผนกลงนามอนุมัติแล้วเท่านั้น"),
    adminSignatures: ["itSupport", "itManager", "management"],
  },

  // ============================ 6 VPN =========================================
  {
    slug: "vpn",
    titleTh: "แบบฟอร์มขอใช้งานระบบ VPN",
    titleEn: "VPN System Application Form",
    descTh: "ขอใช้งาน VPN เชื่อมต่อระบบภายใน",
    category: "request",
    topGroups: [
      { name: "days", th: "วันที่ใช้งาน / Length of Work (Days)", options: DAYS, multi: true, inline: true },
      { name: "time", th: "ช่วงเวลา / Length of Work (Time)", options: TIMES, multi: true, other: true, inline: true },
    ],
    sections: [requester([{ name: "note", th: "หมายเหตุ / Note", type: "textarea" }])],
    requesterSignatures: ["requester", "deptManager"],
    adminSection: adminCheck([], "ผู้ดูแลระบบจะตรวจสอบความถูกต้องภายใน 1 วันทำการ"),
    adminSignatures: ["itSupport", "itManager", "management"],
  },

  // ============================ 11 Remote access ==============================
  {
    slug: "remote-access",
    titleTh: "แบบฟอร์มขอรีโมทจากระยะไกล",
    titleEn: "Remote Access Request Form",
    descTh: "ขอรีโมทเข้าเครื่องจากระยะไกล",
    category: "request",
    topGroups: [
      { name: "tool", th: "ประเภท / Request Type", options: opts("Remote Desktop", "TeamViewer", "AnyDesk", "Chrome Remote"), multi: true, other: true, inline: true },
      { name: "days", th: "วันที่ใช้งาน / Length of Work (Days)", options: DAYS, multi: true, inline: true },
      { name: "time", th: "ช่วงเวลา / Length of Work (Time)", options: TIMES, multi: true, other: true, inline: true },
    ],
    sections: [requester([{ name: "conditions", th: "เงื่อนไขการรีโมท / Conditions for remote control", type: "textarea" }])],
    requesterSignatures: ["requester", "deptManager"],
    adminSection: adminCheck([], "ผู้ดูแลระบบจะตรวจสอบความถูกต้องภายใน 1 วันทำการ"),
    adminSignatures: ["itSupport", "itManager", "management"],
  },

  // ============================ 9 Data recovery ===============================
  {
    slug: "data-recovery",
    titleTh: "แบบฟอร์มขอกู้คืนข้อมูล",
    titleEn: "Information Recovery Data request form",
    descTh: "ขอกู้คืนข้อมูลที่สูญหาย",
    category: "request",
    topGroups: [
      { name: "requestType", th: "ประเภท / Request Type", options: opts("Mobile Phone", "Computer PC", "Computer Notebook", "Share Folder"), multi: true, inline: true },
      { name: "department", th: "แผนก / Department", options: DEPARTMENTS_SHORT, multi: true, inline: true },
    ],
    sections: [requester([{ name: "source", th: "แหล่งที่มาของข้อมูลที่ต้องการกู้คืน / Source of data to recover", type: "textarea" }])],
    requesterSignatures: ["requester", "deptManager"],
    adminSection: adminCheck([{
      name: "recoveryResult", th: "", multi: true,
      options: opts("ดำเนินการกู้ข้อมูลเสร็จเรียบร้อย / Data recovery completed", "ไม่สามารถกู้ข้อมูลได้ เนื่องจาก / Could not recover, because"),
    }], "ผู้ดูแลระบบจะตรวจสอบและกู้คืนข้อมูลภายใน 3 วันทำการ"),
    adminSignatures: ["itSupport", "itManager", "management"],
  },

  // ============================ 7 Access review ===============================
  {
    slug: "access-review",
    titleTh: "แบบฟอร์มสอบทานสิทธิ์",
    titleEn: "Access Rights Review form",
    descTh: "สอบทาน/ยกเลิก/ต่ออายุสิทธิ์การใช้งาน",
    category: "request",
    topGroups: [
      { name: "requestType", th: "ประเภท / Request Type", multi: true, inline: true,
        options: [{ value: "verify", th: "ตรวจสอบสิทธิ์ / Verify rights" }, { value: "cancel", th: "ยกเลิกสิทธิ์ / Cancel Permission" }, { value: "extend", th: "ต่ออายุสิทธิ์ / Extend access rights" }] },
      { name: "department", th: "แผนก / Department", options: DEPARTMENTS, multi: true, other: true },
    ],
    sections: [{
      title: "สำหรับผู้ขอสิทธิ์ / For the Requester",
      fields: [
        { name: "employeeCode", th: "รหัสพนักงาน / Staff ID", type: "text" },
        { name: "nameTh", th: "ชื่อ-สกุลภาษาไทย (นาย/นาง/นางสาว)", type: "text" },
        { name: "nameEn", th: "ชื่อ-สกุลภาษาอังกฤษ (Mr./Mrs./Ms.)", type: "text" },
        { name: "department2", th: "แผนก / Department", type: "text", half: true },
        { name: "position", th: "ตำแหน่ง / Position", type: "text", half: true },
        { name: "note", th: "หมายเหตุ / Note", type: "textarea" },
      ],
    }],
    requesterSignatures: ["deptManager"],
    adminSection: adminCheck([{
      name: "reviewResult", th: "", multi: true,
      options: opts("จัดเตรียมเอกสารพร้อมนำส่งตรวจทานสิทธิ์ / Prepare documents for verification of rights"),
    }]),
    adminSignatures: ["itSupport", "itManager", "management"],
  },

  // ============================ 12 Server access ==============================
  {
    slug: "server-access",
    titleTh: "แบบฟอร์มขอเข้าใช้งานเครื่องแม่ข่าย",
    titleEn: "Application form for accessing the server",
    descTh: "ขอเข้าใช้งานเครื่องแม่ข่าย (Server)",
    category: "request",
    sections: [
      requester([
        { name: "accessDate", th: "วันที่ขอเข้าใช้งาน / Access date", type: "date", half: true },
        { name: "officerCount", th: "จำนวนเจ้าหน้าที่ / Number of officers", type: "number", half: true },
        { name: "officer1", th: "รายชื่อ 1 / Officer 1", type: "text" },
        { name: "officer2", th: "รายชื่อ 2 / Officer 2", type: "text" },
        { name: "officer3", th: "รายชื่อ 3 / Officer 3", type: "text" },
        { name: "officer4", th: "รายชื่อ 4 / Officer 4", type: "text" },
      ]),
      {
        groups: [{ name: "passportCopy", th: "", options: opts("แนบสำเนาบัตรประจำตัวประชาชน / Passport Copy attached"), multi: true }],
        note: "ข้อตกลง: (1) ห้ามนำอุปกรณ์ต่อพ่วงกับเครื่องแม่ข่ายหรืออุปกรณ์อื่นในห้องควบคุมโดยเด็ดขาด (2) หากจำเป็นต้องดำเนินการตามข้อ 1 ให้แจ้งผู้รับผิดชอบระบบ และแจ้งหัวหน้าแผนกทราบก่อนดำเนินการทุกครั้ง",
      },
    ],
    requesterSignatures: ["requester", "deptManager"],
    adminSection: {
      title: "สำหรับเจ้าหน้าที่สิทธิ์ผู้ดูแลระบบ / For administrator privileges",
      fields: [
        { name: "completedDate", th: "เข้าใช้งานเสร็จเรียบร้อยในวันที่ / Completed on date", type: "date", half: true },
        { name: "completedTime", th: "เวลา / Time", type: "time", half: true },
      ],
    },
    adminSignatures: ["itSupport", "itManager", "management"],
  },

  // ============================ 14 System development =========================
  {
    slug: "system-development",
    titleTh: "แบบฟอร์มขอพัฒนาระบบ",
    titleEn: "System Development request form",
    descTh: "ขอพัฒนา/ปรับปรุงระบบงาน",
    category: "request",
    topGroups: [{ name: "department", th: "แผนก / Department", options: [...DEPARTMENTS_SHORT, { value: "Outsource", th: "Outsource" }], multi: true }],
    sections: [requester([{ name: "reason", th: "สาเหตุที่ขอพัฒนาระบบ / Reasons for requesting system development", type: "textarea" }])],
    requesterSignatures: ["requester", "deptManager"],
    adminSection: adminCheck([], "ผู้ดูแลระบบจะตรวจสอบความถูกต้องภายใน 1 วันทำการ"),
    adminSignatures: ["itSupport", "itManager", "management"],
  },

  // ============================ 10 Asset disposal =============================
  {
    slug: "asset-disposal",
    titleTh: "แบบฟอร์มขอจำหน่ายทรัพย์สิน",
    titleEn: "Asset disposal request form",
    descTh: "ขออนุมัติจำหน่ายทรัพย์สินที่ใช้งานไม่ได้ออกจากทะเบียน",
    category: "record",
    topGroups: [
      { name: "reason", th: "สาเหตุ / Reason", multi: true, options: [
        { value: "defective", th: "ชำรุดบกพร่อง / Defective" }, { value: "deteriorated", th: "เสื่อมสภาพ ตกรุ่น / Deterioration, outdated" },
        { value: "notWorthRepair", th: "ซ่อมไม่คุ้ม / Not worth repairing" }, { value: "warrantyExpired", th: "หมดระยะเวลาประกัน / Warranty expired" }] },
      { name: "method", th: "วิธีจำหน่าย / Method", multi: true, options: [
        { value: "sell", th: "ขาย / Sell" }, { value: "exchange", th: "แลกเปลี่ยน / Exchange" },
        { value: "transfer", th: "โอน / Transfer" }, { value: "destroy", th: "แปรสภาพหรือทำลาย / Transform or Destroy" }] },
    ],
    sections: [{
      fields: [
        { name: "date", th: "วันที่ / Date", type: "date", half: true },
        { name: "operatedBy", th: "ดำเนินการโดย / Operated by", type: "text", half: true },
      ],
      tables: [{ name: "items", th: "รายการทรัพย์สิน", rows: 10, columns: [
        { key: "type", th: "ประเภท / Type", width: 4 }, { key: "registration", th: "หมายเลขทะเบียน / Registration No.", width: 4 },
        { key: "quantity", th: "จำนวน / Qty", width: 2 }, { key: "note", th: "หมายเหตุ / Note", width: 4 }] }],
    }],
    adminSignatures: ["itSupport", "itManager", "management"],
  },

  // ============================ 13 Server room log ============================
  {
    slug: "server-room-log",
    titleTh: "แบบฟอร์มขอเข้า-ออกห้องแม่ข่าย",
    titleEn: "Server room entry/exit log",
    descTh: "บันทึกการเข้า-ออกห้องแม่ข่าย (Server room)",
    category: "record",
    sections: [{
      tables: [{ name: "log", th: "บันทึกการเข้า-ออก", rows: 18, columns: [
        { key: "date", th: "ว/ด/ป / Date", width: 3 }, { key: "name", th: "ชื่อ-นามสกุล / Name", width: 4 },
        { key: "timeIn", th: "เวลาเข้า / In", width: 2 }, { key: "timeOut", th: "เวลาออก / Out", width: 2 },
        { key: "reason", th: "เหตุผล / Reason", width: 5 }, { key: "controlOfficer", th: "เจ้าหน้าที่ควบคุม / Officer", width: 4 }] }],
    }],
  },

  // ============================ 17 PM form ====================================
  {
    slug: "pm",
    titleTh: "แบบฟอร์มการบำรุงรักษา (PM)",
    titleEn: "Preventive Maintenance Form",
    descTh: "บันทึกงานบำรุงรักษาเชิงป้องกัน (PM)",
    category: "record",
    topGroups: [
      { name: "computerPeriod", th: "รอบ Computer & Notebook (ทุก 3 เดือน)", options: opts("1", "2", "3", "4"), inline: true },
      { name: "mobilePeriod", th: "รอบ Mobile Phone (ทุกเดือน)", options: Array.from({ length: 12 }, (_, i) => ({ value: String(i + 1), th: String(i + 1) })), inline: true },
      { name: "department", th: "แผนก / Department", options: opts("Accounting", "Admin", "Agency", "HR", "Online Marketing", "Sales", "Rental"), multi: true, other: true },
      { name: "computerChecklist", th: "Computer & Notebook — รายการตรวจ", multi: true, other: true,
        options: opts("ทำความสะอาด Drive", "ทำความสะอาด Monitor", "ทำความสะอาด Printer", "ทำความสะอาด Keyboard", "ทำความสะอาด CPU", "ตรวจการทำงาน CPU", "ตรวจ Hard Disk", "ตรวจ Software", "ตรวจ UPS", "ตรวจ Network", "ตรวจ Share Network Drive") },
      { name: "mobileChecklist", th: "Mobile Phone — รายการตรวจ", multi: true,
        options: opts("ตรวจสถานะเครื่อง (On/Off)", "ตรวจเช็คระบบและสำรองข้อมูล (Online/Offline)", "ตรวจเช็คระบบบริการสัญญาณตำแหน่ง (Online/Offline)", "ตรวจเช็คบัญชี Email (Install/Not Install)") },
      { name: "resultWork", th: "ผลการปฏิบัติงาน", options: [{ value: "ok", th: "เรียบร้อยดี" }, { value: "problem", th: "มีปัญหา" }], other: true, inline: true },
      { name: "resultFix", th: "ผลการแก้ไขปัญหา", options: [{ value: "fixed", th: "แก้ไขเรียบร้อย" }, { value: "observe", th: "รอดูอาการ" }, { value: "repair", th: "ส่งซ่อม" }], other: true, inline: true },
    ],
    sections: [{
      fields: [
        { name: "serviceId", th: "Service ID", type: "text", half: true },
        { name: "serviceDate", th: "Service Date", type: "date", half: true },
        { name: "serviceStart", th: "เวลาเริ่ม / Service Start", type: "time", half: true },
        { name: "serviceFinish", th: "เวลาเสร็จ / Finish", type: "time", half: true },
        { name: "servicePeriod", th: "ระยะเวลา / Service Period (Hrs:Min)", type: "text", half: true },
        { name: "representative", th: "ผู้ให้บริการ / Service Representative", type: "text", half: true },
        { name: "representative2", th: "ผู้ให้บริการ (คนที่ 2) / Name", type: "text" },
      ],
    }],
  },

  // ============================ reference docs ================================
  { slug: "pm-schedule", titleTh: "ตารางแผนบำรุงรักษาประจำปี", titleEn: "Annual Preventive Maintenance Schedule", descTh: "เอกสารอ้างอิง — ดาวน์โหลดต้นฉบับ", category: "reference", referenceOnly: true, sections: [] },
  { slug: "active-backup-server", titleTh: "Active Backup Server", titleEn: "Active Backup Server", descTh: "เอกสารอ้างอิง — ดาวน์โหลดต้นฉบับ", category: "reference", referenceOnly: true, sections: [] },
];

export function getForm(slug: string): FormDef | undefined {
  return FORMS.find((f) => f.slug === slug);
}

export const SIGNATURE_LABEL: Record<SignatureRole, string> = {
  requester: "ผู้ขอสิทธิ์ใช้งาน / Licence Requester",
  deptManager: "ผู้จัดการแผนก / Department Manager",
  itSupport: "ผู้ตรวจสอบ / IT Support",
  itManager: "หัวหน้าแผนก / IT Manager",
  management: "ฝ่ายบริหาร / Management",
};
