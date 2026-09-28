/**
 * Probation 30 / 60 / 90-day KPI evaluation templates.
 *
 * DOCUMENT/HR templates only — they define the KPI structure, per-round
 * descriptors, category weights, numeric targets and grading bands for a role.
 * They grant no system access; an Evaluation is a review record only.
 *
 * Scoring model (mirrors the company form "แบบประเมินผลการทดลองงาน"):
 *  - Each KPI is scored 1–5 at each round that has been reached (30/60/90),
 *    compared to that round's target.
 *  - KPIs roll up into weighted categories. For a round:
 *      categoryScore = (avg of the category's filled KPIs ÷ 5) × categoryWeight
 *      roundTotal    = Σ categoryScore   (0–100, weights sum to 100)
 *    Each round is scored INDEPENDENTLY (not blended); the 90-day round is the
 *    one used for the probation decision.
 *  - Partial rounds normalize over the categories actually filled, so a
 *    30-day-only review is not penalized for empty categories.
 */

export type EvalTemplateKey = "IT_SUPPORT" | "IT_ASSISTANT_MANAGER";
export type StageKey = "d30" | "d60" | "d90";

export const STAGE_KEYS: StageKey[] = ["d30", "d60", "d90"];
export const STAGE_LABEL: Record<StageKey, string> = { d30: "30 วัน", d60: "60 วัน", d90: "90 วัน" };

export const SCORE_LEVELS: { value: number; label: string }[] = [
  { value: 5, label: "5 = เกินเป้าหมายของรอบนี้อย่างชัดเจน" },
  { value: 4, label: "4 = ทำได้ตามเป้าหมายของรอบนี้" },
  { value: 3, label: "3 = ใกล้เป้าหมาย ยังต้องพัฒนาบางส่วน" },
  { value: 2, label: "2 = ต่ำกว่าเป้าหมาย ต้องมีคนช่วยเป็นส่วนใหญ่" },
  { value: 1, label: "1 = ต่ำกว่าเป้าหมายมาก / ยังทำไม่ได้" },
];
export const SCALE_LEGEND = "5 = เกินเป้าหมาย · 4 = ตามเป้าหมาย · 3 = ใกล้เป้าหมาย · 2 = ต่ำกว่าเป้า ต้องมีคนช่วย · 1 = ยังทำไม่ได้";

export interface EvalKpi {
  key: string;
  no: number; // display number 1..N
  label: string; // English/short label
  labelTh: string; // Thai label
  category: string; // category key this KPI rolls up into
  d30: string;
  d60: string;
  d90: string;
}

export interface EvalCategory {
  key: string;
  label: string;
  labelTh: string;
  weight: number; // percent; categories sum to 100
  kpiKeys: string[];
}

export interface NumericKpi {
  label: string;
  target: string;
  category: string; // scoring category it supports (label text)
}

export interface StageInfo {
  key: StageKey;
  label: string; // "Day 1–30 · Learn & Assist"
  question: string; // the round's key question
  outcome: string; // expected result at the end of the window
  checklist: string[]; // "สิ่งที่ต้องทำได้ในช่วงนี้"
}

export interface GradeBand {
  min: number; // inclusive lower bound on the 0–100 round total
  label: string;
  labelTh: string;
  tone: "good" | "ok" | "warn" | "bad";
}

export interface EvalTemplate {
  key: EvalTemplateKey;
  role: string;
  title: string;
  subtitle: string;
  scaleMax: number; // 5
  categories: EvalCategory[];
  kpis: EvalKpi[];
  numericKpis: NumericKpi[];
  managerChecklist: string[]; // 90-day manager assessment (qualitative)
  stages: StageInfo[];
  grades: GradeBand[]; // sorted by min descending
  passMark: number; // round total that "passes" probation
}

