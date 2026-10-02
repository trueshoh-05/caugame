/** Endesga 32, one character per colour. '.' is transparent. */
export const PALETTE: Record<string, string> = {
  q: '#be4a2f', Q: '#d77643', s: '#ead4aa', S: '#e4a672', u: '#b86f50', U: '#733e39', z: '#3e2731',
  r: '#a22633', R: '#e43b44', o: '#f77622', y: '#feae34', Y: '#fee761', l: '#63c74d', L: '#3e8948',
  e: '#265c42', E: '#193c3e', b: '#124e89', B: '#0099db', c: '#2ce8f5', w: '#ffffff', G: '#c0cbdc',
  g: '#8b9bb4', N: '#5a6988', n: '#3a4466', K: '#262b44', k: '#181425', x: '#ff0044', p: '#68386c',
  P: '#b55088', f: '#f6757a', h: '#e8b796', H: '#c28569',
};

export function hex(c: string): number { return parseInt(PALETTE[c].slice(1), 16); }

/** ABGR little-endian pixel value for writing into a Uint32Array over ImageData. */
export function abgr(c: string, a = 255): number {
  const v = hex(c);
  return ((a << 24) | ((v & 0xff) << 16) | (v & 0xff00) | ((v >> 16) & 0xff)) >>> 0;
}
