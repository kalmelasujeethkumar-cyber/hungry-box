export function formatPaise(amountMinor: number): string {
  const rupees = Math.trunc(amountMinor / 100);
  const paise = Math.abs(amountMinor % 100);
  const suffix = paise > 0 ? `.${paise.toString().padStart(2, '0')}` : '';
  return `₹${rupees.toLocaleString('en-IN')}${suffix}`;
}
