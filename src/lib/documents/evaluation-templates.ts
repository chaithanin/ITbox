/**
 * Probation 30 / 60 / 90-day KPI evaluation templates.
 *
 * These are DOCUMENT/HR templates — they define the KPI structure, per-stage
 * descriptors, weights, numeric targets, and grading bands for a role. They do
 * not grant any system access; an Evaluation is a review record only.
 *
 * Scoring model (uniform across templates so one form/PDF/score engine serves
 * every role):
 *  - Each KPI is scored 1–5 at each checkpoint that has been reached (30/60/90).
 *  - A KPI's score = the stage-weighted average of its answered checkpoints,
 *    converted to a percentage (score / scaleMax * 100).
 *  - Overall = the KPI-weighted average of answered KPIs (0–100), graded by band.
 * Weights are normalized over what has actually been filled, so a 30-day-only
 * review is not penalized for empty 60/90 columns.
 */

export type EvalTemplateKey = "IT_SUPPORT" | "IT_ASSISTANT_MANAGER";
export type StageKey = "d30" | "d60" | "d90";

export const STAGE_KEYS: StageKey[] = ["d30", "d60", "d90"];
export const STAGE_LABEL: Record<StageKey, string> = { d30: "30 วัน", d60: "60 วัน", d90: "90 วัน" };

export interface EvalKpi {
  key: string;
  label: string; // English/short label
  labelTh: string; // Thai label
  weight: number; // percent; kpis sum to 100
  target: string; // numeric / outcome target for the role
  d30: string;
  d60: string;
  d90: string;
  evidence: string; // suggested evidence to attach
}

export interface NumericKpi {
  label: string;
  target: string;
}

export interface StageInfo {
  key: StageKey;
  label: string; // "Day 1–30 · Learn & Assist"
  goal: string; // what to prove in this window
  outcome: string; // the expected result at the end of the window
}

export interface GradeBand {
  min: number; // inclusive lower bound on the 0–100 overall score
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
  stageWeights: Record<StageKey, number>; // percent; sum to 100
  kpis: EvalKpi[];
  numericKpis: NumericKpi[];
  managerChecklist: string[]; // 90-day manager assessment items (qualitative)
  stages: StageInfo[];
  grades: GradeBand[]; // sorted by min descending
}

const GRADES: GradeBand[] = [
  { min: 90, label: "Exceeds Expectations", labelTh: "เกินความคาดหวัง", tone: "good" },
  { min: 80, label: "Meets Expectations", labelTh: "ผ่านตามเกณฑ์", tone: "ok" },
  { min: 70, label: "Needs Improvement", labelTh: "ต้องปรับปรุง", tone: "warn" },
  { min: 0, label: "Unsatisfactory", labelTh: "ไม่ผ่าน", tone: "bad" },
];

// Stage weights: the 90-day window carries the most weight because ownership is
// what the probation is really testing.
const STAGE_WEIGHTS: Record<StageKey, number> = { d30: 20, d60: 30, d90: 50 };

