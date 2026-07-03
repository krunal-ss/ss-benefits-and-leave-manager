// KAN-119 (KAN-112, epic KAN-110) — the "Receipt Intelligence" screen: the AI
// confidence gauge + factor breakdown, extracted OCR fields, fraud/anomaly
// signals, duplicate detection, and the audit trail, plus the HR decision
// panel that must behave exactly like the existing review drawer (same
// decideExpenseAction — reason required to reject, balance released on reject).
//
// Every claim here uploads a real receipt file (a supporting document is
// mandatory — see `feat(validation): require description/receipt...`), same
// pattern as expense-upload.spec.ts. No ANTHROPIC_API_KEY in this environment,
// so OCR degrades to zero confidence and the claim deterministically routes to
// HR — a good fixture for this screen: it guarantees real, non-empty fraud
// signals ("Amount mismatch", "Low OCR confidence") and an AI score < 95
// (never a false "approve") to assert against.
import { test, expect, type Page } from "@playwright/test";
import { eq } from "drizzle-orm";
import { login, logout, signup, uniqueEmail, uniqueName } from "./utils/auth-ui";
import { FIXED_USERS, TEST_PASSWORD, ensureReceiptsBucket } from "./utils/fixtures";
import { testDb, schema } from "./utils/db";

const PASSWORD = "Intel-Pass1";
const today = new Date().toISOString().slice(0, 10);

// A real, minimal 1×1 PNG — content is irrelevant here (no OCR key in this
// environment), only that it's a valid non-empty file so upload succeeds.
const PNG_1PX_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

let storageReady = false;
test.beforeAll(async () => {
  storageReady = await ensureReceiptsBucket();
});
test.beforeEach(() => {
  test.skip(
    !storageReady,
    "Supabase Storage unreachable in this environment — receipt upload needs the Storage endpoint reachable from the app + test runner.",
  );
});

async function submitPendingClaim(
  page: Page,
  opts: { category: "Sports" | "Learning"; amountRupees: number; vendor: string },
): Promise<void> {
  await page.goto("/submit");
  await page.locator("button").filter({ hasText: opts.category }).click();
  await page.locator("input[inputmode='numeric']").fill(String(opts.amountRupees));
  await page.locator("input[type='date']").fill(today);
  await page.getByPlaceholder("e.g. Cult.fit annual membership").fill(opts.vendor);
  await page.locator("input[type='file']").setInputFiles({
    name: "receipt.png",
    mimeType: "image/png",
    buffer: Buffer.from(PNG_1PX_BASE64, "base64"),
  });
  await expect(page.getByText("ready to verify")).toBeVisible();
  await page.getByRole("button", { name: "Run verification & submit" }).click();
  // No OCR key → extraction is inconclusive → always routes to HR, never auto-approved.
  await expect(page.getByText("Routed to HR Head", { exact: true })).toBeVisible();
}

/** Arrangement-only DB lookup (per e2e-testing conventions) to build the /expenses/[id]/intelligence URL — the queue UI itself has no Analyze link yet (that's KAN-113). */
async function claimIdFor(applicantName: string): Promise<string> {
  const db = testDb();
  const rows = await db
    .select({ id: schema.benefitClaims.id })
    .from(schema.benefitClaims)
    .innerJoin(schema.users, eq(schema.benefitClaims.userId, schema.users.id))
    .where(eq(schema.users.name, applicantName));
  if (!rows[0]) throw new Error(`No claim found for ${applicantName}`);
  return rows[0].id;
}

