/**
 * ERP + external-system permission catalogue for the Information-System Access
 * Request form (/documents/access-request). Transcribed from the company's
 * master form "4.A แบบฟอร์มขอสิทธิ์การใช้งานระบบสารสนเทศ". Data only — the form
 * UI and the persisted request are driven entirely from here.
 */

// Per-menu permission flags used by every ERP module (4 checkboxes per row).
export const ERP_FLAGS = [
  { key: "enabled", label: "เปิดใช้งาน / Enabled" },
  { key: "notPrintable", label: "ห้ามพิมพ์ / Not Printable" },
  { key: "readOnly", label: "ดูอย่างเดียว / Read Only" },
  { key: "notSaveAs", label: "ห้ามบันทึกไฟล์ / Not Save As" },
] as const;
export type ErpFlagKey = (typeof ERP_FLAGS)[number]["key"];

export interface ModuleSection { title: string; items: string[] }
export interface ErpModule { code: string; title: string; sections: ModuleSection[] }

// Department tick-row at the top of the master form.
export const TOP_DEPARTMENTS = [
  "Sales", "Sale Support", "Marketing", "Agency Support", "Rental", "HR",
  "Procurement", "Accounting & Financial", "Construction", "IT", "Management", "Other",
];

export const ERP_MODULES: ErpModule[] = [
  {
    code: "AP", title: "[AP] Accounts Payable — บัญชีเจ้าหนี้",
    sections: [
      { title: "Transaction / ดำเนินการ", items: [
        "Create A/P Voucher / ตั้งหนี้ (APV จาก PO, APS จากใบสั่งจ้าง, APO เบิกอื่น ๆ)",
        "Credit Note Record / บันทึกการลดหนี้ (CNV, CNS, CNO)",
        "Billing Note / บันทึกรับวางบิล (จาก PO, WO, อื่น ๆ / E-Billing)",
        "Payment Approval / อนุมัติจ่าย (APV, APS, APO) และยกเลิกการอนุมัติ",
        "Preparing Cheque, Credit Line / จัดทำเช็ค เงินโอน และเช็คเร่งด่วน (CQ)",
        "Batch Bank Transfer / รายการโอนเงิน (batch) และอนุมัติรายการโอน",
        "Payable Settlement / บันทึกตัดเจ้าหนี้ และรับใบกำกับภาษีย้อนหลัง",
        "Bank Guarantee / หนังสือค้ำประกัน",
        "Withholding Tax / พิมพ์หนังสือรับรองหักภาษี ณ ที่จ่าย",
        "Post data to GL module / ส่งข้อมูลไประบบบัญชีแยกประเภท",
        "Document Receiving & Tracking / บันทึกรับ-ส่งเอกสาร และติดตามเอกสารบัญชี/การเงิน",
      ] },
      { title: "Report / รายงาน", items: [
        "A/P Voucher, Billing Note, Payment Report / รายงานใบสำคัญจ่าย รับวางบิล และการจ่ายชำระหนี้",
        "Cheque Register & Bank Transfer Report / รายงานทะเบียนเช็ค เงินโอน และสถานะเช็ค",
        "Tax Report / รายงานภาษีซื้อ และภาษีหัก ณ ที่จ่าย",
        "Vendor Movement & A/P Balance / รายงานเจ้าหนี้รายตัว เจ้าหนี้คงเหลือ และอายุหนี้ (Aging)",
        "Retention & Advance Report / รายงานเงินประกันผลงาน และเงินมัดจำ PO/WO",
        "Project Cost & Credit Line / รายงานต้นทุนโครงการ และสรุปวงเงินสินเชื่อ",
      ] },
      { title: "Other / อื่น ๆ", items: [
        "Setup / ตั้งค่า (ข้อมูลบริษัท, เชื่อมโยงบัญชี, ภาษี, ประเภทการจ่าย, Work Flow)",
      ] },
    ],
  },
  {
    code: "AR", title: "[AR] Accounts Receipt — บัญชีลูกหนี้",
    sections: [
      { title: "Transaction / บันทึกรายการ", items: [
        "Create Invoice / บันทึกใบแจ้งหนี้ (เงินดาวน์, ค่างวดงาน, เงินประกันผลงาน, การจำหน่าย, อื่น ๆ)",
        "Billing Note / ใบสรุปวางบิล (งานรับเหมา, งานขาย, อื่น ๆ)",
        "Create Credit Note / บันทึกใบลดหนี้",
        "A/R & CN Recording / บันทึกตั้งบัญชีลูกหนี้ / ลดหนี้",
        "Issue Tax Invoice / Receipt / ออกใบเสร็จรับเงิน / ใบกำกับภาษี",
        "AR Receiving & Settle / บันทึกรับเงินตามใบเสร็จ และบันทึกตัดลูกหนี้ (Clear AR)",
        "Receivable For Real Estate / ลูกหนี้ธุรกิจอสังหาฯ (ออกใบเสร็จจริง, ยกเลิกจอง/โอนย้าย, งานเช่า)",
        "Post data to GL module / ส่งข้อมูลไประบบบัญชีแยกประเภท",
      ] },
      { title: "Report / รายงาน", items: [
        "Re-Print / พิมพ์ซ่อมเอกสาร (ใบแจ้งหนี้, ใบเสร็จ, ใบสำคัญรับ)",
        "Check List / รายงานตรวจสอบเอกสารคงค้างแต่ละขั้นตอน",
        "Invoice with Collection Details / รายงานใบแจ้งหนี้และการรับเงิน",
        "Receipt & Receivable Report / รายงานการรับเงิน ลูกหนี้รายตัว และลูกหนี้คงเหลือ (Aging)",
        "Taxation Report / รายงานภาษีขาย และภาษีถูกหัก ณ ที่จ่าย",
        "Sale Report / รายงานการขาย (ตามพนักงานขาย / กลุ่มโครงการ / BOI)",
      ] },
    ],
  },
  {
    code: "BD", title: "[BD] Bidding System — ระบบประกวดราคาและงานขาย",
    sections: [
      { title: "Transaction", items: [
        "Request for Qualification (RFQ) / เอกสารประกวดราคา (Spec & QTY) และผลการประมูล",
        "Bill of Quantity (BOQ) / จัดทำ BOQ, งานเพิ่มเติม, งวดงาน (Milestone Payment)",
        "Create Quotation / จัดทำใบเสนอราคา",
        "Sale Order / คำสั่งขาย (สร้าง, ลดยอด, จองไป PO, ส่งมอบ)",
      ] },
      { title: "Report / รายงาน", items: [
        "Bidding & Results Report / รายงานการประมูลและผลการประมูล",
        "Contract Milestone Progress / รายงานคาดการณ์รายได้และการรับชำระตามงวดสัญญา",
      ] },
    ],
  },
  {
    code: "FA", title: "[FA] Fix Asset System — ทรัพย์สินถาวร",
    sections: [
      { title: "Transaction / บันทึกรายการ", items: [
        "Entry New Asset / บันทึกเพิ่มทรัพย์สิน และแก้ไขข้อมูลทรัพย์สิน",
        "Asset Transfer / โอนย้ายทรัพย์สิน (สร้าง-ตรวจสอบเอกสารโอนย้าย)",
        "Asset Stocktake / ตรวจนับทรัพย์สิน",
        "Asset Maintenance / บันทึกค่าบำรุงรักษา และตั้งค่าเตือน (ภาษี ประกัน)",
        "Depreciation / คำนวณค่าเสื่อมราคา (รายเดือน / ปี / วัน)",
        "Write Off Asset / ตัดจ่ายทรัพย์สิน",
      ] },
      { title: "Report / รายงาน", items: [
        "Asset Report / รายงานทรัพย์สิน (ตามโครงการ, รหัสบัญชี, ประเภท)",
        "Transfer & Count Report / รายงานการโอนย้ายและตรวจนับทรัพย์สิน",
        "Depreciation Report / รายงานค่าเสื่อมราคา (ทะเบียนทรัพย์สินรายเดือน/รายปี)",
        "Expense & Write Off Report / รายงานค่าบำรุงรักษาและการตัดจ่าย",
      ] },
    ],
  },
  {
    code: "FIN", title: "[FIN] Financial System — การเงิน",
    sections: [
      { title: "Transaction", items: [
        "Cash on hand inc. / เงินสดในมือ",
        "Cash Flow & Credit Line Facility / กระแสเงินสดและวงเงินสินเชื่อ",
        "Financial Statement & Ratio / งบการเงินและอัตราส่วนทางการเงิน",
        "Report Estimate Invoice / ประมาณการใบแจ้งหนี้ (รายโครงการ / ทุกโครงการ)",
        "Project Cash Flow / กระแสเงินสดโครงการ",
        "Revenue and Cost Project / รายได้ต้นทุนโครงการ",
      ] },
      { title: "Report / รายงาน", items: [
        "รายงาน Cash Flow กระแสเงินสดรับ–จ่าย (รายวัน) และ Report Cash Flow (2)",
      ] },
    ],
  },
  {
    code: "GL", title: "[GL] General Ledger System — บัญชีแยกประเภท",
    sections: [
      { title: "Transaction / บันทึกรายการ", items: [
        "Journal Voucher / บันทึกสมุดรายวัน (สร้าง-พิมพ์ใบสำคัญ)",
        "General Ledger Posting / ประมวลผลเพื่อปิดบัญชี",
        "Bank Reconciliation / งบกระทบยอดธนาคาร",
        "Percentage of Completion / รับรู้รายได้ (Physical / Cost Proportion / Straight Line)",
        "GL Recurring / รายการบัญชีประจำงวด",
        "Year End Closing / ปิดบัญชีประจำปี และยกเลิกการปิดบัญชี (อยู่ในเมนู Others)",
      ] },
      { title: "Report / รายงาน", items: [
        "General Ledger / บัญชีแยกประเภท (Detail / ตามโครงการ-แผนก / ก่อน-หลัง Post)",
        "Trial Balance / งบทดลอง (รวม และแยกตามโครงการ/แผนก)",
        "Financial Statement / งบการเงิน (รวมถึง Consolidate)",
        "Project Cost Report / รายงานต้นทุนโครงการ ตามรหัสงานและรหัสต้นทุน",
        "Cost Sheet (Real Estate) / ต้นทุน WIP งานอสังหาฯ",
        "Master Data & Deleted Voucher Report / ผังบัญชีและรายงานการลบใบสำคัญ",
      ] },
    ],
  },
  {
    code: "IC", title: "[IC] Inventory Control — ควบคุมสินค้าคงคลัง",
    sections: [
      { title: "Transaction", items: [
        "Document IC Receive / รับสินค้าเข้าคลัง (P/O Receive, Stock Receive)",
        "Document IC Issue / เบิกจ่ายสินค้า (Entry Document, Stock Issue)",
        "Document IC Transfer / โอนย้ายระหว่างคลัง (Transfer – Receive)",
        "Adjust / Allocate Cost / ปรับปรุงและปันส่วนต้นทุนวัสดุ",
        "Inventory Count / ตรวจนับสต๊อก",
        "Shipping System / ใบคำร้องขนสินค้าเข้า-ออก และเอกสารส่งมอบงานโครงการ",
      ] },
      { title: "Report / รายงาน", items: [
        "Stock Card Report / รายงานความเคลื่อนไหวสินค้า (QTY / QTY+มูลค่า)",
        "Stock Balance Report / รายงานสินค้าคงเหลือ (ตามคลัง, โครงการ, อายุสต๊อก)",
        "Issue / Receive / Transfer Report / รายงานการเบิก รับ และโอนย้าย",
        "Summary Material Issue & Budget/Actual / สรุปการเบิกวัสดุเทียบงบประมาณ",
        "รายงาน กศก. / รายงานนำเข้า-ส่งออกสินค้า",
      ] },
    ],
  },
  {
    code: "MASTER", title: "[MASTER] Master — ข้อมูลหลักของระบบ",
    sections: [
      { title: "System Configuration / ตั้งค่าระบบ", items: [
        "Setup Customize, Alert, Notification / ตั้งค่าระบบ การแจ้งเตือน และ Line Group",
        "Setup Form Document & Consent Form (PDPA) / ตั้งค่าฟอร์มเอกสารและแบบขอความยินยอม",
      ] },
      { title: "Common Master / ข้อมูลหลักส่วนกลาง", items: [
        "Setup Company, Department, Project Group / ข้อมูลบริษัท แผนก และกลุ่มโครงการ",
        "Authorized Signature / สิทธิ์การอนุมัติ และ Running Document / รูปแบบเลขที่เอกสาร",
      ] },
      { title: "User Defined / ข้อมูลหลักผู้ใช้กำหนด", items: [
        "Vendor / Customer / Owner Data / ข้อมูลเจ้าหนี้ ลูกหนี้ และเจ้าของโครงการ",
        "Material Code, Cost Code, Unit Code / รหัสวัสดุ โครงสร้างต้นทุน และหน่วยนับ",
      ] },
      { title: "Module Master (BD / PO / AP / AR / FN / บัญชี / FA / IC)", items: [
        "Tender, Project/Site, BOQ Code / ข้อมูลงานประมูลและโครงการ (BD)",
        "Setup Tax, Less Other, Paid Type / ภาษีหัก ณ ที่จ่าย รายการหัก และประเภทการจ่าย (AP/FN)",
        "Bank Info & Credit Line / ข้อมูลธนาคาร วงเงินถาวรและวงเงินโครงการ (FN)",
        "Account Code & Format Account / ผังบัญชี การเชื่อมโยงบัญชี และรอบบัญชี",
        "Asset Type & Depreciation Method / ประเภททรัพย์สินและวิธีคิดค่าเสื่อม (FA)",
        "Warehouse, Area, Min/Max / คลังสินค้า พื้นที่ และ Minimum Stock (IC)",
      ] },
    ],
  },
  {
    code: "OF", title: "[OF] Petty Cash / PR,MR / Subcontractor / Office Service — เงินสดย่อย / ใบขอซื้อ / ผู้รับเหมา / งานสำนักงาน",
    sections: [
      { title: "Transaction / บันทึกรายการ", items: [
        "Petty Cash Reimbursement / ใบเบิกเงินสดย่อยและใบเบิกจ่ายที่ไม่มี PO/WO",
        "Work Order Payment Submission / บันทึกรับงานผู้รับเหมา / เบิกตามใบสั่งจ้าง",
        "Project Progress / บันทึกความคืบหน้าโครงการ และส่งมอบงาน (Submit/Certificate)",
        "Purchase Requisition (PR/MR) / บันทึกใบขอซื้อ (เปิด, ตรวจสถานะ, อนุมัติ, ลดยอด)",
        "Work Order Creation / บันทึกหนังสือสั่งจ้าง",
      ] },
      { title: "Report / รายงาน", items: [
        "Petty Cash Report & Tracking / รายงานและติดตามใบเบิกเงินสดย่อย",
        "Purchase Requisition Report / รายงานใบขอซื้อ และใบขอซื้อคงค้าง",
        "Work Order Payment Report / รายงานรับวางบิลผู้รับเหมา และเงินเบิกล่วงหน้า",
        "รายงานการส่งผลงานตาม BOQ แสดงยอดสะสม",
      ] },
      { title: "Other / อื่น ๆ", items: [
        "Memorandum / บันทึกภายใน และ Create Billing Note to Owner / ใบส่งงานให้ลูกค้า",
      ] },
    ],
  },
  {
    code: "PM", title: "[PM] Project M. — บริหารโครงการ",
    sections: [
      { title: "Transaction", items: [
        "Project Forecast / ประมาณการรายได้และกำไร (S-Curve Master Plan, Update Actual)",
        "Plan Forecast PO/WO / แผนประมาณการสั่งซื้อสั่งจ้าง",
        "Project Budget / งบประมาณโครงการ (จัดทำ, อนุมัติ, ดู Revision)",
        "Monthly Project Forecast / ประมาณการต้นทุนโครงการรายเดือน",
      ] },
      { title: "Inquiry / ติดตามข้อมูล", items: [
        "Project Control Management / ภาพรวมสถานะโครงการ และ Monitoring รายเดือน",
        "Project Cash Flow & Billing / กระแสเงินสดและการวางบิลโครงการ",
        "Project Material Management / วัสดุคงเหลือหน้างาน และค้นหาราคาวัสดุ",
      ] },
      { title: "Report / รายงาน", items: [
        "Actual Cost & Purchase Cost / รายงานต้นทุนจริงและต้นทุนสั่งซื้อ",
        "Project Budget vs Actual / รายงานเปรียบเทียบงบประมาณกับต้นทุนจริง",
        "Project Cash Flow & Performance / รายงานกระแสเงินสดและผลการดำเนินงานโครงการ",
      ] },
    ],
  },
  {
    code: "PN", title: "[PN] Project Planning Web — วางแผนงานโครงการ (Web)",
    sections: [
      { title: "Project List / แผนงาน", items: [
        "Create / Delete Plan / สร้างและลบแผนงาน, ตั้งค่าแผนงาน",
        "Plan Approval & Task Settings / อนุมัติแผนงาน จัดการทาสก์งาน และผู้รับผิดชอบ",
        "Update Progress / Resource / อัปเดตความคืบหน้างานและทรัพยากร",
      ] },
      { title: "Control Panel / แผงควบคุม", items: [
        "Dashboard / Project / Jobs Control และภาพรวมสถานะโครงการ",
        "Company Summary Report / รายงานภาพรวมบริษัท",
      ] },
      { title: "Report / รายงาน", items: [
        "Daily / Weekly / Monthly Report / รายงานประจำวัน สัปดาห์ เดือน",
        "Summary Material / Worker / รายงานวัสดุ กำลังคน และยอดสะสม-คงเหลือ",
      ] },
      { title: "Project Setting / ตั้งค่า", items: [
        "Setting Project Management & User Management / ตั้งค่าโครงการ ผู้ใช้งาน วันหยุด และเทมเพลต",
      ] },
    ],
  },
  {
    code: "PO", title: "[PO] Purchase Order — ใบสั่งซื้อ / หนังสือสั่งจ้าง",
    sections: [
      { title: "Transaction / บันทึกรายการ", items: [
        "Purchase Order (P/O) / จัดทำใบสั่งซื้อ, รับ/คืนสินค้า, ลดยอด, แผนการจัดส่ง",
        "Work Order (WO/LOI) / จัดทำหนังสือสั่งจ้าง และลดยอดมูลค่าว่าจ้าง",
        "Price Comparison / เปรียบเทียบราคา ขอราคา และสัญญาราคาผู้ขาย (Price Agreement)",
        "PR/MR Status / ตรวจสอบสถานะใบขอซื้อ",
        "Purchase Order Approval / อนุมัติใบสั่งซื้อ และสถานะการอนุมัติ",
        "Billing Note (Subcontractor) / เอกสารส่งมอบงานผู้รับเหมา",
      ] },
      { title: "Report / รายงาน", items: [
        "List of Purchase Order / รายงานใบสั่งซื้อ (ตามโครงการ, ร้านค้า, วัสดุ, เงินมัดจำ)",
        "Goods Receiving Report / รายงานการรับสินค้า และใบสั่งซื้อค้างรับ",
        "WO/LOI Report / รายงานหนังสือสั่งจ้าง สัญญาและการวางบิลผู้รับเหมา",
        "Approval & Tracking / รายงานการอนุมัติ และสถานะใบสั่งซื้อ",
        "Summary Construction Cost / รายงานสรุปต้นทุนก่อสร้าง (งบประมาณ/ต้นทุนจริง)",
      ] },
    ],
  },
  {
    code: "QCC", title: "[QCC] Quality Control Management — ควบคุมคุณภาพ",
    sections: [
      { title: "เมนูหลัก", items: [
        "บันทึกการตรวจสอบ (ผู้รับเหมา / ลูกค้า)",
        "สร้างแบบฟอร์มการตรวจ พื้นที่การตรวจ และกำหนดพื้นที่ตรวจแต่ละโครงการ",
        "รายการ Defect และกำหนดเกรดการให้คะแนน",
        "รายงานผลการตรวจรายโครงการ / ตามแผนงาน / ตามหัวข้อการตรวจ",
      ] },
    ],
  },
  {
    code: "REPM", title: "[REPM] Dashboard Real Estate (For Project Manager) — แดชบอร์ดอสังหาฯ (ผู้จัดการโครงการ)",
    sections: [
      { title: "เมนูหลัก", items: [
        "PM Dashboard / แดชบอร์ดผู้จัดการโครงการ",
        "Customer Contact / การติดต่อลูกค้า (สื่อโฆษณา, คู่แข่ง, แบบสอบถาม, การตัดสินใจ)",
        "Sale Other / งานขายอื่น ๆ (สรุปผลงานขาย, ยอดจอง, ยอดค้างชำระ, ประมาณการรายรับ)",
        "Transfer Operation Dashboard / แดชบอร์ดงานโอนกรรมสิทธิ์",
      ] },
    ],
  },
  {
    code: "REWEB", title: "[REWEB] Real Estate (Web) — อสังหาริมทรัพย์ (Web)",
    sections: [
      { title: "Sale System / ระบบงานขาย", items: [
        "Real Estate Projects / ดูข้อมูลโครงการ ราคาขาย และผู้สนใจจอง (Potential Book)",
        "Quotation – Book – Contract / เสนอราคา จอง ทำสัญญา (รวมการแก้ไขราคา/ส่วนลด/ผู้ขาย)",
        "Down – Transfer / เงินดาวน์ สิทธิหยุดดาวน์ และโอนกรรมสิทธิ์",
        "Cancel / Change Unit / ยกเลิกยูนิต เปลี่ยนยูนิต และโอนสิทธิ์",
        "Receipt & Documents / ใบเสร็จ จดหมาย สำเนาเอกสาร และพิมพ์เอกสารเป็นชุด",
        "Sale Dashboard & Config / แดชบอร์ดฝ่ายขาย และตั้งค่า Config (จอง/สัญญา/โอน)",
      ] },
      { title: "Marketing System / การตลาด", items: [
        "Marketing Dashboard & Unit Price / แดชบอร์ด ราคาต่อหน่วย และการอนุมัติราคา",
        "Promotion & Campaign / โปรโมชั่น แคมเปญ และสิทธิ์การใช้แคมเปญ",
        "Questionnaire & Map Editor / แบบสอบถาม และตัวแก้ไขแผนที่โครงการ",
      ] },
      { title: "Customer Service / บริการลูกค้า", items: [
        "CFR Ticket / งานร้องเรียน, Repair Request / งานแจ้งซ่อม, House Warranty / ประกันยูนิต",
      ] },
      { title: "Master & Finance / ข้อมูลหลักและการเงิน", items: [
        "Project / Sale / Customer Setup / ตั้งค่าโครงการ การขาย ลูกค้า และประกัน",
        "Finance Setup & Bill Payment / ตั้งค่าการเงิน การชำระเงิน และสถานะสินเชื่อลูกค้า",
        "Invoice RE / สร้าง-แก้ไขใบแจ้งหนี้อสังหาฯ และพิมพ์เป็นชุด",
        "Email and Message / ส่งอีเมล-ข้อความ และเทมเพลตข้อความ",
      ] },
      { title: "Report / รายงาน", items: [
        "Manager / Sale & Marketing / Finance Report / รายงานผู้จัดการ การขาย-การตลาด และการเงิน",
        "QC/Defect & Standard (Master) Report / รายงาน QC และรายงานมาตรฐาน",
      ] },
    ],
  },
];

