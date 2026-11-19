// Free draw's compare and export tools, the plan's list of areas, and the data sources.
import type { MutableRefObject } from 'react';
import type { MapRef } from 'react-map-gl/maplibre';
import type { Edit, Level, Static } from '../../data';
import type { Results } from '../../App';
import { startingPlans, withStartingPlan } from '../../startingPlans';
import { usePlan, useSaved, useUI, type Plan } from '../../store';
import { exportCSV, exportGeoJSON, exportPNG } from '../exports';

const EDIT_KIND_LABEL: Record<Edit['kind'], string> = { draw: 'Drawn', trace: 'Traced', blocks: 'Painted', area: 'Area', preset: 'Plan' };
const START_PREFIX = 'start:', SAVED_PREFIX = 'saved:';
const LEVEL_NAME: Record<Level, string> = { es: 'Elementary', ms: 'Middle school', hs: 'High school' };

function editLabel(staticData: Static, edit: Edit): string {
  const target = edit.school < 0 ? 'Unassigned' : staticData.schools[edit.school].name;
  if (edit.kind === 'area') return `${edit.label} → ${target}`;
  return edit.label ?? `${EDIT_KIND_LABEL[edit.kind]} → ${target}`;
}

interface CompareSectionProps {
  staticData: Static;
  plan: Plan;
  level: Level;
  planResults: Results | null;
  mapRef: MutableRefObject<MapRef | null>;
  compareLink: string;
  onCompareLinkChange: (link: string) => void;
  decodeSavedPlan: (encoded: string) => Plan | null;
}

export default function CompareSection({ staticData, plan, level, planResults, mapRef, compareLink, onCompareLinkChange, decodeSavedPlan }: CompareSectionProps) {
  const { meta } = staticData;
  const ui = useUI();
  const savedPlans = useSaved(state => state.saved);
  const { removeEdit } = usePlan.getState();

  const startCompare = (choice: string) => {
    if (!choice) {
      ui.set({ compare: null, diff: false });
    } else if (choice.startsWith(START_PREFIX)) {
      const start = startingPlans(staticData, level).find(candidate => candidate.id === choice.slice(START_PREFIX.length))!;
      ui.set({ compare: { ...withStartingPlan(staticData, plan, level, start.id), name: `${LEVEL_NAME[level]}: ${start.name}` } });
    } else if (choice.startsWith(SAVED_PREFIX)) {
      const saved = savedPlans.find(candidate => candidate.name === choice.slice(SAVED_PREFIX.length));
      const decoded = saved && decodeSavedPlan(saved.enc);
      if (decoded) ui.set({ compare: decoded });
    }
  };
  const compareWithLink = () => {
    const match = compareLink.match(/plan=([^&]+)/);
    const decoded = match ? decodeSavedPlan(decodeURIComponent(match[1])) : null;
    if (decoded) {
      ui.set({ compare: decoded });
      onCompareLinkChange('');
    } else {
      ui.set({ toast: 'That link does not contain a plan.' });
    }
  };

  const levelEditCount = plan.edits.filter(edit => edit.level === level).length;

  return (
    <section>
      <h3>Compare with</h3>
      <select value="" onChange={event => startCompare(event.target.value)}>
        <option value="">{ui.compare ? 'Change or stop comparing…' : 'Pick a plan…'}</option>
        {ui.compare && <option value="">Stop comparing</option>}
        {startingPlans(staticData, level).map(start => <option key={start.id} value={START_PREFIX + start.id}>{start.name}</option>)}
        {savedPlans.map(saved => <option key={saved.name} value={SAVED_PREFIX + saved.name}>Saved: {saved.name}</option>)}
      </select>
      <div className="row gap">
        <input placeholder="…or paste a plan link" value={compareLink} onChange={event => onCompareLinkChange(event.target.value)} />
        <button onClick={compareWithLink} disabled={!compareLink}>Compare</button>
      </div>
      {ui.compare && <label className="chk"><input type="checkbox" checked={ui.diff} onChange={event => ui.set({ diff: event.target.checked })} /> Highlight homes assigned differently (red)</label>}

      <h3>Export</h3>
      <div className="row gap wrap">
        <button onClick={() => planResults && exportGeoJSON(staticData, planResults, plan)}>Boundaries (GeoJSON)</button>
        <button onClick={() => planResults && exportCSV(staticData, planResults, plan)}>Numbers (CSV)</button>
        <button onClick={() => mapRef.current && exportPNG(mapRef.current)}>Map image (PNG)</button>
      </div>

      <h3>Areas in this plan ({levelEditCount})</h3>
      <ul className="list edits">
        {plan.edits.map((edit, editIndex) => edit.level !== level ? null : (
          <li key={edit.id} className={ui.selectedEdit === edit.id ? 'sel' : ''} onMouseEnter={() => ui.set({ selectedEdit: edit.id })} onMouseLeave={() => ui.set({ selectedEdit: null })}>
            <span>{editIndex + 1}. {editLabel(staticData, edit)}</span>
            <button className="x" onClick={() => removeEdit(edit.id)} aria-label="Delete area">×</button>
          </li>
        ))}
      </ul>

      <h3>Sources</h3>
      <ul className="list src">{Object.entries(meta.sources).map(([name, source]) => <li key={name}><b>{name}</b>: {source}</li>)}</ul>
      <p className="note">Students per home come from 2020 census ages, scaled so each school's current area matches its projected K–12 grade enrollment (the district's utilization × capacity; Spanish immersion is counted at Arbor Creek, not in neighborhoods). A home keeps its original school's projection wherever you assign it. Homes built after 2020 are estimated from building footprints. Boundaries are shown as of full implementation; Fairview and Ridgeview close in 2028-29 in the district's plan.</p>
    </section>
  );
}
