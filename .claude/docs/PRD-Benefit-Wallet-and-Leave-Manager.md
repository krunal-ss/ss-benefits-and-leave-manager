# Product Requirements Document (PRD)
## Employee Benefit Wallet + Leave & WFH Manager

**Document status:** Consolidated (merges all prior standalone PRDs — see §14)
**Owner:** (you)
**Last updated:** 2026-07-17

---

## 1. Summary

An internal employee portal with two product areas sharing one login, one role model, and one notification engine:

1. **Benefit Wallet (Expense Management)** — Each employee gets an annual, category-capped benefit allowance (Sports ₹15,000, Learning ₹45,000 per financial year). Employees submit expenses with a supporting document. The system attempts automated document verification; if it passes the rule checks, the claim is auto-approved, otherwise it routes to the HR Head for manual approval. Approved amounts are reimbursed to the employee at financial year-end.
2. **Leave & WFH Manager** — A KEKA-style module for applying for leave and work-from-home, with hierarchy-based multi-level approvals (Team Lead → Project Manager) and email notifications to the relevant approvers and stakeholders.

This is also a **learning vehicle**: the build is structured so that planning, design, coding, and QA are driven through Claude (CLAUDE.md project memory, custom Skills, MCP connectors including JIRA, and subagent/parallel workflows).

Beyond the v1 core (§2–§13), this document also folds in every follow-on epic that was previously tracked as its own PRD — AI Expense Verification & Receipt Intelligence, Smart Team Availability & Capacity Planner, Productivity & Usability Enhancements, Employee Experience Enhancements, Employee Self-Service Enhancements, and Employee Administration Enhancements (§14). Most of those are already shipped; see CLAUDE.md's "Architecture (big picture)" section for the current implementation state of each.

---

## 2. Goals & non-goals

### Goals
- Single portal for benefit reimbursement claims and leave/WFH requests.
- Reduce manual HR effort by auto-approving compliant expense claims.
- Clear, hierarchy-aware approval flows with email notifications.
- Accurate per-employee, per-category, per-FY balance tracking.
- A clean, auditable trail of every request and decision.

### Non-goals (v1)
- Payroll integration / actual money disbursement (we record approved amounts and export them; the finance system pays out).
- Full HRMS (attendance/biometric, performance, recruitment).
- Mobile native apps (responsive web only).
- Multi-currency / multi-country (single currency: INR; single FY definition).

---

## 3. Personas & roles

| Role | Description | Key actions |
|---|---|---|
| **Employee** | Any staff member | Register, log in, view wallet balances, submit expenses + documents, apply for leave/WFH, view request status |
| **Team Lead (TL)** | First-level approver for their team | Approve/reject leave & WFH for direct reports; view team calendar |
| **Project Manager (PM)** | Second-level / project approver | Approve/reject leave & WFH (after TL or in parallel per policy); view project staffing |
| **HR Head** | Owns benefit policy + manual expense approvals | Approve/reject expense claims that fail auto-verification; configure fund limits & policies; view org-wide reports; run FY-end reimbursement export |
| **(Optional) Admin** | System config | Manage users, roles, reporting lines, holidays, email templates |

> Reporting lines (Employee → TL → PM) must be modelled as data so approval routing is configurable, not hard-coded.

---

## 4. Module A — Benefit Wallet (Expense Management)

### 4.1 Allowances
- Two categories, each with an annual cap per FY:
  - **Sports:** ₹15,000
  - **Learning:** ₹45,000
- Caps and category list must be configurable by HR Head (no code change to adjust amounts).
- FY boundary configurable (default: 1 Apr – 31 Mar). Unused balance does **not** carry over (configurable flag, default: no carryover).

### 4.2 Claim lifecycle
1. Employee selects category, enters amount, date, vendor/description, uploads document (receipt/invoice; PDF/JPG/PNG).
2. System runs **automated verification** (see 4.3).
3. **If auto-verification passes** → status `Auto-Approved`. Amount reserved against the category balance.
4. **If it fails or is inconclusive** → status `Pending HR Approval`; routed to HR Head queue.
5. HR Head approves → `Approved`, or rejects with reason → `Rejected` (balance released).
6. At FY-end, all `Approved`/`Auto-Approved` claims are aggregated per employee and exported for reimbursement; on payout confirmation status → `Reimbursed`.

