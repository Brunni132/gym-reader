export function addBuffers(dest, ...sources) {
  for (let i = 0; i < dest.length; i++) {
    let val = sources[0][i];
    for (let j = 1; j < sources.length; j++)
      val += sources[j][i];
    dest[i] = val;
  }
  return dest;
}


export function addStereoBuffers(dest, ...sources)
{	
  for (let k = 0; k < 2; k++) {
	  for (let i = 0; i < dest[k].length; i++) {
		let val = sources[0][k][i];
		for (let j = 1; j < sources.length; j++)
		  val += sources[j][k][i];
		dest[k][i] = val;
	  }
  }
  return dest;	
}