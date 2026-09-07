/**
 * Standard Default Access Profiles by Department + Position (least privilege).
 * Transcribed from the RBAC spec. `roleKey` is the in-app ITBox Role assigned
 * (additively) — NEVER ADMIN for a business manager (IT Admin maps to
 * IT_MANAGER, which is technical, not business-data, access). External-system
 * grants are captured as profile items (level + status), for the access request
 * / provisioning workflow.
 */
export type Scope = "OWN_DATA" | "OWN_TEAM" | "ASSIGNED_PROJECTS" | "SELECTED_PROJECTS" | "DEPARTMENT" | "ALL_PROJECTS" | "COMPANY_WIDE";

export interface DefaultProfileItem { system: string; level: string; status: "REQUIRED" | "OPTIONAL" | "RESTRICTED" | "NOT_ALLOWED" }
export interface DefaultProfileDef {
  code: string; name: string; department: string; position?: string;
  roleKey: string; scope: Scope; items: DefaultProfileItem[];
}

const G = (system: string, level: string): DefaultProfileItem => ({ system, level, status: "REQUIRED" });
const NO = (system: string): DefaultProfileItem => ({ system, level: "No Access", status: "NOT_ALLOWED" });

export const DEFAULT_PROFILES: DefaultProfileDef[] = [
  // ---- Marketing ----
  { code: "MKT-CONTENT-STAFF", name: "Content Creator", department: "Marketing", position: "Content Creator", roleKey: "EMPLOYEE", scope: "ASSIGNED_PROJECTS", items: [
    G("Real Estate Project Information", "Viewer"), G("Marketing Project Information", "Viewer"),
    G("Facebook", "Editor"), G("Instagram", "Editor"), G("TikTok", "Editor"), G("LINE OA", "Editor"),
    G("Canva", "Editor"), G("Google Drive Marketing", "Editor"), G("CRM", "Viewer"),
    NO("Google Ads"), NO("Google Tag Manager"), NO("cPanel"), NO("FTP") ] },
  { code: "MKT-GRAPHIC-STAFF", name: "Graphic Designer", department: "Marketing", position: "Graphic Designer", roleKey: "EMPLOYEE", scope: "ASSIGNED_PROJECTS", items: [
    G("Real Estate Project Information", "Viewer"), G("Canva", "Editor"), G("Google Drive Graphic", "Editor"),
    G("Google Drive Marketing", "Editor"), G("Facebook", "Viewer"), G("Instagram", "Viewer"), G("TikTok", "Viewer"),
    NO("CRM"), NO("Google Ads"), NO("Website Admin"), NO("cPanel"), NO("FTP") ] },
  { code: "MKT-SOCIAL-STAFF", name: "Social Media Specialist", department: "Marketing", position: "Social Media Specialist", roleKey: "EMPLOYEE", scope: "ALL_PROJECTS", items: [
    G("Real Estate Project Information", "Viewer"), G("REWEB Marketing", "Viewer"), G("Facebook", "Editor"),
    G("Instagram", "Editor"), G("TikTok", "Editor"), G("LINE OA", "Editor"), G("Canva", "Editor"),
    G("Google Analytics", "Viewer"), G("Google Ads", "Viewer"), G("Meta/Facebook Ads", "Editor"),
    G("Zoho CRM", "Editor / Standard"), G("Marketing Drive", "Editor"), NO("cPanel"), NO("FTP") ] },
  { code: "MKT-DIGITAL-STAFF", name: "Digital / Performance Marketing", department: "Marketing", position: "Digital Marketing", roleKey: "EMPLOYEE", scope: "ALL_PROJECTS", items: [
    G("REWEB Marketing", "Editor"), G("Google Ads", "Editor"), G("Google Analytics", "Editor"),
    G("Google Search Console", "Editor"), G("Google Tag Manager", "Editor"), G("Meta/Facebook Ads", "Editor"),
    G("Social Media", "Editor"), G("Zoho CRM", "Editor"), G("Marketing Drive", "Editor"), G("Website", "Viewer"),
    NO("cPanel"), NO("FTP") ] },
  { code: "MKT-WEB-STAFF", name: "UX/UI Website", department: "Marketing", position: "UX/UI Website", roleKey: "EMPLOYEE", scope: "SELECTED_PROJECTS", items: [
    G("WordPress", "Editor"), G("Google Analytics", "Viewer"), G("Google Search Console", "Viewer"),
    G("Google Tag Manager", "Viewer"), G("Marketing Drive", "Editor"), G("Canva", "Editor"),
    NO("cPanel"), NO("FTP"), NO("CRM") ] },
  { code: "WEB-DEVELOPER", name: "Web Developer", department: "IT", position: "Web Developer", roleKey: "IT_STAFF", scope: "SELECTED_PROJECTS", items: [
    G("WordPress", "Admin"), G("cPanel", "Editor"), G("FTP", "Editor"), G("Google Tag Manager", "Editor"),
    G("Google Search Console", "Editor"), G("Google Analytics", "Viewer"), G("Deployment Systems", "Editor"),
    NO("Social Media"), NO("Sales CRM") ] },
  { code: "MKT-MANAGER", name: "Marketing Manager", department: "Marketing", position: "Marketing Manager", roleKey: "MANAGER", scope: "DEPARTMENT", items: [
    G("REWEB Project Information", "Viewer"), G("REWEB Marketing System", "Editor"), G("Marketing Dashboard", "Viewer"),
    G("Marketing Reports", "Viewer"), G("Promotion & Campaign", "Editor"), G("Zoho CRM", "Editor / Manager"),
    G("Google Ads", "Editor"), G("Google Analytics", "Editor"), G("Google Search Console", "Editor"),
    G("Google Tag Manager", "Editor"), G("Meta/Facebook Ads", "Editor"), G("Social Media (FB/IG/TikTok/LINE OA)", "Editor"),
    G("Canva", "Editor"), G("Marketing Drive", "Editor"), G("Approval", "Approver"),
    NO("cPanel"), NO("FTP"), NO("User Permission Administration") ] },
  // ---- Sales ----
  { code: "SALE-REP", name: "Sales Representative", department: "Sales", position: "Sales Representative", roleKey: "EMPLOYEE", scope: "OWN_DATA", items: [
    G("REWEB Real Estate Projects", "Viewer"), G("Quotation / Book / Contract", "Editor"), G("Own Customer / Lead", "Editor"),
    G("Own Booking", "Editor"), G("Sale Dashboard", "Viewer"), G("Venio CRM", "Sales Representative"),
    G("Project Documents", "Viewer"), G("Price List / Availability", "Viewer"),
    NO("Other salesperson customer data"), NO("System Config") ] },
  { code: "SALE-COORDINATOR", name: "Sales Coordinator", department: "Sales", position: "Sales Coordinator", roleKey: "EMPLOYEE", scope: "OWN_TEAM", items: [
    G("REWEB Project", "Viewer"), G("Quotation / Booking / Contract", "Editor"), G("Sales Documents", "Editor"),
    G("Receipt & Documents", "Editor"), G("Venio CRM", "Sales Coordinator"), G("Sales Reports", "Viewer"),
    G("Team Customer Data", "Editor"), NO("System Config") ] },
  { code: "SALE-CLOSER", name: "Closer / Senior Sales", department: "Sales", position: "Closer", roleKey: "EMPLOYEE", scope: "OWN_TEAM", items: [
    G("REWEB Sale System", "Editor"), G("Customer Information", "Editor"), G("Quotation / Book / Contract", "Editor"),
    G("Sale Dashboard", "Viewer"), G("Venio CRM", "Closer"), G("Team Sales Data", "Viewer") ] },
  { code: "SALE-MANAGER", name: "Sales Manager", department: "Sales", position: "Sales Manager", roleKey: "MANAGER", scope: "OWN_TEAM", items: [
    G("REWEB Sales System", "Editor"), G("Sales Dashboard", "Viewer"), G("Sales Reports", "Viewer"),
    G("Team Customer Data", "Editor"), G("Venio CRM", "Management"), G("Team Approval", "Approver"),
    NO("System Admin"), NO("CRM Admin") ] },
  { code: "AGENCY-SUPPORT", name: "Agency Support", department: "Agency Support", roleKey: "EMPLOYEE", scope: "ASSIGNED_PROJECTS", items: [
    G("REWEB Project Information", "Viewer"), G("Unit / Price / Availability", "Viewer"), G("Venio CRM", "Agency Support"),
    G("Agency Lead", "Editor"), G("Agency Contact", "Editor"), G("Marketing Material", "Viewer"), G("Project Drive", "Viewer"),
    NO("Contract/Finance Sensitive Data") ] },
  // ---- Accounting / Finance ----
  { code: "ACC-STAFF", name: "Accounting Staff", department: "Accounting", position: "Accounting Staff", roleKey: "FINANCE", scope: "DEPARTMENT", items: [
    G("AP", "Editor"), G("AR", "Editor"), G("GL", "Editor"), G("Financial Report", "Viewer"), G("Accounting Drive", "Editor"),
    NO("Sales CRM"), NO("Marketing") ] },
  { code: "FIN-STAFF", name: "Finance Staff", department: "Finance", roleKey: "FINANCE", scope: "DEPARTMENT", items: [
    G("FIN Module", "Editor"), G("AP/AR", "Editor"), G("Cash Flow", "Editor"), G("Financial Report", "Viewer"),
    G("Finance Drive", "Editor"), NO("CRM") ] },
  { code: "ACC-MANAGER", name: "Accounting / Finance Manager", department: "Accounting & Financial", position: "Accounting Manager", roleKey: "MANAGER", scope: "DEPARTMENT", items: [
    G("AP", "Editor"), G("AR", "Editor"), G("GL", "Editor"), G("FIN", "Editor"), G("Reports", "Viewer"),
    G("Approval", "Approver"), G("Department Drive", "Editor"), NO("ERP System Configuration") ] },
  // ---- Procurement ----
  { code: "PROCUREMENT-STAFF", name: "Procurement Staff", department: "Procurement", roleKey: "EMPLOYEE", scope: "DEPARTMENT", items: [
    G("PR/MR", "Editor"), G("PO", "Editor"), G("Vendor Information", "Editor"), G("Price Comparison", "Editor"),
    G("PO Reports", "Viewer"), NO("Finance"), NO("GL") ] },
  { code: "PROCUREMENT-MANAGER", name: "Procurement Manager", department: "Procurement", position: "Procurement Manager", roleKey: "MANAGER", scope: "DEPARTMENT", items: [
    G("PR/MR", "Editor"), G("PO", "Editor"), G("Purchase Approval", "Approver"), G("PO Reports", "Viewer"),
    G("Procurement Dashboard", "Viewer") ] },
  // ---- Construction / Project ----
  { code: "PROJECT-STAFF", name: "Project Staff", department: "Construction", roleKey: "EMPLOYEE", scope: "ASSIGNED_PROJECTS", items: [
    G("PM Project Management", "Editor"), G("PN Project Planning", "Editor"), G("Project Progress", "Editor"),
    G("QCC", "Editor"), G("IC", "Editor"), G("Project Reports", "Viewer"), NO("Financial Report") ] },
  { code: "PROJECT-MANAGER", name: "Project Manager", department: "Construction", position: "Project Manager", roleKey: "MANAGER", scope: "ASSIGNED_PROJECTS", items: [
    G("PM", "Editor"), G("PN", "Editor"), G("QCC", "Editor"), G("REPM Dashboard", "Viewer"), G("Project Budget", "Viewer"),
    G("Project Reports", "Viewer"), G("Project Approval", "Approver"), NO("Project Setting / User Management") ] },
  // ---- Rental ----
  { code: "RENTAL-STAFF", name: "Rental Staff", department: "Rental", roleKey: "EMPLOYEE", scope: "ASSIGNED_PROJECTS", items: [
    G("Horganice", "Rental Staff"), G("Assigned Rental Units", "Editor"), G("Customer Rental Data", "Editor"),
    G("Rental Reports", "Viewer"), NO("Sales CRM") ] },
  // ---- HR ----
  { code: "HR-STAFF", name: "HR Staff", department: "HR", roleKey: "HR", scope: "DEPARTMENT", items: [
    G("Personnel System", "Editor"), G("Employee Data (HR scope)", "Editor"), G("HR Drive", "Editor"),
    NO("ERP Accounting"), NO("Sales CRM"), NO("Marketing System") ] },
  { code: "HR-MANAGER", name: "HR Manager", department: "HR", position: "HR Manager", roleKey: "MANAGER", scope: "DEPARTMENT", items: [
    G("Personnel System", "Editor"), G("HR Reports", "Viewer"), G("HR Approval", "Approver") ] },
  // ---- IT ----
  { code: "IT-SUPPORT", name: "IT Support", department: "IT", position: "IT Support", roleKey: "IT_STAFF", scope: "COMPANY_WIDE", items: [
    G("User Account Management", "Editor"), G("Reset Password", "Allowed"), G("Device / Asset Management", "Editor"),
    G("Permission Assignment (from approved requests)", "Editor"),
    NO("Business Transactions"), NO("ERP Financial Data"), NO("CRM Customer Data") ] },
  { code: "IT-ADMIN", name: "IT Admin (Technical)", department: "IT", position: "IT Admin", roleKey: "IT_MANAGER", scope: "COMPANY_WIDE", items: [
    G("User Management", "Admin"), G("Permission Management", "Admin"), G("System Configuration", "Admin"),
    G("Audit Log", "Viewer"), G("Website Infrastructure", "Admin"), G("Technical Integration", "Admin"),
    { system: "Financial / HR / Sales / Customer Data", level: "No automatic access", status: "RESTRICTED" } ] },
  // ---- Management ----
  { code: "MANAGEMENT-VIEWER", name: "Management Viewer", department: "Management", roleKey: "VIEWER", scope: "COMPANY_WIDE", items: [
    G("Management Dashboard", "Viewer"), G("Sales Dashboard", "Viewer"), G("Marketing Dashboard", "Viewer"),
    G("Project Dashboard", "Viewer"), G("Financial Summary (where authorized)", "Viewer"), G("Reports", "Viewer"),
    NO("Transaction Edit"), NO("System Configuration"), NO("User Administration") ] },
];
