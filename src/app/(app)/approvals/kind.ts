import type { RequestKind } from "@/server/manager/approvals";

/** Tailwind class sets for a leave (blue) vs WFH (violet) badge / dot / text. */
export function kindClasses(kind: RequestKind) {
  return kind === "wfh"
    ? { badge: "bg-violet-600/[0.13] text-violet-600", dot: "bg-violet-600", text: "text-violet-600" }
    : { badge: "bg-blue-600/[0.12] text-blue-600", dot: "bg-blue-600", text: "text-blue-600" };
}
