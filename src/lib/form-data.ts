/** Reads a text field from FormData, discarding the File branch instead of asserting it away. */
export function formString(formData: FormData, key: string): string | null {
  const value = formData.get(key);
  return typeof value === "string" ? value : null;
}
