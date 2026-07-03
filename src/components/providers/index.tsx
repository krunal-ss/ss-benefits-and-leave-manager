import { ThemeProvider } from "./theme-provider";
import { ToastProvider } from "./toast-provider";
import { SupabaseSessionProvider } from "./supabase-session";

export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <SupabaseSessionProvider>
      <ThemeProvider>
        <ToastProvider>{children}</ToastProvider>
      </ThemeProvider>
    </SupabaseSessionProvider>
  );
}

export { useTheme } from "./theme-provider";
export { useToast } from "./toast-provider";