const GRADES: GradeBand[] = [
  { min: 90, label: "Exceeds Expectations", labelTh: "เกินความคาดหวัง", tone: "good" },
  { min: 80, label: "Meets Expectations", labelTh: "ตามความคาดหวัง", tone: "ok" },
  { min: 70, label: "Needs Improvement", labelTh: "ต้องปรับปรุง", tone: "warn" },
  { min: 0, label: "Unsatisfactory", labelTh: "ไม่เป็นไปตามความคาดหวัง", tone: "bad" },
];

// ─────────────────────────────── IT Support ────────────────────────────────
// 12 KPIs scored 1–5 per round, grouped into 8 weighted categories.
const IT_SUPPORT: EvalTemplate = {
  key: "IT_SUPPORT",
  role: "IT Support",
  title: "แบบประเมินผลการทดลองงาน — ตำแหน่ง IT Support",
  subtitle: "IT Support Probation Assessment · รอบ 30 / 60 / 90 วัน",
  scaleMax: 5,
  categories: [
    { key: "ticket", label: "Ticket / SLA / Incident", labelTh: "งาน / SLA / Incident", weight: 25, kpiKeys: ["k2", "k3"] },
    { key: "technical", label: "Technical Skill", labelTh: "ทักษะช่าง", weight: 20, kpiKeys: ["k1", "k5"] },
    { key: "problem", label: "Problem Solving", labelTh: "การแก้ปัญหา", weight: 15, kpiKeys: ["k4"] },
    { key: "netm365", label: "Network / M365 / Endpoint", labelTh: "เครือข่าย / M365 / Endpoint", weight: 10, kpiKeys: ["k6", "k7"] },
    { key: "security", label: "Security", labelTh: "ความปลอดภัย", weight: 10, kpiKeys: ["k8"] },
    { key: "assetdoc", label: "Asset & Documentation", labelTh: "ทรัพย์สิน & เอกสาร", weight: 10, kpiKeys: ["k9", "k11"] },
    { key: "userservice", label: "User Service", labelTh: "การบริการผู้ใช้", weight: 5, kpiKeys: ["k10"] },
    { key: "teamwork", label: "Teamwork / Responsibility", labelTh: "การทำงานเป็นทีม / ความรับผิดชอบ", weight: 5, kpiKeys: ["k12"] },
  ],
  kpis: [
    { key: "k1", no: 1, label: "IT Knowledge", labelTh: "ความรู้ด้านไอที", category: "technical",
      d30: "รู้จักระบบ/อุปกรณ์พื้นฐาน", d60: "แก้ปัญหาได้เองส่วนใหญ่", d90: "เป็นผู้เชี่ยวชาญงานที่รับผิดชอบ" },
    { key: "k2", no: 2, label: "Ticket / Incident", labelTh: "งาน / Incident", category: "ticket",
      d30: "รับ Ticket และบันทึกถูกต้อง", d60: "แก้ไขได้เอง ≥ 70–80%", d90: "แก้ไขได้เอง ≥ 85–90%" },
    { key: "k3", no: 3, label: "Response Time", labelTh: "เวลาตอบสนอง", category: "ticket",
      d30: "เข้าใจ SLA และตอบรับงาน", d60: "ทำตาม SLA ได้สม่ำเสมอ", d90: "ควบคุม SLA ได้ ≥ 95%" },
    { key: "k4", no: 4, label: "Problem Solving", labelTh: "การแก้ปัญหา", category: "problem",
      d30: "แก้ปัญหา Basic", d60: "วิเคราะห์ Root Cause ได้", d90: "แก้ปัญหาซ้ำและเสนอ Preventive Action" },
    { key: "k5", no: 5, label: "Hardware / Software", labelTh: "ฮาร์ดแวร์ / ซอฟต์แวร์", category: "technical",
      d30: "Setup PC, Printer, Software", d60: "Troubleshoot ได้", d90: "ดูแล Asset และ Standard Configuration" },
    { key: "k6", no: 6, label: "Network", labelTh: "เครือข่าย", category: "netm365",
      d30: "เข้าใจ LAN / Wi-Fi / IP", d60: "Troubleshoot เบื้องต้น", d90: "วิเคราะห์ VLAN, AP, Switch, Internet ได้" },
    { key: "k7", no: 7, label: "Microsoft 365 / Account", labelTh: "Microsoft 365 / บัญชีผู้ใช้", category: "netm365",
      d30: "User / Password / Permission พื้นฐาน", d60: "จัดการ Account / License", d90: "วิเคราะห์ปัญหา M365 / Entra / Endpoint ได้" },
    { key: "k8", no: 8, label: "Security", labelTh: "ความปลอดภัย", category: "security",
      d30: "เข้าใจกฎ Security", d60: "ตรวจสอบ Antivirus / Endpoint", d90: "ตรวจสอบ Incident และเสนอแนวทางป้องกัน" },
    { key: "k9", no: 9, label: "Documentation", labelTh: "เอกสาร", category: "assetdoc",
      d30: "บันทึก Ticket", d60: "ทำ KB / คู่มือ", d90: "สร้าง/ปรับปรุง SOP และ Knowledge Base" },
    { key: "k10", no: 10, label: "User Service", labelTh: "การบริการผู้ใช้", category: "userservice",
      d30: "สุภาพ ตอบสนองดี", d60: "แก้ปัญหาและติดตามงาน", d90: "ได้รับ Feedback ที่ดีและลดปัญหาซ้ำ" },
    { key: "k11", no: 11, label: "Asset Management", labelTh: "การจัดการทรัพย์สิน", category: "assetdoc",
      d30: "รู้จัก Asset", d60: "Update ข้อมูล Asset", d90: "ข้อมูล Asset ถูกต้องและตรวจสอบได้" },
    { key: "k12", no: 12, label: "Teamwork", labelTh: "การทำงานเป็นทีม", category: "teamwork",
      d30: "เรียนรู้ Workflow ทีม", d60: "ทำงานร่วมทีมได้", d90: "รับผิดชอบงาน / Project ย่อยได้" },
  ],
  numericKpis: [
    { label: "Ticket SLA Compliance", target: "≥ 95%", category: "Ticket / SLA / Incident" },
    { label: "First Response ภายใน SLA", target: "≥ 95%", category: "Ticket / SLA / Incident" },
    { label: "Ticket Closure (ของงานที่ได้รับมอบหมาย)", target: "≥ 85–90%", category: "Ticket / SLA / Incident" },
    { label: "Ticket Reopen Rate", target: "≤ 5–10%", category: "Ticket / SLA / Incident" },
    { label: "Major Incident Escalation (แจ้งในเวลา)", target: "100%", category: "Ticket / SLA / Incident" },
    { label: "Security Compliance", target: "100%", category: "Security" },
    { label: "Backup / Monitoring Check (ตามรอบ)", target: "100%", category: "Security" },
    { label: "Asset Data Accuracy", target: "≥ 98%", category: "Asset & Documentation" },
    { label: "Documentation Compliance", target: "≥ 95%", category: "Asset & Documentation" },
    { label: "User Satisfaction", target: "≥ 4 / 5", category: "User Service" },
    { label: "Attendance / Punctuality", target: "≥ 95%", category: "Teamwork / Responsibility" },
  ],
  managerChecklist: [
    "ทำงานได้โดยไม่ต้อง Follow-up",
    "รับผิดชอบงานจนจบ",
    "กล้าตัดสินใจในเรื่องที่อยู่ใน Scope",
    "รู้ว่าเมื่อไรต้อง Escalate",
    "สื่อสารกับ User และ Vendor ได้",
    "มี Ownership ต่องานที่รับผิดชอบ",
    "มีแนวคิดปรับปรุงระบบ",
  ],
  stages: [
    {
      key: "d30",
      label: "Day 1–30 · Learn & Assist",
      question: "พนักงานเรียนรู้งานได้หรือไม่",
      outcome: "รับงานได้ โดยมี Senior คอยช่วย",
      checklist: [
        "เข้าใจโครงสร้าง IT ของบริษัท", "รู้จัก Network / Firewall / Switch / AP",
        "รู้จัก PC / Printer / CCTV / NAS / Server", "เข้าใจ Microsoft 365",
        "เข้าใจระบบ Ticket", "เข้าใจ Security Policy", "Setup เครื่องใหม่ได้",
        "Reset Password / Account ได้", "ติดตั้ง Software ได้", "แก้ปัญหา Basic IT ได้",
      ],
    },
    {
      key: "d60",
      label: "Day 31–60 · Independent Support",
      question: "พนักงานทำงานเองได้จริงหรือไม่",
      outcome: "งานประจำไม่ต้องให้ Senior คอยบอกทุกขั้นตอน",
      checklist: [
        "รับและปิด Ticket ได้เอง", "Troubleshoot Windows", "Troubleshoot Network",
        "แก้ปัญหา Printer / Scanner", "แก้ปัญหา Wi-Fi", "ดูแล Microsoft 365 User",
        "ตรวจสอบ Endpoint Security", "Update ข้อมูล Asset", "ทำ Documentation",
        "Escalate ปัญหาที่เกิน Scope ได้ถูกต้อง", "ติดตามงาน Vendor", "ทำ Preventive Maintenance",
      ],
    },
    {
      key: "d90",
      label: "Day 61–90 · Ownership",
      question: "ถ้าให้รับผิดชอบงาน IT Support จริง ๆ พนักงานเอาอยู่หรือไม่",
      outcome: "รับผิดชอบงาน IT Support ได้เองและเริ่มปรับปรุงระบบ",
      checklist: [
        "รับผิดชอบ Ticket ของตัวเองได้", "ควบคุม SLA", "วิเคราะห์ Root Cause",
        "ลดปัญหาที่เกิดซ้ำ", "ทำ SOP / Knowledge Base", "ดูแล Asset ได้",
        "ตรวจสอบ Security ได้", "ทำ Preventive Maintenance", "ประสานงาน Vendor ได้",
        "รายงานปัญหาให้ Manager ได้", "รับผิดชอบ Project เล็ก ๆ ได้",
      ],
    },
  ],
  grades: GRADES,
  passMark: 80,
};

