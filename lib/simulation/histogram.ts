export interface WealthBin { lower: number; upper: number; count: number; }

/** Old saves may contain sub-cent floating-point residue below zero. */
export function buildWealthHistogram(values: readonly number[]) {
  const valid: number[] = [];
  let invalidCount = 0;
  for (const value of values) {
    if (!Number.isFinite(value) || value < -1e-7) {
      invalidCount++;
    } else {
      valid.push(Math.max(0, value));
    }
  }
  const max = valid.reduce((largest, value) => Math.max(largest, value), 1);
  const span = Math.log1p(max) / 16;
  const bins: WealthBin[] = Array.from({ length: 16 }, (_, i) => ({
    lower: Math.expm1(i * span),
    upper: i === 15 ? max : Math.expm1((i + 1) * span),
    count: 0,
  }));
  for (const value of valid) {
    const index = Math.max(0, Math.min(15, Math.floor(Math.log1p(value) / span)));
    bins[index].count++;
  }
  return { bins, invalidCount };
}