States: `Draft → Submitted → (Auto-Approved | Pending HR Approval) → Approved | Rejected → Reimbursed`.

### 4.3 Automated document verification (v1 rule-based, AI-assisted optional)
The "verify the uploaded document" step. v1 should be **rule-based and explainable**, with an optional AI/OCR pass:
- File is a readable PDF/image, under size limit, not a duplicate (hash check against prior uploads).
- OCR/extraction pulls: amount, date, vendor. (Tesseract OCR, or an LLM/vision call via the Claude API for parsing — see tech notes.)
- Checks: extracted amount == claimed amount (within tolerance); date within current FY; remaining category balance ≥ claimed amount; vendor/category sanity (e.g., learning = course/book/training; sports = gym/equipment/events).
- **Pass** → auto-approve. **Any check fails or low OCR confidence** → route to HR Head with the extracted fields + flags shown, so the human decision is fast.
- Every auto-decision stores the rule outcomes for audit (never a black box).

See §14.1 for the expanded AI-scoring/fraud-detection scope layered onto this in a later epic.

### 4.4 Balances & reporting
- Employee dashboard: per-category Allocated / Used (approved + pending) / Available.
- Pending claims hold (reserve) balance so an employee can't over-commit.
- HR reports: spend by category, by department, pending queue, FY-end reimbursement sheet (CSV/XLSX export).

### 4.5 Expense — acceptance criteria (samples)
- AC1: An employee cannot submit a claim whose amount exceeds remaining category balance.
- AC2: A duplicate document (same hash) is blocked with a clear message.
- AC3: A passing claim shows `Auto-Approved` instantly and updates Available balance.
- AC4: A failing claim appears in the HR Head queue with extracted fields and the specific failed rule(s).
- AC5: Rejecting a claim releases the reserved balance and notifies the employee with the reason.

---

## 5. Module B — Leave & WFH Manager (KEKA-style)

### 5.1 Concepts (modelled on common KEKA-like flows)
- **Leave types** with their own rules: Casual Leave (CL), Sick Leave (SL), Earned/Privileged Leave (EL/PL), Loss of Pay (LOP), plus **Work From Home (WFH)** as a request type.
- **Balances & accrual:** opening balance + periodic accrual (e.g., monthly), with max-balance caps and optional carry-forward per type. Configurable by Admin/HR.
- **Holiday calendar** (org + optional location-specific) so leave-day counting skips holidays/weekends.
- **Half-day / hourly** leave support (v1: half-day at minimum).

### 5.2 Apply & approval flow
1. Employee opens a request: type, from/to dates (or WFH dates), reason, optional attachment, half-day flag.
2. System computes working days requested (excludes weekends/holidays) and validates against balance.
3. **Multi-level approval** routed by reporting lines:
   - Level 1: **Team Lead** approves/rejects.
   - Level 2: **Project Manager** approves/rejects.
   - Policy switch: sequential (TL then PM) or parallel; auto-approve threshold for short WFH if desired.
4. On each transition, **email notifications** go to the applicant and the relevant hierarchy (TL, PM, and CC to HR as configured).
5. Final state updates the calendar and deducts balance (for leave; WFH does not deduct leave balance).

States: `Applied → Pending L1 → Pending L2 → Approved | Rejected | Cancelled`.
Cancellation/withdrawal allowed before start date (restores balance). See §14.3 for the post-approval cancellation-request flow.

### 5.3 Views
- Personal: balances per type, request history, upcoming approved leave/WFH.
- Manager (TL/PM): pending approvals queue, team calendar, who's on leave/WFH today.
- HR: org-wide calendar, leave reports, policy configuration.

See §14.2 for the manager/HR capacity-planning views layered onto this.

### 5.4 Email notifications
- Triggered on: submit, each approval level decision, final decision, cancellation.
- Recipients derived from reporting lines (TL, PM) + configurable CC (HR, project team).
- Templated, with request details and a deep link to the portal.

