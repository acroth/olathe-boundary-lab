import { it } from 'vitest';
import { readFileSync } from 'fs';
import { boolOp } from '../src/lab/model/clip';
import { polyAcres, toMPoly } from '../src/lab/model/geo';
it('clip', () => {
  const D = new URL('../public/data/', import.meta.url).pathname;
  const z = JSON.parse(readFileSync(D + 'zones_es.geojson', 'utf8')), d = JSON.parse(readFileSync(D + 'district.geojson', 'utf8'));
  const a = toMPoly(z.features[0].geometry), dm = toMPoly(d.features[0].geometry);
  const ac = (m: any) => m.reduce((s: number, p: any) => s + polyAcres(p), 0).toFixed(0);
  console.log('a', ac(a), 'd', ac(dm), 'a∩d', ac(boolOp('intersection', a, dm)), 'a∪a1', ac(boolOp('union', a, toMPoly(z.features[1].geometry))), 'd-a', ac(boolOp('difference', dm, a)));
});
