// Zone palette (map-coloured so neighbours differ) and the district's six utilization tiers.
export const PALETTE = ['#e6a23c', '#5aa9e6', '#8bc34a', '#e57373', '#ba68c8', '#4db6ac', '#ffd54f', '#7986cb', '#f06292', '#ff8a65'];
export const TIERS = [
  { max: 0.45, color: '#f4847a', label: 'Under 45%' },
  { max: 0.55, color: '#f5a623', label: '45–55%' },
  { max: 0.65, color: '#f2e04b', label: '55–65%' },
  { max: 0.75, color: '#4caf50', label: '65–75%' },
  { max: 0.85, color: '#2f80ed', label: '75–85%' },
  { max: Infinity, color: '#8e24aa', label: 'Above 85%' },
];
export const tierColor = (u: number) => TIERS.find(t => u < t.max + 1e-9)!.color;
export const UNASSIGNED = '#9e9e9e';
/** Colors from the district's Nov 2026 boundary maps (legend swatches), for the schools on those maps. */
export const DISTRICT_COLORS: Record<string, string> = {
  'Arbor Creek': '#ff7f7e', Bentwood: '#0085a8', Briarwood: '#ffd480', Brougham: '#f9fec4', Countryside: '#df72ff', 'Green Springs': '#4de600',
  Havencroft: '#b6fefb', Heatherstone: '#fee6b6', 'Indian Creek': '#a3ff74', 'Madison Place': '#cccccc', 'Pleasant Ridge': '#fdd9f2',
  'Regency Place': '#feffb3', Sunnyside: '#dbc3ff',
};
/** Colors from the legends on the district's Nov 2026 middle school concept maps. */
export const MIDDLE_SCHOOL_COLORS: Record<string, string> = {
  'California Trail': '#ffaa00', 'Chisholm Trail': '#ffff00', 'Frontier Trail': '#73b2ff', 'Indian Trail': '#b9febb', 'Mission Trail': '#b2b2b2',
  'Oregon Trail': '#f5a27a', 'Pioneer Trail': '#a900e6', 'Prairie Trail': '#df73ff', 'Santa Fe Trail': '#ff0000', 'Summit Trail': '#4ce600',
};
/** A school's map color: the district's where it has one, otherwise the map-colored palette. */
export const schoolColor = (s: { name: string; level: string; color?: number }) =>
  (s.level === 'es' && DISTRICT_COLORS[s.name]) || (s.level === 'ms' && MIDDLE_SCHOOL_COLORS[s.name]) || PALETTE[(s.color ?? 0) % PALETTE.length];