// ────────────────────────── IT Assistant Manager ───────────────────────────
// 9 KPIs, each its own weighted category (outcome-based).
const IT_ASSISTANT_MANAGER: EvalTemplate = {
  key: "IT_ASSISTANT_MANAGER",
  role: "IT Assistant Manager",
  title: "แบบประเมินผลการทดลองงาน — ตำแหน่ง IT Assistant Manager",
  subtitle: "IT Assistant Manager Probation Assessment · รอบ 30 / 60 / 90 วัน",
  scaleMax: 5,
  categories: [
    { key: "infra", label: "IT Infrastructure & Security", labelTh: "โครงสร้างพื้นฐาน & ความปลอดภัย", weight: 15, kpiKeys: ["m1"] },
    { key: "project", label: "IT Project Management", labelTh: "การบริหารโครงการไอที", weight: 20, kpiKeys: ["m2"] },
    { key: "appint", label: "Application / Integration", labelTh: "แอปพลิเคชัน / การเชื่อมต่อ", weight: 15, kpiKeys: ["m3"] },
    { key: "digital", label: "Digital / AI / Automation", labelTh: "Digital / AI / Automation", weight: 15, kpiKeys: ["m4"] },
    { key: "data", label: "Data / MIS / Dashboard", labelTh: "ข้อมูล / MIS / Dashboard", weight: 10, kpiKeys: ["m5"] },
    { key: "business", label: "Business Requirement / Solution", labelTh: "วิเคราะห์ความต้องการ / โซลูชัน", weight: 10, kpiKeys: ["m6"] },
    { key: "vendor", label: "Vendor & Team Management", labelTh: "การบริหาร Vendor & ทีม", weight: 5, kpiKeys: ["m7"] },
    { key: "governance", label: "Documentation / Governance", labelTh: "เอกสาร / ธรรมาภิบาล", weight: 5, kpiKeys: ["m8"] },
    { key: "reporting", label: "Management Reporting", labelTh: "การรายงานผู้บริหาร", weight: 5, kpiKeys: ["m9"] },
  ],
  kpis: [
    { key: "m1", no: 1, label: "IT Infrastructure & Security", labelTh: "โครงสร้างพื้นฐาน & ความปลอดภัย", category: "infra",
      d30: "เข้าใจ Network/Firewall/Server/Cloud/Backup/Security และ Review Risk/Access/Backup",
      d60: "ดูแล/ปรับปรุง Infrastructure ได้ และเริ่ม Improvement Project ≥ 1",
      d90: "คุม Availability ≥ 99.5% ระบุ Technical Debt + Roadmap และ Remediation Plan ของ Critical Vulnerability" },
    { key: "m2", no: 2, label: "IT Project Management", labelTh: "การบริหารโครงการไอที", category: "project",
      d30: "Review Project Portfolio และจัดทำ Risk / Issue Register",
      d60: "บริหาร Project ≥ 1 ด้วยตนเอง (Plan/Timeline/Milestone/Risk/UAT/Go-Live) รายงาน Green/Amber/Red",
      d90: "รับ Project แล้วบริหารเองครบวงจร Milestone ตามแผน ≥ 90% + Escalation ก่อน Critical" },
    { key: "m3", no: 3, label: "Application / Integration", labelTh: "แอปพลิเคชัน / การเชื่อมต่อ", category: "appint",
      d30: "เข้าใจ ERP/HR/Accounting/CRM และ System Architecture / Data Flow",
      d60: "อธิบาย Integration และทำงานร่วม Developer/Vendor แก้ปัญหา Integration ได้",
      d90: "รับ Requirement → Functional → Technical → Development → UAT → Go-Live ได้เอง (SLA ≥ 95%)" },
    { key: "m4", no: 4, label: "Digital / AI / Automation", labelTh: "Digital / AI / Automation", category: "digital",
      d30: "สำรวจ Process ที่ยัง Manual และระบุ AI/Automation Use Case (Opportunity List)",
      d60: "มี Use Case ที่เริ่มทำจริง ≥ 1 (Problem→Solution→Pilot→Result)",
      d90: "มี Production Use Case ≥ 1 ที่วัดผลได้ + ROI (Hours/Cost Saved, Error Reduction)" },
    { key: "m5", no: 5, label: "Data / MIS / Dashboard", labelTh: "ข้อมูล / MIS / Dashboard", category: "data",
      d30: "เข้าใจ Data Source และ Dashboard ที่ใช้อยู่",
      d60: "ทำ/ปรับปรุง Dashboard ≥ 1 ตอบได้เรื่อง Source/ความถูกต้อง/ความถี่/Owner/วิธีคำนวณ",
      d90: "สร้าง Executive Dashboard / MIS เป็น Single Source of Truth" },
    { key: "m6", no: 6, label: "Business Requirement / Solution", labelTh: "วิเคราะห์ความต้องการ / โซลูชัน", category: "business",
      d30: "เข้าใจกระบวนการหลักของแต่ละฝ่าย",
      d60: "แปลง Business Requirement เป็น Functional Requirement ได้",
      d90: "Solution Design + ส่งมอบ และวัด Business Impact (ลด Cost/เวลา/Manual/Error) ≥ 2 improvements" },
    { key: "m7", no: 7, label: "Vendor & Team Management", labelTh: "การบริหาร Vendor & ทีม", category: "vendor",
      d30: "รู้ว่า Vendor แต่ละรายรับผิดชอบอะไร", d60: "ประสานงาน Vendor และติดตามงานได้",
      d90: "บริหาร Vendor ตาม SLA ≥ 90% และดูแลงานร่วมกับทีมได้" },
    { key: "m8", no: 8, label: "Documentation / Governance", labelTh: "เอกสาร / ธรรมาภิบาล", category: "governance",
      d30: "ตรวจสอบว่าระบบสำคัญมี Documentation หรือไม่", d60: "จัดทำ/ปรับปรุง Documentation ของงานที่รับผิดชอบ",
      d90: "System/Project Documentation ครบ (System ≥ 90%, Project ≥ 95%) + Governance" },
    { key: "m9", no: 9, label: "Management Reporting", labelTh: "การรายงานผู้บริหาร", category: "reporting",
      d30: "ตอบได้ว่า IT ตอนนี้เป็นอย่างไร มีปัญหาอะไร 3 เดือนข้างหน้าควรทำอะไร",
      d60: "รายงานสถานะ Project/Infrastructure ได้สม่ำเสมอ", d90: "รายงานผู้บริหารครบ 100% ตรงเวลา และสรุปเชิงบริหารได้" },
  ],
  numericKpis: [
    { label: "Project Milestone On-Time", target: "≥ 90%", category: "IT Project Management" },
    { label: "Project Critical Issue Closure ตาม SLA", target: "≥ 90%", category: "IT Project Management" },
    { label: "Infrastructure Availability", target: "≥ 99.5%*", category: "IT Infrastructure & Security" },
    { label: "Critical Security Issue (มี Action)", target: "100%", category: "IT Infrastructure & Security" },
    { label: "Critical Vulnerability (มี Remediation Plan)", target: "100%", category: "IT Infrastructure & Security" },
    { label: "Backup Monitoring", target: "100%", category: "IT Infrastructure & Security" },
    { label: "Application SLA", target: "≥ 95%", category: "Application / Integration" },
    { label: "Vendor SLA Compliance", target: "≥ 90%", category: "Vendor & Team Management" },
    { label: "Project Documentation", target: "≥ 95%", category: "Documentation / Governance" },
    { label: "System Documentation (ระบบสำคัญ)", target: "≥ 90%", category: "Documentation / Governance" },
    { label: "AI / Automation Pilot", target: "≥ 1", category: "Digital / AI / Automation" },
    { label: "Production AI / Automation", target: "≥ 1", category: "Digital / AI / Automation" },
    { label: "Process Improvement", target: "≥ 2", category: "Business Requirement / Solution" },
    { label: "Executive Dashboard / MIS", target: "≥ 1", category: "Data / MIS / Dashboard" },
    { label: "Management Report ตรงเวลา", target: "100%", category: "Management Reporting" },
  ],
  managerChecklist: [
    "IT Manager Backup: รับเรื่อง Escalation แทนได้",
    "IT Manager Backup: ประสาน Vendor แทนได้",
    "IT Manager Backup: ตัดสินใจใน Scope ได้",
    "IT Manager Backup: รายงาน Management ได้",
    "IT Manager Backup: คุม Project สำคัญได้",
    "IT Manager Backup: รับมือ Incident ได้",
    "Business Impact วัดผลได้ / Project Milestone ≥ 90% / มี Improvement Roadmap",
  ],
  stages: [
    { key: "d30", label: "Day 1–30 · Understand / Assess / Plan",
      question: "เข้าใจ IT Environment และมองเห็นปัญหา/โอกาสหรือไม่",
      outcome: "ตอบได้ว่า “IT ตอนนี้เป็นอย่างไร มีปัญหาอะไร 3 เดือนข้างหน้าควรทำอะไร”",
      checklist: ["IT Infrastructure Assessment", "Application Landscape", "IT Project Portfolio", "IT Risk & Issue Register", "Digital / AI Opportunity List"] },
    { key: "d60", label: "Day 31–60 · Execute / Improve",
      question: "เริ่มขับเคลื่อนงานเองได้หรือไม่",
      outcome: "เริ่มขับเคลื่อนงานเองได้ ไม่ใช่แค่ศึกษา",
      checklist: ["บริหาร Project 1–2 โครงการ", "Improvement Infrastructure ≥ 1", "เข้าใจ Application/Integration จริง", "Use Case ที่ทำจริง ≥ 1", "Dashboard ≥ 1"] },
    { key: "d90", label: "Day 61–90 · Own / Deliver / Lead",
      question: "ทำหน้าที่ IT Assistant Manager ได้จริงหรือไม่",
      outcome: "รับผิดชอบ IT Operations & Project สำคัญแทน IT Manager ได้ 3–5 วัน",
      checklist: ["Project Ownership ครบวงจร", "แปลง Business Requirement เป็น Solution", "Production AI/Automation ≥ 1 (วัดผลได้)", "เป็น IT Manager Backup ได้"] },
  ],
  grades: GRADES,
  passMark: 80,
};

