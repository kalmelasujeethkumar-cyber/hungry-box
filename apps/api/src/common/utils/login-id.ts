export function normalizeLoginId(input: string): string {
  const trimmed = input.trim();
  return trimmed.includes('@') ? trimmed.toLowerCase() : trimmed;
}