### 5.5 Leave/WFH — acceptance criteria (samples)
- AC1: Requested working days correctly exclude weekends and configured holidays.
- AC2: A leave request exceeding available balance is blocked (or flagged as LOP per policy).
- AC3: Approval at L1 moves it to Pending L2 and emails the PM.
- AC4: Final approval emails the applicant + updates the team calendar.
- AC5: Withdrawing an approved future leave restores the balance and notifies approvers.

---

## 6. Cross-cutting requirements

- **Auth:** email/password signup + login, email verification, password reset, session management, RBAC by role. (See stack notes for library choice.)
- **RBAC:** every API enforces role + ownership (an employee sees only their data; a TL sees only their reports).
- **Audit log:** immutable record of who did what when (submissions, approvals, config changes).
- **Notifications:** email (v1); in-app notification center (v1.1).
- **File storage:** uploaded documents in object storage with access control (signed URLs).
- **Document validation/OCR service** for Module A (can run server-side).

---

## 7. Roles × permissions matrix (high level)

| Capability | Employee | TL | PM | HR Head |
|---|:--:|:--:|:--:|:--:|
| Submit own expense | ✔ | ✔ | ✔ | ✔ |
| Approve expense (manual) | – | – | – | ✔ |
| Configure fund limits/policy | – | – | – | ✔ |
| Apply leave/WFH | ✔ | ✔ | ✔ | ✔ |
| Approve leave/WFH L1 | – | ✔ | – | – |
| Approve leave/WFH L2 | – | – | ✔ | – |
| View team calendar | own | team | project | org |
| FY-end reimbursement export | – | – | – | ✔ |

---

## 8. Non-functional requirements
- **Security:** hashed passwords, RBAC on every endpoint, signed URLs for documents, input validation, rate limiting on auth.
- **Auditability:** all approvals + auto-decisions logged with rationale.
- **Performance:** dashboards load < 2s on typical org size (≤ ~1,000 employees for v1).
- **Reliability:** email delivery retried; failed verification never silently auto-approves.
- **Privacy:** documents and salary-adjacent data access-controlled and logged.

---

## 9. Recommended tech stack (see chat for rationale)
- **Frontend:** Next.js (App Router) + TypeScript + Tailwind + shadcn/ui.
- **Backend/DB:** Postgres via **Supabase** (DB + Auth + object storage + row-level security) — fastest cohesive option for a learning build. Alternative: **Neon** (serverless Postgres) + **Better Auth**.
- **ORM:** Prisma or Drizzle.
- **Auth:** Supabase Auth, or Auth.js (NextAuth) / Better Auth if using a standalone DB.
- **Email:** Resend (or SMTP).
- **OCR/parsing (Module A):** Tesseract server-side, or a vision/LLM parse via Claude API for receipt field extraction.
- **Testing:** Playwright (E2E), Vitest (unit), Testing Library (component).

---

## 10. High-level data model (entities)
- `User` (id, name, email, role, teamLeadId, projectManagerId, department, joinDate)
- `BenefitCategory` (id, name, annualCap, fyStart, carryover)
- `BenefitClaim` (id, userId, categoryId, amount, date, vendor, documentUrl, documentHash, status, verificationResult(json), approverId, decisionReason, fy)
- `LeaveType` (id, name, accrualRule, maxBalance, carryForward, deductsBalance)
- `LeaveBalance` (id, userId, leaveTypeId, balance, fy)
- `LeaveRequest` (id, userId, leaveTypeId|WFH, fromDate, toDate, halfDay, workingDays, reason, status, currentLevel)
- `Approval` (id, requestId, level, approverId, decision, reason, timestamp)
- `Holiday` (id, date, name, location)
- `Notification` / `EmailLog`
- `AuditLog` (id, actorId, action, entity, entityId, payload, timestamp)

---

## 11. Delivery plan → epics (map these to JIRA)

| Epic | Description | Suggested sprint |
|---|---|---|
| E0 Foundation | Repo, CI, CLAUDE.md, design system, auth, DB schema, RBAC scaffolding | Sprint 1 |
| E1 Benefit Wallet core | Categories, balances, claim submit + document upload, dashboards | Sprint 2 |
| E2 Expense verification & approval | Rule engine, OCR/parse, HR queue, approve/reject, audit | Sprint 3 |
| E3 Leave/WFH core | Leave types, balances, apply, working-day calc, calendar | Sprint 4 |
| E4 Approvals & notifications | Multi-level routing, email engine, manager queues | Sprint 5 |
| E5 Reporting & FY-end | HR reports, reimbursement export, polish | Sprint 6 |
| E6 Hardening | E2E tests, security pass, performance, docs | Sprint 7 |

