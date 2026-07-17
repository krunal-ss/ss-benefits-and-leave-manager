// KAN-224 — Employee Document Vault categories. Isomorphic (imported by both the
// client upload form and server code), so no server-only imports here. Kept in
// sync with the `employee_document_category` pgEnum in src/db/schema.ts.
export const DOCUMENT_CATEGORIES = [
  "identity",
  "education",
  "employment",
  "financial",
  "medical",
  "other",
] as const;

export type DocumentCategory = (typeof DOCUMENT_CATEGORIES)[number];

export const DOCUMENT_CATEGORY_LABELS: Record<DocumentCategory, string> = {
  identity: "Identity",
  education: "Education",
  employment: "Employment",
  financial: "Financial",
  medical: "Medical",
  other: "Other",
};
