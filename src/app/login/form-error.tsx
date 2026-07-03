import type { AuthState } from "@/app/login/actions";

export function FormError({ state }: { state: AuthState }) {
  if (!state.error) return null;
  return <p className="text-[12.5px] text-destructive">{state.error}</p>;
}