Each epic → stories (user-facing increments) → sub-tasks (FE, BE, schema, tests). Example below.

### Example story breakdown (E1)
- **Story:** *As an employee, I can submit a Sports expense with a receipt so it counts against my ₹15,000 allowance.*
  - Sub-task: DB — `BenefitClaim` schema + migration
  - Sub-task: BE — POST /claims endpoint with balance + duplicate checks
  - Sub-task: BE — document upload to storage + signed URL
  - Sub-task: FE — claim form (category, amount, date, vendor, upload)
  - Sub-task: FE — balance widget reflecting reserved amount
  - Sub-task: QA — Playwright E2E for submit + balance update
  - Acceptance: AC1–AC3 from §4.5

---

## 12. Success metrics
- % expense claims auto-approved (target: rising over time).
- Median time from submit → decision (expense & leave).
- HR manual-review volume (should fall as rules improve).
- Notification delivery success rate.

---

## 13. Open questions / decisions needed
1. Currency & exact FY boundary confirmed? (Assumed INR, 1 Apr–31 Mar.)
2. Expense approval — only HR Head, or also a finance role for payout?
3. Leave approval order — TL then PM (sequential) or either? Auto-approve short WFH?
4. Carry-forward rules per leave type and for unused benefit balance?
5. Org size & whether SSO is needed later.
6. Does "credited at FY-end" mean via payroll (we only export) — confirmed as out-of-scope payout?

---

## 14. Follow-on epics (merged from standalone PRDs)

These were originally tracked as separate PRD files; they're folded in here as appendices to keep a single source of truth. Each notes its shipped/unshipped state — cross-check CLAUDE.md's "Architecture (big picture)" section for the authoritative, up-to-date implementation status and file pointers, since that's updated on every ship.

### 14.1 AI Expense Verification & Receipt Intelligence

**Status:** Shipped (KAN-113 and related; see `receiptVerifications`, `src/lib/verdict-style.ts`, `/expenses/[claimId]/intelligence`).

Extends §4.3's rule engine with an AI/OCR layer.

- **Goals:** OCR extraction, duplicate detection, fraud detection, AI confidence scoring, manual HR review.
- **Functional requirements:** receipt upload; OCR extraction; AI validation; fraud detection; confidence score; HR override; audit log.
- **Business rules:** duplicate receipts blocked; low confidence → HR review; claims outside FY reviewed.
- **Database:** `ReceiptVerification` table with OCR data, AI score, and status.
- **APIs:** `POST /api/receipt/upload`, `POST /api/receipt/verify`, `GET /api/receipt/{id}`, `POST /api/receipt/approve`, `POST /api/receipt/reject`.
- **UI:** upload screen, verification panel, HR queue.
- **Acceptance:** OCR extracts data, AI validates, HR override logged.
- **Future enhancements:** GST API, LLM parsing, mobile scanning.

### 14.2 Smart Team Availability & Capacity Planner

**Status:** Partially shipped — `teamCapacitySnapshot` (KAN-79) and low-staffing alerts (KAN-81) ship via the daily cron job; the historical-trend UI reading that snapshot table is still a follow-up (the live forecast on `/availability` computes on the fly from `leaveRequests` instead).

Extends §5.3's manager/HR calendar views with real-time staffing visibility.

- **Executive summary:** real-time team availability and capacity planning for Leave & WFH approvals.
- **Business problem:** managers need staffing visibility before approvals.
- **Goals:** real-time heatmap, capacity planning, conflict detection, workforce insights.
- **Functional requirements:** team calendar; heatmap; capacity summary; leave conflict detection; critical-role protection; department overview; forecasting; filters.
- **Business rules:** exclude weekends/holidays; half-day = 50%; WFH counts as available.
- **Database:** `TeamCapacity` and `StaffingThreshold` tables.
- **APIs:** `GET /availability/team/{teamId}`, `GET /availability/calendar`, `GET /availability/forecast`, `POST /availability/export`.
- **UI:** manager dashboard, HR dashboard, team heatmap.
- **Notifications:** manager, employee, and HR alerts.
- **Acceptance:** heatmap updates instantly, configurable thresholds, export support.
- **Future enhancements:** AI staffing, Jira integration, predictive planning.

