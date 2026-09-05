// ============================================================================
// IT document templates (Chaithanin) — data-driven definitions.
//
// Each form is described once here; the fill-in page (src/app/(app)/documents)
// and the PDF generator (src/lib/documents/pdf.ts) both read these definitions,
// so the on-screen form and the generated PDF always match the source form.
//
// Two entries (pm-schedule, active-backup-server) are reference documents:
// they are download-only (referenceOnly), served from /public/forms.
// ============================================================================

export type FieldType = "text" | "textarea" | "date" | "time" | "number";

export interface Field {
  name: string;
  th: string;
  en?: string;
  type: FieldType;
  half?: boolean; // render two-up on screen
}

export interface OptionGroup {
  name: string;
  th: string;
  en?: string;
  options: { value: string; th: string; en?: string }[];
  multi?: boolean; // checkboxes vs single-choice
  other?: boolean; // append an "Other: ____" free-text option
}

export interface TableColumn {
  key: string;
  th: string;
  en?: string;
  width: number; // relative weight
}

export interface TableSpec {
  name: string;
  th: string;
  en?: string;
  columns: TableColumn[];
  rows: number;
}

export interface Section {
  title?: string;
  fields?: Field[];
  groups?: OptionGroup[];
  tables?: TableSpec[];
  note?: string; // static helper/agreement text printed in the section
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
  signatures: SignatureRole[];
  referenceOnly?: boolean;
}

// ---- shared building blocks ------------------------------------------------

const DEPARTMENTS = [
  "Rental", "Sales", "Sale Support", "Online Sales", "Online Marketing",
  "Graphic", "Agency", "Admin", "Accounting", "Purchasing", "HR", "Outsource",
].map((d) => ({ value: d, th: d }));

const DEPARTMENTS_SHORT = [
  "Sales", "Marketing", "Online Marketing", "Graphic", "HR", "Admin", "Accounting", "Rental",
].map((d) => ({ value: d, th: d }));

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]
  .map((d) => ({ value: d, th: d }));

const TIMES = [
  { value: "09.00-18.00", th: "09.00am-18.00pm" },
  { value: "09.00-12.00", th: "09.00am-12.00pm" },
  { value: "13.00-18.00", th: "13.00pm-18.00pm" },
];

/** Standard requester identity block. */
function requester(extra: Field[] = [], opts: { id?: boolean } = { id: true }): Section {
  const fields: Field[] = [];
  if (opts.id !== false) fields.push({ name: "employeeCode", th: "รหัสพนักงาน / Staff ID", type: "text" });
  fields.push(
    { name: "nameTh", th: "ชื่อ-สกุลภาษาไทย (นาย/นาง/นางสาว)", type: "text" },
    { name: "nameEn", th: "ชื่อ-สกุลภาษาอังกฤษ (Mr./Mrs./Ms.)", type: "text" },
    { name: "phone", th: "เบอร์โทรศัพท์ / Phone No", type: "text", half: true },
    { name: "email", th: "อีเมล / Email", type: "text", half: true },
    ...extra,
  );
  return { title: "สำหรับผู้ขอสิทธิ์ / For the Requester", fields };
}

// ---- form catalogue --------------------------------------------------------

