// Binary files. Hosts that only serve text (the Claude artifact host) get base64 copies named <file>.b64.txt;
// build with NEXT_PUBLIC_B64=1 to read those instead.
export const B64 = process.env.NEXT_PUBLIC_B64 === '1';
export async function fetchBin(url: string): Promise<ArrayBuffer> {
  if (!B64) {
    const r = await fetch(url); if (!r.ok) throw new Error(url + ' ' + r.status); return r.arrayBuffer();
  }
  const r = await fetch(url + '.b64.txt'); if (!r.ok) throw new Error(url + ' ' + r.status);
  const s = atob((await r.text()).trim());
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out.buffer;
}