// ─────────────────────────────── IT Support ────────────────────────────────
const IT_SUPPORT: EvalTemplate = {
  key: "IT_SUPPORT",
  role: "IT Support",
  title: "แบบประเมิน IT Support — KPI 30 / 60 / 90 วัน",
  subtitle: "IT Support 30/60/90-Day KPI & Probation Assessment",
  scaleMax: 5,
  stageWeights: STAGE_WEIGHTS,
  kpis: [
    {
      key: "ticket",
      label: "Ticket / SLA / Incident",
      labelTh: "งาน / SLA / Incident",
      weight: 25,
      target: "SLA ≥ 95% · Closure ≥ 85–90% · Reopen ≤ 5–10%",
      d30: "รับ Ticket และบันทึกถูกต้อง เข้าใจ SLA และตอบรับงานได้",
      d60: "แก้ไข/ปิดงานได้เอง ≥ 70–80% ทำตาม SLA ได้สม่ำเสมอ",
      d90: "แก้ไขได้เอง ≥ 85–90% ควบคุม SLA ได้ ≥ 95%",
      evidence: "Ticket log, SLA report, Reopen rate",
    },
    {
      key: "tech",
      label: "Technical Skill (HW/SW)",
      labelTh: "ทักษะช่าง (ฮาร์ดแวร์/ซอฟต์แวร์)",
      weight: 20,
      target: "Setup + Troubleshoot ครบถ้วน",
      d30: "Setup PC / Printer / Software แก้ปัญหา Basic IT ได้",
      d60: "Troubleshoot Windows / Printer / Scanner / Wi-Fi ได้",
      d90: "ดูแล Asset & Standard Configuration เป็นผู้เชี่ยวชาญงานที่รับผิดชอบ",
      evidence: "Setup checklist, งานที่ปิด, ภาพก่อน/หลัง",
    },
    {
      key: "problem",
      label: "Problem Solving",
      labelTh: "การแก้ปัญหา",
      weight: 15,
      target: "Root Cause + Preventive Action",
      d30: "แก้ปัญหา Basic ได้",
      d60: "วิเคราะห์ Root Cause ได้",
      d90: "แก้ปัญหาที่เกิดซ้ำ และเสนอ Preventive Action",
      evidence: "Root cause note, Preventive action, Problem record",
    },
    {
      key: "netm365",
      label: "Network / M365 / Endpoint",
      labelTh: "เครือข่าย / M365 / Endpoint",
      weight: 10,
      target: "ดูแล M365 & เครือข่ายเบื้องต้นได้",
      d30: "เข้าใจ LAN/Wi-Fi/IP และ M365 User/Password/Permission พื้นฐาน",
      d60: "Troubleshoot เครือข่ายเบื้องต้น จัดการ Account/License ตรวจ Endpoint Security",
      d90: "วิเคราะห์ VLAN/AP/Switch/Internet และปัญหา M365/Entra/Endpoint ได้",
      evidence: "M365 admin log, Network diagram, Endpoint report",
    },
    {
      key: "security",
      label: "Security",
      labelTh: "ความปลอดภัย",
      weight: 10,
      target: "Security Compliance 100%",
      d30: "เข้าใจกฎ Security Policy",
      d60: "ตรวจสอบ Antivirus / Endpoint",
      d90: "ตรวจสอบ Incident และเสนอแนวทางป้องกัน",
      evidence: "Security checklist, Antivirus/Endpoint report",
    },
    {
      key: "assetdoc",
      label: "Asset & Documentation",
      labelTh: "ทรัพย์สิน & เอกสาร",
      weight: 10,
      target: "Asset Accuracy ≥ 98% · Doc ≥ 95%",
      d30: "รู้จัก Asset และบันทึก Ticket",
      d60: "Update ข้อมูล Asset และทำ KB/คู่มือ",
      d90: "ข้อมูล Asset ถูกต้องตรวจสอบได้ สร้าง/ปรับปรุง SOP & Knowledge Base",
      evidence: "Asset register, KB article, SOP",
    },
    {
      key: "userservice",
      label: "User Service",
      labelTh: "การบริการผู้ใช้",
      weight: 5,
      target: "User Satisfaction ≥ 4/5",
      d30: "สุภาพ ตอบสนองดี",
      d60: "แก้ปัญหาและติดตามงาน",
      d90: "ได้รับ Feedback ที่ดี และลดปัญหาซ้ำ",
      evidence: "Satisfaction survey, Feedback",
    },
    {
      key: "teamwork",
      label: "Teamwork / Responsibility",
      labelTh: "การทำงานเป็นทีม / ความรับผิดชอบ",
      weight: 5,
      target: "รับผิดชอบงาน/Project ย่อยได้",
      d30: "เรียนรู้ Workflow ของทีม",
      d60: "ทำงานร่วมทีมได้",
      d90: "รับผิดชอบงาน / Project ย่อยได้เอง",
      evidence: "Team feedback, งานที่รับผิดชอบ",
    },
  ],
  numericKpis: [
    { label: "Ticket SLA Compliance", target: "≥ 95%" },
    { label: "First Response ภายใน SLA", target: "≥ 95%" },
    { label: "Ticket Closure (ของงานที่ได้รับมอบหมาย)", target: "≥ 85–90%" },
    { label: "Ticket Reopen Rate", target: "≤ 5–10%" },
    { label: "Asset Data Accuracy", target: "≥ 98%" },
    { label: "Documentation Compliance", target: "≥ 95%" },
    { label: "Security Compliance", target: "100%" },
    { label: "Backup / Monitoring Check ตามรอบ", target: "100%" },
    { label: "User Satisfaction", target: "≥ 4/5" },
    { label: "Attendance / Punctuality", target: "≥ 95%" },
    { label: "Major Incident Escalation ภายในเวลา", target: "100%" },
  ],
  managerChecklist: [
    "ทำงานได้โดยไม่ต้อง Follow-up",
    "รับผิดชอบงานจนจบ",
    "กล้าตัดสินใจในเรื่องที่อยู่ใน Scope",
    "รู้ว่าเมื่อไรต้อง Escalate",
    "สื่อสารกับ User และ Vendor ได้",
    "มี Ownership",
    "มีแนวคิดปรับปรุงระบบ (Improvement 1–2 เรื่องที่เสนอเอง)",
  ],
  stages: [
    {
      key: "d30",
      label: "Day 1–30 · Learn & Assist",
      goal: "พิสูจน์ว่าเรียนรู้งานได้ — เข้าใจโครงสร้าง IT, Network, PC/Printer/CCTV/NAS/Server, M365, ระบบ Ticket, Security Policy; Setup เครื่อง / Reset Password / ติดตั้ง Software / แก้ปัญหา Basic ได้",
      outcome: "รับงานได้ โดยยังมี Senior คอยช่วย",
    },
    {
      key: "d60",
      label: "Day 31–60 · Independent Support",
      goal: "ทำงานเองได้จริง — รับ/ปิด Ticket เอง, Troubleshoot Windows/Network/Printer/Wi-Fi, ดูแล M365 User, ตรวจ Endpoint Security, Update Asset, ทำ Documentation, Escalate & ประสาน Vendor, Preventive Maintenance",
      outcome: "งานประจำไม่ต้องให้ Senior บอกทุกขั้นตอน",
    },
    {
      key: "d90",
      label: "Day 61–90 · Ownership",
      goal: "รับผิดชอบ IT Support ได้จริง — คุม SLA, วิเคราะห์ Root Cause, ลดปัญหาซ้ำ, ทำ SOP/KB, ดูแล Asset & Security, Preventive Maintenance, ประสาน Vendor, รายงาน Manager, รับ Project เล็กได้ + Improvement 1–2 เรื่องที่เสนอเอง",
      outcome: "รับผิดชอบงาน IT Support ได้เต็มรูปแบบ",
    },
  ],
  grades: GRADES,
};

