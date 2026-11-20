// The side panel: the Concept Builder, or Free draw's plan summary and details. Phones show one part at a time in a drawer.
import type { MutableRefObject } from 'react';
import type { MapRef } from 'react-map-gl/maplibre';
import type { Results } from '../App';
import { areaGeom, type Static } from '../data';
import { headlineSummary, type SchoolNumber } from '../numbers';
import { usePlan, useUI } from '../store';
import { decodePlan } from '../url';
import Builder from './Builder';
import PlanSummary from './freeDraw/PlanSummary';
import { SchoolList } from './SchoolNumbers';

interface SidebarProps {
  staticData: Static;
  planResults: Results | null;
  compareResults: Results | null;
  mapRef: MutableRefObject<MapRef | null>;
  faceGeometry: (faceIds: number[]) => GeoJSON.MultiPolygon;
  visibleSchools: Set<number>;
  numbers: Map<number, SchoolNumber>;
  part?: SidebarPart;
}

/** 'all' on larger screens; on phones, the part each bottom tab opens. */
export type SidebarPart = 'all' | 'concepts' | 'schools' | 'draw';

export default function Sidebar({ staticData, planResults, compareResults, mapRef, faceGeometry, visibleSchools, numbers, part = 'all' }: SidebarProps) {
  const plan = usePlan(state => state.plan);
  const ui = useUI();

  const level = ui.level, inFreeDraw = ui.mode === 'draw';
  const result = planResults?.levels[level];
  const schools = staticData.schools
    .filter(school => school.level === level && visibleSchools.has(school.i))
    .sort((first, second) => first.name.localeCompare(second.name));
  const focusedSchool = ui.focusSchool !== null && staticData.schools[ui.focusSchool]?.level === level ? ui.focusSchool : null;
  const builderShowsSchools = !inFreeDraw && level !== 'hs';
  const showSchoolList = (part === 'all' && (inFreeDraw || level === 'hs')) || (part === 'schools' && !builderShowsSchools);
  const showBuilder = (part === 'all' && !inFreeDraw) || part === 'concepts' || (part === 'schools' && builderShowsSchools);
  const showDrawing = inFreeDraw && (part === 'all' || part === 'draw');
  const { sourceLabel } = headlineSummary(staticData, numbers, visibleSchools);

  const decodeSavedPlan = (encoded: string) => decodePlan(encoded, staticData.presets, faceGeometry, reference => areaGeom(staticData, reference));
  const zoomToSchool = (schoolIndex: number) => {
    const school = staticData.schools[schoolIndex];
    ui.set({ focusSchool: schoolIndex });
    mapRef.current?.flyTo({ center: [school.lon, school.lat], zoom: 13.2, duration: 600 });
  };
  const editByHand = () => ui.set({ mode: 'draw', drawer: 'draw', sheet: 'peek', toast: 'This plan is ready to edit. Use the tools on the map.' });

  return (
    <>
      {showBuilder && (
        <Builder part={part === 'all' ? 'all' : part === 'schools' ? 'schools' : 'concepts'} staticData={staticData} plan={plan} level={level} elementaryResult={planResults?.levels.es ?? null} middleSchoolResult={planResults?.levels.ms ?? null}
          numbers={numbers} visibleSchools={visibleSchools} onSchoolSelect={zoomToSchool} build={ui.build} onBuildChange={build => ui.set({ build })}
          onEditByHand={editByHand} />
      )}

      {showDrawing && <PlanSummary staticData={staticData} plan={plan} level={level} result={result} numbers={numbers} visibleSchools={visibleSchools} decodeSavedPlan={decodeSavedPlan} />}

      {showSchoolList && result && (
        <section className="panel-section">
          <h3 className="panel-heading">Projected Functional Capacity</h3>
          <p className="section-note">{sourceLabel} The district's goal is {staticData.meta.target * 100}% full or less.</p>
          <SchoolList staticData={staticData} numbers={numbers} schools={schools.map(school => school.i)} result={result}
            compareResult={compareResults?.levels[level]} focusedSchool={focusedSchool} onSchoolSelect={zoomToSchool} />
        </section>
      )}


      {part === 'all' && <p className="indep">Independent project, not affiliated with Olathe Public Schools. <a href="/about">About the data</a> · <a href="/contact">Send feedback</a></p>}
    </>
  );
}
