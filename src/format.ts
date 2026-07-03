const UNITS = ['K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx', 'Sp', 'Oc', 'No', 'Dc'];

/** Whole-number style: 999 → "999", 1234 → "1.23K", 4.56e13 → "45.6T". */
export function fmt(n: number): string {
  if (!Number.isFinite(n)) return '∞';
  if (n < 0) return '-' + fmt(-n);
  if (n < 1e3) return Math.floor(n).toString();
  let v = n;
  let u = -1;
  while (v >= 1e3 && u < UNITS.length - 1) {
    v /= 1e3;
    u++;
  }
  const decimals = v >= 100 ? 0 : v >= 10 ? 1 : 2;
  return trimZeros(v.toFixed(decimals)) + UNITS[u];
}

/** Rate style: keeps one decimal below 1000 so "0.1 LoC/s" reads. */
export function fmtRate(n: number): string {
  if (!Number.isFinite(n)) return '∞';
  if (n < 0) return '-' + fmtRate(-n);
  if (n < 1e3) return trimZeros(n.toFixed(1));
  return fmt(n);
}

function trimZeros(s: string): string {
  return s.includes('.') ? s.replace(/\.?0+$/, '') : s;
}
