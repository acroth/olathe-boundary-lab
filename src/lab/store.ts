import { create } from 'zustand';
import { temporal } from 'zundo';
import type { Edit, Level, Preset } from './data';

export interface Plan { preset: string; closures: Record<string, number>; edits: Edit[]; name?: string }
export type Tool = 'trace' | 'areas' | 'polygon' | 'freehand' | 'blocks' | 'edit' | 'erase' | 'pan';
export type PickBy = 'planning' | 'zones';

interface PlanState { plan: Plan; setPlan: (p: Plan) => void; addEdit: (e: Edit) => void; updateEdit: (id: string, e: Partial<Edit>) => void;
  removeEdit: (id: string) => void; toggleClosure: (s: number, year: number) => void }

export const usePlan = create<PlanState>()(temporal((set) => ({
  plan: { preset: 'current', closures: {}, edits: [] },
  setPlan: (plan) => set({ plan }),
  addEdit: (e) => set(s => ({ plan: { ...s.plan, edits: [...s.plan.edits, e] } })),
  updateEdit: (id, e) => set(s => ({ plan: { ...s.plan, edits: s.plan.edits.map(x => x.id === id ? { ...x, ...e, rev: (x.rev ?? 0) + 1 } : x) } })),
  removeEdit: (id) => set(s => ({ plan: { ...s.plan, edits: s.plan.edits.filter(x => x.id !== id) } })),
  toggleClosure: (sc, year) => set(s => {
    const c = { ...s.plan.closures };
    if (c[String(sc)] !== undefined) delete c[String(sc)]; else c[String(sc)] = year;
    return { plan: { ...s.plan, closures: c } };
  }),
}), { limit: 100, partialize: (s) => ({ plan: s.plan }) }));

interface UIState {
  level: Level; brush: number; tool: Tool; year: number; colorBy: 'school' | 'util'; showHomes: boolean; showStreets: boolean; showAreas: boolean;
  sheet: 'peek' | 'half' | 'full'; panelOpen: boolean; pickBy: PickBy;
  mode: 'draw' | 'build'; build: { sel: number[]; moves: Record<string, boolean> | null };
  includePreK: boolean; snap: boolean; overlays: Level[]; areas: string[]; doneTick: number; selectedEdit: string | null; focusSchool: number | null; compare: Plan | null; diff: boolean; toast: string | null;
  set: (p: Partial<UIState>) => void;
}
export const useUI = create<UIState>()((set) => ({
  level: 'es', brush: -2, tool: 'pan', year: 2, colorBy: 'school', showHomes: false, showStreets: true, showAreas: true,
  sheet: 'half', panelOpen: true, pickBy: 'planning',
  mode: 'build', build: { sel: [1, 1, 1, 1, 1], moves: null },
  includePreK: true, snap: false, overlays: [], areas: ['South', 'East'], doneTick: 0, selectedEdit: null, focusSchool: null, compare: null, diff: false, toast: null,
  set: (p) => set(p),
}));

export function planFromPreset(p: Preset): Plan {
  return { preset: p.id, closures: { ...p.closures }, edits: p.edits.map(e => ({ ...e })) };
}
let n = 0;
export const newId = () => `u${Date.now().toString(36)}${(n++).toString(36)}`;

/** Plans saved in this browser (name + encoded plan). */
export interface SavedPlan { name: string; enc: string }
const readSaved = (): SavedPlan[] => { try { return JSON.parse(localStorage.getItem('saved-plans') || '[]'); } catch { return []; } };
export const useSaved = create<{ saved: SavedPlan[]; save: (p: SavedPlan) => void }>()((set, get) => ({
  saved: typeof window === 'undefined' ? [] : readSaved(),
  save: (p) => { const next = [...get().saved.filter(s => s.name !== p.name), p]; set({ saved: next }); try { localStorage.setItem('saved-plans', JSON.stringify(next)); } catch { /* private mode */ } },
}));