export const FORMS: FormDef[] = [
  {
    slug: "access-request",
    titleTh: "แบบฟอร์มขอสิทธิ์การใช้งานระบบสารสนเทศ",
    titleEn: "Information system license request form",
    descTh: "ขอเปิดสิทธิ์เข้าใช้งานระบบ/แอปพลิเคชันต่าง ๆ",
    category: "request",
    topGroups: [{ name: "department", th: "แผนก / Department", options: DEPARTMENTS, multi: true, other: true }],
    sections: [
      requester([{ name: "department2", th: "แผนก / Department", type: "text" }, { name: "note", th: "หมายเหตุ / Note", type: "textarea" }]),
      {
        title: "ระบบที่ขอสิทธิ์ / Systems requested",
        note: "ระบุระบบและระดับสิทธิ์ที่ต้องการ (Admin / Editor / Viewer) — ดูรายการระบบทั้งหมดได้ในแบบฟอร์มต้นฉบับ",
        tables: [{
          name: "systems", th: "ระบบที่ขอสิทธิ์",
          columns: [
            { key: "system", th: "ระบบ / System", width: 4 },
            { key: "level", th: "ระดับสิทธิ์ / Permission", width: 3 },
            { key: "detail", th: "รายละเอียด / Detail", width: 5 },
          ],
          rows: 8,
        }],
      },
    ],
    signatures: ["requester", "deptManager", "itSupport", "itManager", "management"],
  },
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
    signatures: ["requester", "deptManager", "itSupport", "itManager", "management"],
  },
  {
    slug: "vpn",
    titleTh: "แบบฟอร์มขอใช้งานระบบ VPN",
    titleEn: "VPN System Application Form",
    descTh: "ขอใช้งาน VPN เชื่อมต่อระบบภายใน",
    category: "request",
    topGroups: [
      { name: "days", th: "วันที่ใช้งาน / Length of Work (Days)", options: DAYS, multi: true },
      { name: "time", th: "ช่วงเวลา / Length of Work (Time)", options: TIMES, multi: true, other: true },
    ],
    sections: [requester([{ name: "note", th: "หมายเหตุ / Note", type: "textarea" }])],
    signatures: ["requester", "deptManager", "itSupport", "itManager", "management"],
  },
  {
    slug: "remote-access",
    titleTh: "แบบฟอร์มขอรีโมทจากระยะไกล",
    titleEn: "Remote Access Request Form",
    descTh: "ขอรีโมทเข้าเครื่องจากระยะไกล",
    category: "request",
    topGroups: [
      {
        name: "tool", th: "ประเภท / Request Type",
        options: ["Remote Desktop", "TeamViewer", "AnyDesk", "Chrome Remote"].map((v) => ({ value: v, th: v })),
        multi: true, other: true,
      },
      { name: "days", th: "วันที่ใช้งาน / Length of Work (Days)", options: DAYS, multi: true },
      { name: "time", th: "ช่วงเวลา / Length of Work (Time)", options: TIMES, multi: true, other: true },
    ],
    sections: [requester([{ name: "conditions", th: "เงื่อนไขการรีโมท / Conditions for remote control", type: "textarea" }])],
    signatures: ["requester", "deptManager", "itSupport", "itManager", "management"],
  },
  {
    slug: "data-recovery",
    titleTh: "แบบฟอร์มขอกู้คืนข้อมูล",
    titleEn: "Information Recovery Data request form",
    descTh: "ขอกู้คืนข้อมูลที่สูญหาย",
    category: "request",
    topGroups: [
      {
        name: "requestType", th: "ประเภท / Request Type",
        options: ["Mobile Phone", "Computer PC", "Computer Notebook", "Share Folder"].map((v) => ({ value: v, th: v })),
        multi: true,
      },
      { name: "department", th: "แผนก / Department", options: DEPARTMENTS_SHORT, multi: true },
    ],
    sections: [requester([{ name: "source", th: "แหล่งที่มาของข้อมูลที่ต้องการกู้คืน / Source of data to recover", type: "textarea" }])],
    signatures: ["requester", "deptManager", "itSupport", "itManager", "management"],
  },
  {
    slug: "access-review",
    titleTh: "แบบฟอร์มสอบทานสิทธิ์",
    titleEn: "Access Rights Review form",
    descTh: "สอบทาน/ยกเลิก/ต่ออายุสิทธิ์การใช้งาน",
    category: "request",
    topGroups: [
      {
        name: "requestType", th: "ประเภท / Request Type",
        options: [
          { value: "verify", th: "ตรวจสอบสิทธิ์ / Verify rights" },
          { value: "cancel", th: "ยกเลิกสิทธิ์ / Cancel Permission" },
          { value: "extend", th: "ต่ออายุสิทธิ์ / Extend access rights" },
        ], multi: true,
      },
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
    signatures: ["deptManager", "itSupport", "itManager", "management"],
  },
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
        note: "ข้อตกลง: (1) ห้ามนำอุปกรณ์ต่อพ่วงกับเครื่องแม่ข่ายหรืออุปกรณ์อื่นในห้องควบคุมโดยเด็ดขาด (2) หากจำเป็นต้องดำเนินการตามข้อ 1 ให้แจ้งผู้รับผิดชอบระบบ และแจ้งหัวหน้าแผนกทราบก่อนดำเนินการทุกครั้ง",
      },
    ],
    signatures: ["requester", "deptManager", "itSupport", "itManager", "management"],
  },
  {
    slug: "system-development",
    titleTh: "แบบฟอร์มขอพัฒนาระบบ",
    titleEn: "System Development request form",
    descTh: "ขอพัฒนา/ปรับปรุงระบบงาน",
    category: "request",
    topGroups: [{
      name: "department", th: "แผนก / Department",
      options: [...DEPARTMENTS_SHORT, { value: "Outsource", th: "Outsource" }], multi: true,
    }],
    sections: [requester([{ name: "reason", th: "สาเหตุที่ขอพัฒนาระบบ / Reasons for requesting system development", type: "textarea" }])],
    signatures: ["requester", "deptManager", "itSupport", "itManager", "management"],
  },
  {
    slug: "asset-disposal",
    titleTh: "แบบฟอร์มขอจำหน่ายทรัพย์สิน",
    titleEn: "Asset disposal request form",
    descTh: "ขออนุมัติจำหน่ายทรัพย์สินที่ใช้งานไม่ได้ออกจากทะเบียน",
    category: "record",
    topGroups: [
      {
        name: "reason", th: "สาเหตุ / Reason",
        options: [
          { value: "defective", th: "ชำรุดบกพร่อง / Defective" },
          { value: "deteriorated", th: "เสื่อมสภาพ ตกรุ่น / Deterioration, outdated" },
          { value: "notWorthRepair", th: "ซ่อมไม่คุ้ม / Not worth repairing" },
          { value: "warrantyExpired", th: "หมดระยะเวลาประกัน / Warranty expired" },
        ], multi: true,
      },
      {
        name: "method", th: "วิธีจำหน่าย / Method",
        options: [
          { value: "sell", th: "ขาย / Sell" },
          { value: "exchange", th: "แลกเปลี่ยน / Exchange" },
          { value: "transfer", th: "โอน / Transfer" },
          { value: "destroy", th: "แปรสภาพหรือทำลาย / Transform or Destroy" },
        ], multi: true,
      },
    ],
    sections: [
      {
        fields: [
          { name: "date", th: "วันที่ / Date", type: "date", half: true },
          { name: "operatedBy", th: "ดำเนินการโดย / Operated by", type: "text", half: true },
        ],
        tables: [{
          name: "items", th: "รายการทรัพย์สิน",
          columns: [
            { key: "type", th: "ประเภท / Type", width: 4 },
            { key: "registration", th: "หมายเลขทะเบียน / Registration No.", width: 4 },
            { key: "quantity", th: "จำนวน / Qty", width: 2 },
            { key: "note", th: "หมายเหตุ / Note", width: 4 },
          ],
          rows: 10,
        }],
      },
    ],
    signatures: ["itSupport", "itManager", "management"],
  },
  {
    slug: "server-room-log",
    titleTh: "แบบฟอร์มขอเข้า-ออกห้องแม่ข่าย",
    titleEn: "Server room entry/exit log",
    descTh: "บันทึกการเข้า-ออกห้องแม่ข่าย (Server room)",
    category: "record",
    sections: [{
      tables: [{
        name: "log", th: "บันทึกการเข้า-ออก",
        columns: [
          { key: "date", th: "ว/ด/ป / Date", width: 3 },
          { key: "name", th: "ชื่อ-นามสกุล / Name", width: 4 },
          { key: "timeIn", th: "เวลาเข้า / In", width: 2 },
          { key: "timeOut", th: "เวลาออก / Out", width: 2 },
          { key: "reason", th: "เหตุผล / Reason", width: 5 },
          { key: "controlOfficer", th: "เจ้าหน้าที่ควบคุม / Officer", width: 4 },
        ],
        rows: 18,
      }],
    }],
    signatures: [],
  },
  {
    slug: "pm",
    titleTh: "แบบฟอร์มการบำรุงรักษา (PM)",
    titleEn: "Preventive Maintenance Form",
    descTh: "บันทึกงานบำรุงรักษาเชิงป้องกัน (PM)",
    category: "record",
    topGroups: [
      {
        name: "computerPeriod", th: "รอบ Computer & Notebook (ทุก 3 เดือน)",
        options: ["1", "2", "3", "4"].map((v) => ({ value: v, th: v })), multi: false,
      },
      {
        name: "mobilePeriod", th: "รอบ Mobile Phone (ทุกเดือน)",
        options: Array.from({ length: 12 }, (_, i) => ({ value: String(i + 1), th: String(i + 1) })), multi: false,
      },
      {
        name: "department", th: "แผนก / Department",
        options: ["Accounting", "Admin", "Agency", "HR", "Online Marketing", "Sales", "Rental"].map((v) => ({ value: v, th: v })),
        multi: true, other: true,
      },
      {
        name: "computerChecklist", th: "Computer & Notebook — รายการตรวจ",
        options: [
          "ทำความสะอาด Drive", "ทำความสะอาด Monitor", "ทำความสะอาด Printer", "ทำความสะอาด Keyboard",
          "ทำความสะอาด CPU", "ตรวจการทำงาน CPU", "ตรวจ Hard Disk", "ตรวจ Software",
          "ตรวจ UPS", "ตรวจ Network", "ตรวจ Share Network Drive",
        ].map((v) => ({ value: v, th: v })), multi: true, other: true,
      },
      {
        name: "mobileChecklist", th: "Mobile Phone — รายการตรวจ",
        options: [
          "ตรวจสถานะเครื่อง", "ตรวจเช็คระบบและสำรองข้อมูล", "ตรวจเช็คระบบบริการสัญญาณตำแหน่ง", "ตรวจเช็คบัญชี Email",
        ].map((v) => ({ value: v, th: v })), multi: true,
      },
      {
        name: "resultWork", th: "ผลการปฏิบัติงาน",
        options: [{ value: "ok", th: "เรียบร้อยดี" }, { value: "problem", th: "มีปัญหา" }], multi: false, other: true,
      },
      {
        name: "resultFix", th: "ผลการแก้ไขปัญหา",
        options: [
          { value: "fixed", th: "แก้ไขเรียบร้อย" }, { value: "observe", th: "รอดูอาการ" }, { value: "repair", th: "ส่งซ่อม" },
        ], multi: false, other: true,
      },
    ],
    sections: [{
      fields: [
        { name: "serviceId", th: "Service ID", type: "text", half: true },
        { name: "serviceDate", th: "Service Date", type: "date", half: true },
        { name: "serviceStart", th: "เวลาเริ่ม / Service Start", type: "time", half: true },
        { name: "serviceFinish", th: "เวลาเสร็จ / Finish", type: "time", half: true },
        { name: "representative", th: "ผู้ให้บริการ / Service Representative", type: "text" },
      ],
    }],
    signatures: [],
  },
  // ---- reference documents (download only) ---------------------------------
  {
    slug: "pm-schedule",
    titleTh: "ตารางแผนบำรุงรักษาประจำปี",
    titleEn: "Annual Preventive Maintenance Schedule",
    descTh: "เอกสารอ้างอิง — ดาวน์โหลดต้นฉบับ",
    category: "reference",
    referenceOnly: true,
    sections: [],
    signatures: [],
  },
  {
    slug: "active-backup-server",
    titleTh: "Active Backup Server",
    titleEn: "Active Backup Server",
    descTh: "เอกสารอ้างอิง — ดาวน์โหลดต้นฉบับ",
    category: "reference",
    referenceOnly: true,
    sections: [],
    signatures: [],
  },
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