export const EVAL_TEMPLATES: Record<EvalTemplateKey, EvalTemplate> = {
  IT_SUPPORT,
  IT_ASSISTANT_MANAGER,
};
export const EVAL_TEMPLATE_LIST: EvalTemplate[] = [IT_SUPPORT, IT_ASSISTANT_MANAGER];

export function getEvalTemplate(key: string): EvalTemplate | null {
  return (EVAL_TEMPLATES as Record<string, EvalTemplate>)[key] ?? null;
}

// ───────────────────────────── scoring engine ──────────────────────────────

export interface KpiScoreInput {
  d30?: number | null;
  d60?: number | null;
  d90?: number | null;
  note?: string;
}
export type EvalScores = Record<string, KpiScoreInput>;

export interface RoundResult {
  total: number | null; // 0..100 or null if nothing scored in the round
  grade: GradeBand | null;
}
export interface EvalComputed {
  rounds: Record<StageKey, RoundResult>;
  /** category key -> stage -> 1..scaleMax average (only categories with data) */
  categoryAvg: Record<string, Partial<Record<StageKey, number>>>;
  /** the latest round with data (d90 > d60 > d30), used for the headline grade */
  finalStage: StageKey | null;
  overall: number | null; // finalStage round total
  grade: GradeBand | null;
}

