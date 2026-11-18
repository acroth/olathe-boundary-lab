// The app's address: what a shared link opens, and keeping the address up to date as the plan changes.
import { areaGeom, facesGeometry, type Level, type Static } from './data';
import { planFromPreset, usePlan, useUI, type Build, type Plan } from './store';
import { decodePlan, encodePlan } from './url';

/** build=1.1.1.1.1 picks concepts; build=1.1.1.1.1~630,PR-BE also lists the moves that are on. */
function readBuildChoice(staticData: Static, hash: URLSearchParams): Build | null {
  const buildParameter = hash.get('build'), combos = staticData.combos;
  if (!buildParameter || !combos) return null;

  const [conceptList, moveList] = buildParameter.split('~');
  const sel = conceptList.split('.').map(Number);
  if (sel.length !== combos.schools.length || !sel.every(concept => concept > 0)) return null;

  const movesOn = moveList?.split(',') ?? [];
  const moves = moveList !== undefined ? Object.fromEntries(combos.moves.map(move => [move.id, movesOn.includes(move.id)])) : null;
  const middleSchoolParameter = hash.get('ms');
  const ms = middleSchoolParameter !== null && /^\d$/.test(middleSchoolParameter) ? Number(middleSchoolParameter) : 1;
  return { sel, moves, ms };
}

/** Opens whatever the page's address describes. */
export function applyLinkedState(staticData: Static) {
  const hash = new URLSearchParams(location.hash.slice(1));
  const ui = useUI.getState();
  const decode = (encoded: string) => decodePlan(encoded, staticData.presets, faces => facesGeometry(staticData, faces), reference => areaGeom(staticData, reference));

  const encodedPlan = hash.get('plan');
  const linkedPlan = encodedPlan ? decode(encodedPlan) : null;

  const build = readBuildChoice(staticData, hash);
  if (build) ui.set({ mode: 'build', tool: 'pan', build });

  const level = hash.get('level');
  if (level === 'ms' || level === 'hs') ui.set({ level });

  const isFreeDrawLink = linkedPlan && !hash.get('build');
  if (isFreeDrawLink || hash.get('mode') === 'draw') ui.set({ mode: 'draw' });

  usePlan.getState().setPlan(linkedPlan ?? planFromPreset(staticData.presets.find(preset => preset.id === 'district')!));
  usePlan.temporal.getState().clear();

  const encodedCompare = hash.get('compare');
  const comparePlan = encodedCompare ? decode(encodedCompare) : null;
  if (comparePlan) ui.set({ compare: comparePlan });
}

function buildParameter(build: Build): string {
  const concepts = build.sel.join('.');
  if (!build.moves) return concepts;
  const movesOn = Object.keys(build.moves).filter(move => build.moves![move]);
  return `${concepts}~${movesOn.join(',')}`;
}

/** Writes the current view to the page's address. */
export function writeLinkedState(staticData: Static, plan: Plan, level: Level, comparePlan: Plan | null) {
  const { mode, build } = useUI.getState();
  const hash = new URLSearchParams();
  if (mode === 'build') {
    hash.set('build', buildParameter(build));
    if (build.ms !== 1) hash.set('ms', String(build.ms));
  } else {
    hash.set('plan', encodePlan(plan, staticData.presets));
  }
  if (level !== 'es') hash.set('level', level);
  if (comparePlan) hash.set('compare', encodePlan(comparePlan, staticData.presets));
  try { history.replaceState(null, '', '#' + hash.toString()); } catch { /* sandboxed */ }
}