// ---------------------------------------------------------------------------
// Online Marketing — 4 columns, some rows cannot "Create New Account" (–).
// ---------------------------------------------------------------------------
export const MARKETING_COLS = [
  { key: "admin", label: "Admin Permission / ผู้ดูแลระบบ" },
  { key: "editor", label: "Editor Permission / แก้ไขได้" },
  { key: "viewer", label: "Viewer Permission / ดูอย่างเดียว" },
  { key: "createNew", label: "Create New Account / สร้างบัญชีใหม่" },
] as const;
export type MarketingColKey = (typeof MARKETING_COLS)[number]["key"];

export interface MarketingRow { label: string; noCreate?: boolean }
export interface MarketingGroup { title: string; rows: MarketingRow[] }

export const MARKETING_GROUPS: MarketingGroup[] = [
  { title: "Website / เว็บไซต์", rows: [
    { label: "cPanel" }, { label: "FTP" },
    { label: "globaltopgroup.com (wp-admin)", noCreate: true },
    { label: "thepremierresidence.com (wp-admin)", noCreate: true },
    { label: "vanneegoldensands.com (wp-admin)", noCreate: true },
    { label: "foundationthailandisrael.com (wp-admin)", noCreate: true },
    { label: "helitonrealestate.com (wp-admin)", noCreate: true },
  ] },
  { title: "Google", rows: [
    { label: "Google Ads", noCreate: true }, { label: "Google Analytics", noCreate: true },
    { label: "Google Page (Google Business Profile)", noCreate: true },
    { label: "Google Search Console", noCreate: true }, { label: "Google Tag Manager", noCreate: true },
  ] },
  { title: "Google Drive", rows: [
    { label: "City Garden Pattaya", noCreate: true }, { label: "City Garden Pratumnak", noCreate: true },
    { label: "City Garden Tower", noCreate: true }, { label: "City Garden Tropicana", noCreate: true },
    { label: "Marina Golden Bay", noCreate: true }, { label: "Olympus City Garden", noCreate: true },
    { label: "Paradise Ocean View", noCreate: true }, { label: "The Cloud", noCreate: true }, { label: "Graphic", noCreate: true },
  ] },
  { title: "Facebook", rows: [
    { label: "Facebook Page : globaltopgroup", noCreate: true }, { label: "Facebook Page : thepremierresidence", noCreate: true },
    { label: "Facebook Page : vanneegoldensands", noCreate: true }, { label: "Facebook Page : harmonia", noCreate: true },
    { label: "Facebook Page : munhies cafe", noCreate: true }, { label: "Facebook Page : LE Cocktail Kitchen And Bar", noCreate: true },
    { label: "Facebook Ads (Ads Manager)", noCreate: true },
  ] },
  { title: "Twitter (X)", rows: [
    { label: "globaltopgroup", noCreate: true }, { label: "thepremierresidence", noCreate: true }, { label: "vanneegoldensands", noCreate: true },
    { label: "harmonia", noCreate: true }, { label: "munhies cafe", noCreate: true }, { label: "LE Cocktail Kitchen And Bar", noCreate: true },
  ] },
  { title: "Instagram", rows: [
    { label: "globaltopgroup", noCreate: true }, { label: "thepremierresidence", noCreate: true }, { label: "vanneegoldensands", noCreate: true },
    { label: "harmonia", noCreate: true }, { label: "munhies cafe", noCreate: true }, { label: "LE Cocktail Kitchen And Bar", noCreate: true },
  ] },
  { title: "LinkedIn", rows: [
    { label: "globaltopgroup", noCreate: true }, { label: "thepremierresidence", noCreate: true }, { label: "vanneegoldensands", noCreate: true },
    { label: "harmonia", noCreate: true }, { label: "munhies cafe", noCreate: true }, { label: "LE Cocktail Kitchen And Bar", noCreate: true },
  ] },
  { title: "Pinterest", rows: [
    { label: "globaltopgroup", noCreate: true }, { label: "thepremierresidence", noCreate: true }, { label: "vanneegoldensands", noCreate: true },
    { label: "harmonia", noCreate: true }, { label: "munhies cafe", noCreate: true }, { label: "LE Cocktail Kitchen And Bar", noCreate: true },
  ] },
  { title: "TikTok", rows: [{ label: "TikTok Account", noCreate: true }, { label: "TikTok Ads", noCreate: true }] },
  { title: "Line", rows: [{ label: "Line Account", noCreate: true }, { label: "Line Official Account (LINE OA)", noCreate: true }] },
  { title: "Hootsuite", rows: [{ label: "Hootsuite Account" }] },
  { title: "Canva", rows: [{ label: "Canva Admin Account" }] },
  { title: "Zoho CRM", rows: [{ label: "Zoho CRM Account (Administrator = Admin, Standard = Editor)", noCreate: true }] },
];

// ---------------------------------------------------------------------------
// Role-based systems — 3 columns (Admin / Editor / Viewer)
// ---------------------------------------------------------------------------
export const ROLE_COLS = [
  { key: "admin", label: "Admin Permission / ผู้ดูแลระบบ" },
  { key: "editor", label: "Editor Permission / แก้ไขได้" },
  { key: "viewer", label: "Viewer Permission / ดูอย่างเดียว" },
] as const;
export type RoleColKey = (typeof ROLE_COLS)[number]["key"];

export const SALES_ROLES = [
  "Admin", "Management", "Agency Support", "Agency Support Team A", "Agency Support Team B",
  "Closer", "Sales Coordinator", "Sales Representative", "Sales Representative A", "Sales Representative B", "Trainer",
];

export const RENTAL_ROLES = [
  "Rental Staff / เจ้าหน้าที่งานเช่า", "Inspector / ผู้ตรวจสอบ", "Technical / ช่างเทคนิค", "House Keeping / แม่บ้าน",
];