// ────────────────────────── IT Assistant Manager ───────────────────────────
const IT_ASSISTANT_MANAGER: EvalTemplate = {
  key: "IT_ASSISTANT_MANAGER",
  role: "IT Assistant Manager",
  title: "แบบประเมิน IT Assistant Manager — KPI 30 / 60 / 90 วัน",
  subtitle: "IT Assistant Manager 30/60/90-Day KPI & Probation Assessment",
  scaleMax: 5,
  // For this role the 90-day window is far more important than the first month.
  stageWeights: { d30: 20, d60: 30, d90: 50 },
  kpis: [
    {
      key: "infra",
      label: "IT Infrastructure & Security",
      labelTh: "โครงสร้างพื้นฐาน & ความปลอดภัย",
      weight: 15,
      target: "Infrastructure Availability ≥ 99.5% · Critical Security 100% มี Action",
      d30: "เข้าใจ Network, Firewall, Server, Cloud, Backup, Security Architecture และ Review Security Risk / Access Control / Backup",
      d60: "ดูแล/ปรับปรุง Infrastructure ได้ และเริ่ม Improvement Project ≥ 1 เรื่อง (เช่น Backup Monitoring + Alert)",
      d90: "คุม Availability ≥ 99.5% ระบุ Technical Debt + Improvement Roadmap และมี Remediation Plan ของ Critical Vulnerability",
      evidence: "Infrastructure Assessment, Risk Register, Improvement Project, Availability report",
    },
    {
      key: "project",
      label: "IT Project Management",
      labelTh: "การบริหารโครงการไอที",
      weight: 20,
      target: "Project Milestone On-Time ≥ 90% · Critical Issue Closure ≥ 90% ตาม SLA",
      d30: "Review Project Portfolio ทั้งหมด และจัดทำ Project Risk / Issue Register",
      d60: "บริหาร Project ≥ 1 โครงการด้วยตนเอง (Plan/Timeline/Milestone/Risk/UAT/Go-Live) รายงานสถานะ Green/Amber/Red ได้",
      d90: "รับ Project จาก IT Manager แล้วบริหารเองครบวงจร Milestone ตามแผน ≥ 90% + Risk/Issue Escalation ก่อนกลายเป็น Critical",
      evidence: "Project Plan, Gantt, Meeting Minutes, Risk Register, UAT, Status Report",
    },
    {
      key: "appint",
      label: "Application / Integration",
      labelTh: "แอปพลิเคชัน / การเชื่อมต่อระบบ",
      weight: 15,
      target: "Application SLA ≥ 95%",
      d30: "เข้าใจ ERP / HR / Accounting / CRM / Business Applications และ System Architecture / Data Flow",
      d60: "อธิบาย Integration (System→API→Integration→System→DW→Dashboard) และทำงานร่วม Developer/Vendor แก้ปัญหา Integration ได้",
      d90: "รับ Business Requirement → Functional → Technical Solution → Development → UAT → Go-Live ได้เอง",
      evidence: "Application Landscape, Integration diagram, UAT, SLA report",
    },
    {
      key: "digital",
      label: "Digital / AI / Automation",
      labelTh: "Digital Transformation / AI / Automation",
      weight: 15,
      target: "Production Use Case ≥ 1 (วัดผลได้) · Process Improvement ≥ 2",
      d30: "สำรวจ Process ที่ยัง Manual และระบุ AI/Automation Use Case ที่มี Potential (Opportunity List)",
      d60: "มี Use Case ที่เริ่มทำจริง ≥ 1 (Problem→Solution→Pilot→Result) ไม่ใช่แค่เสนอไอเดีย",
      d90: "มี Production Use Case ≥ 1 ที่วัดผลได้ (Hours/Cost Saved, Error Reduction, Productivity) + ROI",
      evidence: "Opportunity List, Pilot result, Before/After metric, ROI",
    },
    {
      key: "data",
      label: "Data / MIS / Dashboard",
      labelTh: "ข้อมูล / MIS / Dashboard",
      weight: 10,
      target: "Executive Dashboard / MIS ≥ 1 (Single Source of Truth)",
      d30: "เข้าใจ Data Source และ Dashboard ที่ใช้อยู่",
      d60: "ทำ/ปรับปรุง Dashboard ≥ 1 เรื่อง ตอบได้ว่า Source/ความถูกต้อง/ความถี่/Owner/วิธีคำนวณ KPI",
      d90: "สร้าง Executive Dashboard / MIS เป็น Single Source of Truth",
      evidence: "Dashboard, Data dictionary, KPI definition",
    },
    {
      key: "business",
      label: "Business Requirement / Solution Design",
      labelTh: "วิเคราะห์ความต้องการ / ออกแบบโซลูชัน",
      weight: 10,
      target: "Process Improvement ≥ 2 · Business Impact วัดได้",
      d30: "เข้าใจกระบวนการหลักของแต่ละฝ่าย",
      d60: "แปลง Business Requirement เป็น Functional Requirement ได้",
      d90: "ประชุม Business User → Solution Design → ส่งมอบ และวัด Business Impact (ลด Cost/เวลา/Manual/Error, เพิ่ม Productivity)",
      evidence: "BRD/FRD, Process analysis, Impact metric",
    },
    {
      key: "vendor",
      label: "Vendor & Team Management",
      labelTh: "การบริหาร Vendor & ทีม",
      weight: 5,
      target: "Vendor SLA Compliance ≥ 90%",
      d30: "รู้ว่า Vendor แต่ละรายรับผิดชอบอะไร",
      d60: "ประสานงาน Vendor และติดตามงานได้",
      d90: "บริหาร Vendor ตาม SLA ≥ 90% และดูแลงานร่วมกับทีมได้",
      evidence: "Vendor list, SLA report, Meeting minutes",
    },
    {
      key: "governance",
      label: "Documentation / Governance",
      labelTh: "เอกสาร / ธรรมาภิบาล",
      weight: 5,
      target: "Project Doc ≥ 95% · System Doc ≥ 90% ของระบบสำคัญ",
      d30: "ตรวจสอบว่าระบบสำคัญมี Documentation หรือไม่",
      d60: "จัดทำ/ปรับปรุง Documentation ของงานที่รับผิดชอบ",
      d90: "System/Project Documentation ครบตามเกณฑ์ และมี Governance/มาตรฐาน",
      evidence: "System doc, Project doc, Standard/Policy",
    },
    {
      key: "reporting",
      label: "Management Reporting",
      labelTh: "การรายงานผู้บริหาร",
      weight: 5,
      target: "Management Report 100% ตรงเวลา",
      d30: "ตอบ IT Manager ได้ว่า “IT ตอนนี้เป็นอย่างไร มีปัญหาอะไร 3 เดือนข้างหน้าควรทำอะไร”",
      d60: "รายงานสถานะ Project/Infrastructure ได้สม่ำเสมอ",
      d90: "รายงานผู้บริหารครบ 100% ตรงเวลา และสรุปเชิงบริหารได้",
      evidence: "Management report, Status report, Dashboard",
    },
  ],
  numericKpis: [
    { label: "Project Milestone On-Time", target: "≥ 90%" },
    { label: "Project Critical Issue Closure ตาม SLA", target: "≥ 90%" },
    { label: "Infrastructure Availability", target: "≥ 99.5%*" },
    { label: "Critical Security Issue (มี Action)", target: "100%" },
    { label: "Critical Vulnerability (มี Remediation Plan)", target: "100%" },
    { label: "Backup Monitoring", target: "100%" },
    { label: "Application SLA", target: "≥ 95%" },
    { label: "Vendor SLA Compliance", target: "≥ 90%" },
    { label: "Project Documentation", target: "≥ 95%" },
    { label: "System Documentation (ระบบสำคัญ)", target: "≥ 90%" },
    { label: "AI / Automation Pilot", target: "≥ 1" },
    { label: "Production AI / Automation", target: "≥ 1" },
    { label: "Process Improvement", target: "≥ 2" },
    { label: "Executive Dashboard / MIS", target: "≥ 1" },
    { label: "Management Report ตรงเวลา", target: "100%" },
  ],
  managerChecklist: [
    "IT Manager Backup: รับเรื่อง Escalation แทนได้",
    "IT Manager Backup: ประสาน Vendor แทนได้",
    "IT Manager Backup: ตัดสินใจใน Scope ได้",
    "IT Manager Backup: รายงาน Management ได้",
    "IT Manager Backup: คุม Project สำคัญได้",
    "IT Manager Backup: รับมือ Incident ได้",
    "IT Manager Backup: ประสาน Business ได้",
    "Business Impact วัดผลได้ (Cost/เวลา/Error/Productivity)",
    "Project Predictability — Milestone ≥ 90% + Escalation ก่อน Critical",
    "Technology Debt Reduction — มี Improvement Roadmap",
    "AI / Automation ROI — วัดผลเป็น Business Benefit",
  ],
  stages: [
    {
      key: "d30",
      label: "Day 1–30 · Understand / Assess / Plan",
      goal: "เข้าใจ IT Environment และมองเห็นปัญหา/โอกาส — ส่งมอบ IT Infrastructure Assessment, Application Landscape, IT Project Portfolio, IT Risk & Issue Register, Digital/AI Opportunity List",
      outcome: "ตอบได้ว่า “IT ของบริษัทตอนนี้เป็นอย่างไร มีปัญหาอะไร และ 3 เดือนข้างหน้าควรทำอะไร”",
    },
    {
      key: "d60",
      label: "Day 31–60 · Execute / Improve",
      goal: "เปลี่ยนจากผู้ศึกษาเป็นผู้ขับเคลื่อน — บริหาร Project 1–2 โครงการ, Improvement Infrastructure ≥ 1, เข้าใจ Application/Integration จริง, Use Case ที่ทำจริง ≥ 1, Dashboard ≥ 1",
      outcome: "เริ่มขับเคลื่อนงานเองได้ ไม่ใช่แค่ศึกษา",
    },
    {
      key: "d90",
      label: "Day 61–90 · Own / Deliver / Lead",
      goal: "ทำหน้าที่ IT Assistant Manager ได้จริง — Project Ownership ครบวงจร, แปลง Business Requirement เป็น Solution, Production AI/Automation ≥ 1 (วัดผลได้), เป็น IT Manager Backup ได้",
      outcome: "รับผิดชอบ IT Operations & Project สำคัญแทน IT Manager ได้ 3–5 วัน",
    },
  ],
  grades: GRADES,
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

export interface KpiComputed {
  key: string;
  /** stage-weighted 1..scaleMax average, or null if nothing filled */
  avg: number | null;
  /** avg as a 0..100 percentage */
  percent: number | null;
}
export interface EvalComputed {
  perKpi: KpiComputed[];
  /** overall 0..100 or null if nothing scored */
  overall: number | null;
  grade: GradeBand | null;
}

function clampScore(v: unknown, scaleMax: number): number | null {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n) || n <= 0) return null; // 0 / blank / NaN = not scored
  return Math.min(Math.max(Math.round(n), 1), scaleMax);
}

/** Compute per-KPI and overall scores, normalizing weights over what is filled. */
export function computeEvaluation(template: EvalTemplate, scores: EvalScores): EvalComputed {
  const perKpi: KpiComputed[] = [];
  let weightedSum = 0;
  let weightUsed = 0;

  for (const kpi of template.kpis) {
    const raw = scores[kpi.key] ?? {};
    let sw = 0;
    let swScore = 0;
    for (const stage of STAGE_KEYS) {
      const s = clampScore(raw[stage], template.scaleMax);
      if (s == null) continue;
      const w = template.stageWeights[stage];
      sw += w;
      swScore += w * s;
    }
    if (sw === 0) {
      perKpi.push({ key: kpi.key, avg: null, percent: null });
      continue;
    }
    const avg = swScore / sw; // 1..scaleMax
    const percent = (avg / template.scaleMax) * 100;
    perKpi.push({ key: kpi.key, avg, percent });
    weightedSum += kpi.weight * percent;
    weightUsed += kpi.weight;
  }

  if (weightUsed === 0) return { perKpi, overall: null, grade: null };
  const overall = weightedSum / weightUsed; // 0..100
  const grade = template.grades.find((g) => overall >= g.min) ?? null;
  return { perKpi, overall, grade };
}
