# PDPA (Personal Data Protection)

## Personal data held
Employees: name, email, phone, employee code, position, employment dates.
Users: name, email, login timestamps, IP addresses (security logs).

## Lawful basis & minimization
Data is limited to what IT asset/access management requires (legitimate
interest / contract performance). No sensitive-category personal data is
collected. Free-text fields should not be used for personal data beyond
operational need (staff guideline).

## Access control & audit
- Employee records require `employee:read` (HR, IT, admin roles by default);
  every profile view writes an audit entry (`VIEW EMPLOYEE`).
- Exports require `report:export` and are audited (`EXPORT`).
- Multi-tenant isolation prevents cross-organization access.

## Data subject rights support
- Rectification: HR edits employee records (audited).
- Erasure/retention: soft delete removes records from all UI/API surfaces;
  permanent purge policy is an operational DBA task (document retention
  schedule per organization; audit/IP logs retained per security policy,
  recommended 1 year).
- Access requests: admin can produce the employee's data from the employee
  page + audit report.

## Security measures
TLS in transit, encryption at rest (Cloud SQL + envelope-encrypted secrets),
RBAC, MFA, audit logging, breach-visibility via Security Center (failed
logins, unusual access).
