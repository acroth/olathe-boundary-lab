// Connects the map's drawing tools to the plan and UI stores.
import { useMemo, type MutableRefObject } from 'react';
import type { DrawCallbacks } from '../map/drawing';
import type { Edit } from '../data';
import { newId, usePlan, useUI } from '../store';
import type { Results } from './useModelResults';

const NO_ZONES: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };

export function useDrawCallbacks(faceGeometry: (faceIds: number[]) => GeoJSON.MultiPolygon, latestResults: MutableRefObject<Results | null>): DrawCallbacks {
  return useMemo(() => ({
    getBrush: () => useUI.getState().brush,
    getLevel: () => useUI.getState().level,
    getEdits: () => usePlan.getState().plan.edits,
    addEdit: edit => usePlan.getState().addEdit({ ...edit, id: newId() } as Edit),
    extendBlocks: faces => {
      const { brush, level } = useUI.getState();
      const planState = usePlan.getState();
      const lastEdit = planState.plan.edits[planState.plan.edits.length - 1];
      const extendsLastEdit = lastEdit && lastEdit.kind === 'blocks' && lastEdit.school === brush && lastEdit.level === level;
      if (extendsLastEdit) {
        const allFaces = [...new Set([...(lastEdit.faces ?? []), ...faces])];
        planState.updateEdit(lastEdit.id, { faces: allFaces, geom: faceGeometry(allFaces) });
      } else {
        planState.addEdit({ id: newId(), level, school: brush, kind: 'blocks', faces, geom: faceGeometry(faces) });
      }
    },
    removeEdit: id => usePlan.getState().removeEdit(id),
    updateGeom: (id, geometry) => usePlan.getState().updateEdit(id, { geom: geometry, faces: undefined }),
    toast: message => useUI.getState().set({ toast: message }),
    selectEdit: id => useUI.getState().set({ selectedEdit: id }),
    getSnap: () => useUI.getState().snap,
    getZones: () => latestResults.current?.levels[useUI.getState().level]?.zones ?? NO_ZONES,
    getPickBy: () => useUI.getState().pickBy,
  }), [faceGeometry]);
}
