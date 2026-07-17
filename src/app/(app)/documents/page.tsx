import { requireAccess } from "@/server/auth/current-user";
import { listEmployeeDocuments } from "@/server/employee/documents";
import { DocumentsClient } from "./documents-client";

export const metadata = { title: "My documents · SmartSense" };

// KAN-224 — Employee Document Vault. Server Component, gated by requireAccess
// (all roles, personal). Loads the caller's own documents (with derived expiry
// status) and hands them to a client that uploads/downloads/replaces/deletes
// through the ownership-scoped server actions.
export default async function DocumentsPage() {
  const user = await requireAccess("/documents");
  const documents = await listEmployeeDocuments(user.id);

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-[23px] font-semibold tracking-[-0.02em]">My documents</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Securely store your personal documents. Only you (and HR when needed) can access them.
        </p>
      </div>
      <DocumentsClient documents={documents} />
    </div>
  );
}
