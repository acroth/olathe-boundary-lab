import type { Streets } from '../data';

// Compressed adjacency of the street graph. `publicOnly` drops service drives (used for tracing boundaries).
export interface Graph { off: Uint32Array; to: Uint32Array; edge: Uint32Array; w: Float32Array; n: number }

export function buildGraph(s: Streets, publicOnly: boolean): Graph {
  const SERVICE = 8;
  const deg = new Uint32Array(s.nNodes + 1);
  for (let e = 0; e < s.nEdges; e++) {
    if (publicOnly && s.cls[e] >= SERVICE) continue;
    deg[s.u[e]]++; deg[s.v[e]]++;
  }
  const off = new Uint32Array(s.nNodes + 1);
  for (let i = 0; i < s.nNodes; i++) off[i + 1] = off[i] + deg[i];
  const fill = off.slice(0, s.nNodes);
  const m = off[s.nNodes];
  const to = new Uint32Array(m), edge = new Uint32Array(m), w = new Float32Array(m);
  for (let e = 0; e < s.nEdges; e++) {
    if (publicOnly && s.cls[e] >= SERVICE) continue;
    const a = s.u[e], b = s.v[e];
    to[fill[a]] = b; edge[fill[a]] = e; w[fill[a]++] = s.len[e];
    to[fill[b]] = a; edge[fill[b]] = e; w[fill[b]++] = s.len[e];
  }
  return { off, to, edge, w, n: s.nNodes };
}

class Heap {
  k: number[] = []; v: number[] = [];
  get size() { return this.k.length; }
  push(key: number, val: number) {
    const k = this.k, v = this.v; let i = k.length; k.push(key); v.push(val);
    while (i > 0) { const p = (i - 1) >> 1; if (k[p] <= key) break; k[i] = k[p]; v[i] = v[p]; i = p; }
    k[i] = key; v[i] = val;
  }
  pop(): [number, number] {
    const k = this.k, v = this.v; const rk = k[0], rv = v[0];
    const lk = k.pop()!, lv = v.pop()!; const n = k.length;
    if (n) {
      let i = 0;
      while (true) {
        let c = 2 * i + 1; if (c >= n) break;
        if (c + 1 < n && k[c + 1] < k[c]) c++;
        if (k[c] >= lk) break;
        k[i] = k[c]; v[i] = v[c]; i = c;
      }
      k[i] = lk; v[i] = lv;
    }
    return [rk, rv];
  }
}

/** Shortest road distance (ft) from `src` to every node. */
export function dijkstraAll(g: Graph, src: number): Float32Array {
  const d = new Float64Array(g.n).fill(Infinity);   // float64: a float32 store would round below the popped key and skip nodes
  const h = new Heap(); d[src] = 0; h.push(0, src);
  while (h.size) {
    const [du, u] = h.pop();
    if (du > d[u]) continue;
    for (let p = g.off[u]; p < g.off[u + 1]; p++) {
      const nd = du + g.w[p], v = g.to[p];
      if (nd < d[v]) { d[v] = nd; h.push(nd, v); }
    }
  }
  return Float32Array.from(d);
}

/** Shortest path between two nodes; returns the list of edge ids in order, or null. */
export function shortestPath(g: Graph, a: number, b: number, s: Streets): { edges: number[]; nodes: number[] } | null {
  if (a === b) return { edges: [], nodes: [a] };
  const d = new Map<number, number>(), prev = new Map<number, number>(), pe = new Map<number, number>();
  const bx = s.nodeLon[b], by = s.nodeLat[b];
  const FT_LON = 287000, FT_LAT = 364000; // ft per degree near 38.9N
  const hfun = (n: number) => Math.hypot((s.nodeLon[n] - bx) * FT_LON, (s.nodeLat[n] - by) * FT_LAT) * 0.98;
  const h = new Heap(); d.set(a, 0); h.push(hfun(a), a);
  let found = false, it = 0;
  while (h.size && it++ < 400000) {
    const [, u] = h.pop();
    if (u === b) { found = true; break; }
    const du = d.get(u)!;
    for (let p = g.off[u]; p < g.off[u + 1]; p++) {
      const v = g.to[p], nd = du + g.w[p];
      if (nd < (d.get(v) ?? Infinity)) { d.set(v, nd); prev.set(v, u); pe.set(v, g.edge[p]); h.push(nd + hfun(v), v); }
    }
  }
  if (!found) return null;
  const edges: number[] = [], nodes: number[] = [b];
  let c = b;
  while (c !== a) { edges.push(pe.get(c)!); c = prev.get(c)!; nodes.push(c); }
  return { edges: edges.reverse(), nodes: nodes.reverse() };
}

/** Coordinates of a path, oriented from nodes[0] to nodes[last]. */
export function pathCoords(s: Streets, path: { edges: number[]; nodes: number[] }): [number, number][] {
  const out: [number, number][] = [[s.nodeLon[path.nodes[0]], s.nodeLat[path.nodes[0]]]];
  path.edges.forEach((e, k) => {
    const from = path.nodes[k];
    const a = s.coordOff[e], z = s.coordOff[e + 1];
    const pts: [number, number][] = [];
    for (let i = a; i < z; i++) pts.push([s.coordLon[i], s.coordLat[i]]);
    if (s.u[e] !== from) pts.reverse();
    for (let i = 1; i < pts.length; i++) out.push(pts[i]);
  });
  return out;
}
