export function addBuffers(dest, ...sources) {
  for (let i = 0; i < dest.length; i++) {
    let val = sources[0][i];
    for (let j = 1; j < sources.length; j++)
      val += sources[j][i];
    dest[i] = val;
  }
  return dest;
}
