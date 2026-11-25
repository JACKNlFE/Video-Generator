const USD = /^(\d+)(?:\.(\d{1,6}))?$/;

export function usdToMicros(value: string): number {
  const match = USD.exec(value.trim());
  if (!match) throw new Error("USD amount must be a non-negative number with at most 6 decimal places.");
  const whole = Number(match[1]);
  const fraction = (match[2] ?? "").padEnd(6, "0");
  const micros = whole * 1_000_000 + Number(fraction);
  if (!Number.isSafeInteger(micros)) throw new Error("USD amount is too large.");
  return micros;
}

export function microsToUsd(micros: number): string {
  const sign = micros < 0 ? "-" : "";
  const absolute = Math.abs(micros);
  const whole = Math.floor(absolute / 1_000_000);
  const fraction = String(absolute % 1_000_000).padStart(6, "0").replace(/0+$/, "");
  return fraction.length > 0 ? `${sign}${whole}.${fraction}` : `${sign}${whole}`;
}
