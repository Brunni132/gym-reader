export function square(angle) {
  return Math.sin(angle) >= 0 ? 1 : -1;
}

export function triangle(angle) {
  const quarter = Math.PI / 2;
  let rem = angle - Math.floor(angle / (2 * Math.PI)) * (2 * Math.PI);
  if (rem < quarter) return rem / quarter;
  rem -= quarter;
  if (rem < quarter) return 1 - rem / quarter;
  rem -= quarter;
  if (rem < quarter) return -rem / quarter;
  rem -= quarter;
  return -1 + rem / quarter;
}

export const sin = Math.sin;