test("HR sees the AI score, extracted fields, fraud signals, duplicate check, and audit trail for a pending claim", async ({ page }) => {
  const applicantName = uniqueName("Rhea Kulkarni");
  await signup(page, { name: applicantName, email: uniqueEmail("intel-view"), password: PASSWORD });
  await submitPendingClaim(page, { category: "Sports", amountRupees: 1500, vendor: "Cult Fit" });
  const claimId = await claimIdFor(applicantName);
  await logout(page);

  await login(page, { email: FIXED_USERS.hrHead.email, password: TEST_PASSWORD });
  await page.goto(`/expenses/${claimId}/intelligence`);

  await expect(page.getByRole("heading", { name: "Receipt intelligence" })).toBeVisible();
  // The applicant's name legitimately appears twice — the header subtitle and
  // the audit trail's "Claim submitted" actor — so scope past strict mode.
  await expect(page.getByText(applicantName).first()).toBeVisible();
  // File uploaded but unreadable by OCR (no key): only "Amount matches receipt"
  // and "OCR confidence" fail; everything else passes → score 70/100, "review" —
  // deterministic and never a false "approve".
  await expect(page.getByText("Needs human review").first()).toBeVisible();
  await expect(page.getByText("/ 100 CONFIDENCE")).toBeVisible();
  await expect(page.getByText("70").first()).toBeVisible();

  await expect(page.getByText("Why this score")).toBeVisible();
  // Same rule-check detail text is reused verbatim in both the factors panel
  // and the fraud-signals panel below — legitimately appears twice.
  await expect(page.getByText("Claimed amount differs from receipt").first()).toBeVisible();

  await expect(page.getByText("Fraud & anomaly signals")).toBeVisible();
  await expect(page.getByText("Amount mismatch")).toBeVisible();
  await expect(page.getByText("Low OCR confidence")).toBeVisible();

  await expect(page.getByText("No duplicate found")).toBeVisible();

  await expect(page.getByText("Audit trail")).toBeVisible();
  await expect(page.getByText("Claim submitted")).toBeVisible();
  await expect(page.getByText("AI score computed")).toBeVisible();
});

test("HR can approve a claim directly from the Receipt Intelligence screen", async ({ page }) => {
  const applicantName = uniqueName("Farhan Sheikh");
  await signup(page, { name: applicantName, email: uniqueEmail("intel-approve"), password: PASSWORD });
  await submitPendingClaim(page, { category: "Learning", amountRupees: 2500, vendor: "edX Course" });
  const claimId = await claimIdFor(applicantName);
  await logout(page);

  await login(page, { email: FIXED_USERS.hrHead.email, password: TEST_PASSWORD });
  await page.goto(`/expenses/${claimId}/intelligence`);

  await expect(page.getByText("AI recommendation:")).toBeVisible();
  await page.getByRole("button", { name: "Approve ₹2,500" }).click();
  await expect(page.getByText("Approved ₹2,500 — employee notified")).toBeVisible();

  await page.goto("/expenses/history");
  await expect(page.locator("table tbody tr", { hasText: applicantName }).getByText("Approved", { exact: true })).toBeVisible();
});

test("rejecting from the Receipt Intelligence screen requires a reason and releases the reserved balance", async ({ page }) => {
  const applicantName = uniqueName("Ishita Rao");
  const applicantEmail = uniqueEmail("intel-reject");
  await signup(page, { name: applicantName, email: applicantEmail, password: PASSWORD });
  await submitPendingClaim(page, { category: "Sports", amountRupees: 1000, vendor: "Yoga Studio" });
  await page.goto("/dashboard");
  await expect(page.getByText("₹14,000")).toBeVisible(); // reserved
  const claimId = await claimIdFor(applicantName);
  await logout(page);

  await login(page, { email: FIXED_USERS.hrHead.email, password: TEST_PASSWORD });
  await page.goto(`/expenses/${claimId}/intelligence`);

  // Rejecting without a reason is blocked client-side — the panel stays put.
  await page.getByRole("button", { name: "Reject" }).click();
  await expect(page.getByText("Add a reason the employee will see")).toBeVisible();
  await expect(page.getByRole("button", { name: "Reject" })).toBeVisible();

  await page.getByPlaceholder("Recorded in the audit trail…").fill("Receipt not provided");
  await page.getByRole("button", { name: "Reject" }).click();
  await expect(page.getByText("Claim rejected — balance released, employee notified")).toBeVisible();

  await logout(page);
  await login(page, { email: applicantEmail, password: PASSWORD });
  await page.goto("/dashboard");
  await expect(page.getByText("₹15,000").first()).toBeVisible(); // fully released
});
