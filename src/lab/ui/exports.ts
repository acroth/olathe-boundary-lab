import type { MapRef } from 'react-map-gl/maplibre';
import { LEVELS, type Static } from '../data';
import type { Results } from '../App';
import type { Plan } from '../store';

function download(name: string, data: BlobPart, type: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([data], { type }));
  a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
const slug = (p: Plan) => (p.name || p.preset).replace(/[^a-z0-9]+/gi, '-').toLowerCase();

export function exportGeoJSON(S: Static, r: Results, plan: Plan) {
  const features = LEVELS.flatMap(lv => r.levels[lv].zones.features.map(f => {
    const s = f.properties!.school as number;
    return { ...f, properties: { level: lv, school: s < 0 ? 'Unassigned' : S.schools[s].name, schoolId: s < 0 ? null : S.schools[s].id } };
  }));
  download(`boundaries-${slug(plan)}.geojson`, JSON.stringify({ type: 'FeatureCollection', features }), 'application/geo+json');
}

export function exportCSV(S: Static, r: Results, plan: Plan) {
  const Y = S.meta.years;
  const rows = [['level', 'school', 'capacity', 'capacity_source', 'year', 'neighborhood_students', 'fixed_prek_immersion', 'utilization', 'homes', 'pieces', 'from_closed_schools', 'from_open_schools']];
  for (const lv of LEVELS) for (const k in r.levels[lv].schools) {
    const t = r.levels[lv].schools[k], s = S.schools[Number(k)];
    if (!t.open) { rows.push([lv, s.name, String(s.capacity), s.capSource, '', '', '', 'closing', '', '', '', '']); continue; }
    for (let y = S.meta.firstPlanYear; y < Y.length; y++)
      rows.push([lv, s.name, String(s.capacity), s.capSource, Y[y], t.students[y].toFixed(1), t.inBuilding.toFixed(0), t.util[y].toFixed(4), String(t.homes), String(t.pieces), t.fromClosingSchools.toFixed(1), t.fromOpenSchools.toFixed(1)]);
  }
  const csv = rows.map(r => r.map(c => /[",\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c).join(',')).join('\n');
  download(`numbers-${slug(plan)}.csv`, csv, 'text/csv');
}

export function exportPNG(m: MapRef) {
  const c = m.getMap().getCanvas();
  c.toBlob(b => b && download('boundary-map.png', b, 'image/png'));
}