### 14.3 Productivity & Usability Enhancements

**Status:** Shipped (Expense Draft Save — KAN-125 draft claims; Claim Resubmission — KAN-126; Leave Cancellation Request — KAN-127).

- **Expense Draft Save**
  - Objective: save incomplete claims.
  - Requirements: save, autosave, edit, delete, submit drafts.
  - Business rules: drafts don't reserve balance.
  - Acceptance: resume later and submit.
- **Claim Resubmission**
  - Objective: resubmit rejected claims.
  - Requirements: edit rejected claims, replace receipt, version history.
  - Business rules: same claim ID, versioned history.
  - Acceptance: HR can compare versions.
- **Leave Cancellation Request**
  - Objective: cancel approved leave before start date.
  - Requirements: cancellation request, optional approval, balance restore, notifications.
  - Business rules: only before leave starts.
  - Acceptance: calendar and balances update.

### 14.4 Employee Experience Enhancements (v1.2)

**Status:** Shipped (KAN-145/146/147/148) — UI/config only; no automated cron/email fan-out yet for SLA escalation or per-employee reminders (both noted as follow-ups).

- **Wallet Transaction History** — Objective: complete ledger of benefit wallet transactions. Requirements: history, filters, export, details.
- **Approval SLA Timer** — Objective: show countdown for approvals. Requirements: SLA timer, overdue alerts, escalation.
- **Remaining Benefit Reminder** — Objective: notify employees before FY-end about unused balances. Requirements: dashboard reminders, email reminders, configurable schedule.
- **Benefits:** transparency, faster approvals, higher benefit utilization.

### 14.5 Employee Self-Service Enhancements (v1.4)

**Status:** Shipped (KAN-184/185/186/187).

- **Quick Search** — search leave requests, expense claims, employees, and policies.
- **Recent Activities Widget** — display latest employee activities with filters.
- **Leave Policy Viewer** — view leave policies, eligibility, carry-forward rules, FAQs, and download policy PDF.
- **Benefits:** faster navigation, reduced HR queries, improved self-service.

### 14.6 Employee Administration Enhancements (v1.6)

**Status:** In progress — Profile Completion Tracker (KAN-223) is the first story under this epic (KAN-222). Employee Document Vault (KAN-224) and Manager Delegation (KAN-225) are planned. Source: `PRD-Employee-Administration-Enhancements-v1.6.md`.

Gives employees more control over their own records and gives managers approval continuity while away, without changing any existing verification, leave-balance, or approval-decision core logic.

- **Profile Completion Tracker**
  - Objective: help employees complete mandatory profile information.
  - Requirements: completion percentage, missing-field highlights, progress bar, edit shortcuts, reminder notifications.
  - Business rules: completion % is derived (not stored); the self-service edit may update only the employee's own editable fields — role and reporting lines stay admin-managed.
  - Acceptance: percentage updates automatically; missing fields are clearly displayed.
- **Employee Document Vault**
  - Objective: securely manage employee documents.
  - Requirements: upload (PDF/JPG/PNG), download, replace, expiry reminders, categorize.
  - Database: `EmployeeDocument` (id, userId, documentType, fileName, expiryDate).
  - Business rules: private bucket + ownership-scoped, audited, short-TTL signed URLs only — never public.
  - Acceptance: documents upload/download successfully; expiry reminders work.
- **Manager Delegation**
  - Objective: temporarily assign approval responsibilities.
  - Requirements: select delegate, date range, leave approvals, expense approvals, cancel delegation.
  - Database: `ApprovalDelegation` (managerId, delegateId, startDate, endDate, status).
  - Business rules: delegation is enforced at the authorization gates only, never by changing the decision logic; delegated decisions are audited as acting-on-behalf-of.
  - Acceptance: requests route to the delegate; delegation expires automatically.
- **Benefits:** better employee records, secure document storage, continuous approval workflow.
