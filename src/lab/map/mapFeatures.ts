// GeoJSON the map draws, built from the lab's data and a plan's results.
import type { Level, Static } from '../data';
import type { LevelResult } from '../model/engine';
import { headline, type SchoolNumber } from '../numbers';

type FeatureCollection = GeoJSON.FeatureCollection;

export const OVERLAY_LEVELS: Level[] = ['es', 'ms', 'hs'];
const GRADE_RANGE: Record<Level, string> = { es: 'K–5', ms: '6–8', hs: '9–12' };
const LOCAL_STREET_CLASS_LIMIT = 8;   // street classes from here up aren't drawn as snapping lines

/** The chosen overlay level's boundaries in this plan, plus a point at each of its open schools for the name tag. */
export function overlayFeatures(staticData: Static, results: Record<Level, LevelResult> | null, overlay: Level | null | undefined) {
  const collections: Record<string, FeatureCollection> = {};
  for (const overlayLevel of OVERLAY_LEVELS) {
    const zones = overlayLevel === overlay ? results?.[overlayLevel]?.zones : undefined;
    const areas = zones?.features.map(feature => ({ ...feature, properties: { school: feature.properties!.school as number } })) ?? [];
    const openSchools = [...new Set(areas.map(area => area.properties.school).filter(school => school >= 0))];
    const schoolPoints = openSchools.map(school => ({
      type: 'Feature' as const,
      properties: { school, name: staticData.schools[school].name },
      geometry: { type: 'Point' as const, coordinates: [staticData.schools[school].lon, staticData.schools[school].lat] },
    }));
    collections[overlayLevel] = { type: 'FeatureCollection', features: [...areas, ...schoolPoints] };
  }
  return collections;
}

export function schoolFeatures(staticData: Static, level: Level, visibleSchools: Set<number>, numbers: Map<number, SchoolNumber>, closures: Record<string, number>): FeatureCollection {
  const schools = staticData.schools.filter(school => school.level === level && visibleSchools.has(school.i));
  return {
    type: 'FeatureCollection',
    features: schools.map(school => {
      const schoolNumber = numbers.get(school.i);
      const closed = closures[String(school.i)] !== undefined;
      const numberLabel = schoolNumber && !closed ? headline(schoolNumber) : '';
      return {
        type: 'Feature',
        properties: { school: school.i, name: school.name, label: closed ? `${school.name}\n(closing)` : `${school.name}\n${numberLabel}`, closed: closed ? 1 : 0,
          estimate: schoolNumber?.source === 'model' && !closed ? 1 : 0 },
        geometry: { type: 'Point', coordinates: [school.lon, school.lat] },
      };
    }),
  };
}

/** District planning areas: dashed lines plus each area's number and, unless hidden, the students living there for the level and year shown. */
export function planningFeatures(staticData: Static, visibleSchools: Set<number>, level: Level, year: number, showStudents: boolean): FeatureCollection {
  const visibleNames = new Set(staticData.schools.filter(school => visibleSchools.has(school.i) && school.level === 'es').map(school => school.name));
  const areas = staticData.planning.features.filter(feature => visibleNames.has(feature.properties!.school));
  const outlines = areas.map(feature => ({ ...feature, properties: { pa: feature.properties!.pa } }));
  const labels = areas.map((feature): GeoJSON.Feature => {
    const area = feature.properties!, students = Math.round(area[level][year]);
    const label = showStudents ? `${area.pa}\n${students} ${GRADE_RANGE[level]}` : String(area.pa);
    return { type: 'Feature', properties: { label }, geometry: { type: 'Point', coordinates: [area.lon, area.lat] } };
  });
  return { type: 'FeatureCollection', features: [...outlines, ...labels] };
}

export function homeFeatures(staticData: Static): FeatureCollection {
  const homes = staticData.homes, features: GeoJSON.Feature[] = new Array(homes.n);
  for (let home = 0; home < homes.n; home++) {
    features[home] = { type: 'Feature', id: home, properties: { u: homes.units[home] }, geometry: { type: 'Point', coordinates: [homes.lon[home], homes.lat[home]] } };
  }
  return { type: 'FeatureCollection', features };
}

export function streetFeatures(staticData: Static): FeatureCollection {
  const streets = staticData.streets, features: GeoJSON.Feature[] = [];
  for (let edge = 0; edge < streets.nEdges; edge++) {
    if (streets.cls[edge] >= LOCAL_STREET_CLASS_LIMIT) continue;
    const coordinates: number[][] = [];
    for (let point = streets.coordOff[edge]; point < streets.coordOff[edge + 1]; point++) coordinates.push([streets.coordLon[point], streets.coordLat[point]]);
    features.push({ type: 'Feature', properties: { c: streets.cls[edge] }, geometry: { type: 'LineString', coordinates } });
  }
  return { type: 'FeatureCollection', features };
}
