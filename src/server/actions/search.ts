"use server";

import { requireUser } from "@/server/auth/current-user";
import { searchAll, type SearchResults } from "@/server/search";

/** Server Action wrapper so client components (command palette, /search page) can call the RBAC-scoped search. */
export async function searchAction(query: string): Promise<SearchResults> {
  const me = await requireUser();
  return searchAll(me, query);
}
