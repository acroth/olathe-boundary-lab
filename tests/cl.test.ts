import { it } from 'vitest';
import { readFileSync } from 'fs';
import { Clipper, Clipper64, ClipType, EndType, FillRule, JoinType } from 'clipper2-js';
it('steps', () => {
  const D = new URL('../public/data/', import.meta.url).pathname;
  const z = JSON.parse(readFileSync(D + 'zones_es.geojson', 'utf8'));
  const f = z.features.find((x: any) => x.geometry.coordinates.flat(3).length > 1000) ?? z.features[0];
  const rings = (f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates).flat();
  const paths = rings.map((r: any) => r.slice(0, -1).map(([x, y]: any) => ({ x: Math.round((x + 94.8) * 1e7), y: Math.round((y - 38.9) * 1e7) })));
  console.log('verts', paths.reduce((a: number, p: any) => a + p.length, 0));
  let t = performance.now(); const c = new Clipper64(); c.addSubjectPaths(paths); const o: any = []; c.execute(ClipType.Union, FillRule.EvenOdd, o); console.log('union', Math.round(performance.now() - t));
  for (const jt of [JoinType.Miter, JoinType.Square, JoinType.Bevel]) { t = performance.now(); const r = Clipper.InflatePaths(o, 300, jt, EndType.Polygon, 2); console.log('inflate', jt, r.reduce((a: number, p: any) => a + p.length, 0), Math.round(performance.now() - t)); }
});