function clampScore(v: unknown, scaleMax: number): number | null {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.min(Math.max(Math.round(n), 1), scaleMax);
}

export function computeEvaluation(template: EvalTemplate, scores: EvalScores): EvalComputed {
  const categoryAvg: Record<string, Partial<Record<StageKey, number>>> = {};
  const rounds: Record<StageKey, RoundResult> = {
    d30: { total: null, grade: null }, d60: { total: null, grade: null }, d90: { total: null, grade: null },
  };

  for (const stage of STAGE_KEYS) {
    let weightedSum = 0;
    let weightUsed = 0;
    for (const cat of template.categories) {
      const vals: number[] = [];
      for (const kk of cat.kpiKeys) {
        const s = clampScore(scores[kk]?.[stage], template.scaleMax);
        if (s != null) vals.push(s);
      }
      if (vals.length === 0) continue;
      const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
      (categoryAvg[cat.key] ||= {})[stage] = avg;
      weightedSum += cat.weight * (avg / template.scaleMax);
      weightUsed += cat.weight;
    }
    if (weightUsed > 0) {
      const total = (weightedSum / weightUsed) * 100;
      rounds[stage] = { total, grade: template.grades.find((g) => total >= g.min) ?? null };
    }
  }

  const finalStage = (["d90", "d60", "d30"] as StageKey[]).find((s) => rounds[s].total != null) ?? null;
  const overall = finalStage ? rounds[finalStage].total : null;
  const grade = finalStage ? rounds[finalStage].grade : null;
  return { rounds, categoryAvg, finalStage, overall, grade };
}

/** category score contribution for a round = (avg/scaleMax) * weight, rounded. */
export function categoryScore(template: EvalTemplate, cat: EvalCategory, avg: number | undefined): number | null {
  if (avg == null) return null;
  return (avg / template.scaleMax) * cat.weight;
}
