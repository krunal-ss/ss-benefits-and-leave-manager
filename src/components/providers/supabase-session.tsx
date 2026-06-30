"use client";

// Keeps a long-lived browser Supabase client mounted for the lifetime of the
// app. Its job is purely client-side session upkeep: the browser client has
// autoRefreshToken on, so while a tab sits open past the 5-minute access-token
// lifetime it silently exchanges the refresh token for a new access token
// (server-side, middleware does the same on every navigation). When the session
// ends — sign-out, or a refresh that can't be recovered — we bounce to /login.

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/server/supabase/client";

export function SupabaseSessionProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT" && pathname !== "/login") {
        router.replace("/login");
        router.refresh();
      }
    });
    return () => subscription.unsubscribe();
  }, [router, pathname]);

  return <>{children}</>;
}
