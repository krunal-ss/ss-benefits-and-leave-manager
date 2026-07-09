import { requireAccess } from "@/server/auth/current-user";
import { searchAll } from "@/server/search";
import { SearchClient } from "./search-client";

export const metadata = { title: "Search · SmartSense" };

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const user = await requireAccess("/search");
  const { q } = await searchParams;
  const initialQuery = q ?? "";
  const initialResults = initialQuery
    ? await searchAll(user, initialQuery)
    : { leaves: [], claims: [], people: [], policies: [] };

  return <SearchClient initialQuery={initialQuery} initialResults={initialResults} />;
}
