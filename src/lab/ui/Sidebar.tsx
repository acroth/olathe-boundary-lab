// The side panel: the Concept Builder, or Free draw's plan summary and detail sections.
import { useState, type MutableRefObject } from 'react';
import type { MapRef } from 'react-map-gl/maplibre';
import type { Results } from '../App';
import { areaGeom, type Static } from '../data';
import type { SchoolNumber } from '../numbers';
import { usePlan, useUI } from '../store';
import { decodePlan } from '../url';
import Builder from './Builder';
import ChecksSection from './freeDraw/ChecksSection';
import CompareSection from './freeDraw/CompareSection';
import DistrictSection from './freeDraw/DistrictSection';
import GradesSection from './freeDraw/GradesSection';
import PlanSummary, { type FreeDrawSection } from './freeDraw/PlanSummary';
import { SchoolNumbersTable } from './SchoolNumbers';

interface SidebarProps {
  staticData: Static;
  planResults: Results | null;
  compareResults: Results | null;
  mapRef: MutableRefObject<MapRef | null>;
  faceGeometry: (faceIds: number[]) => GeoJSON.MultiPolygon;
  visibleSchools: Set<number>;
  numbers: Map<number, SchoolNumber>;
}

export default function Sidebar({ staticData, planResults, compareResults, mapRef, faceGeometry, visibleSchools, numbers }: SidebarProps) {
  const plan = usePlan(state => state.plan);
  const ui = useUI();
  const [section, setSection] = useState<FreeDrawSection>('schools');
  const [compareLink, setCompareLink] = useState('');

  const level = ui.level, inFreeDraw = ui.mode === 'draw';
  const result = planResults?.levels[level];
  const schools = staticData.schools
    .filter(school => school.level === level && visibleSchools.has(school.i))
    .sort((first, second) => first.name.localeCompare(second.name));
  const focusedSchool = ui.focusSchool !== null && staticData.schools[ui.focusSchool]?.level === level ? ui.focusSchool : null;
  const showSchoolsTable = inFreeDraw ? section === 'schools' : level === 'hs';

  const decodeSavedPlan = (encoded: string) => decodePlan(encoded, staticData.presets, faceGeometry, reference => areaGeom(staticData, reference));
  const zoomToSchool = (schoolIndex: number) => {
    const school = staticData.schools[schoolIndex];
    ui.set({ focusSchool: schoolIndex });
    mapRef.current?.flyTo({ center: [school.lon, school.lat], zoom: 13.2, duration: 600 });
  };
  const setMiddleSchoolLines = (on: boolean) => {
    if (on) ui.set({ overlay: 'ms' });
    else if (ui.overlay === 'ms') ui.set({ overlay: null });
  };
  const editByHand = () => ui.set({ mode: 'draw', toast: 'This combination is now your free-draw plan. Edit it with the tools on the map.' });

  return (
    <>
      {!inFreeDraw && (
        <Builder staticData={staticData} plan={plan} level={level} elementaryResult={planResults?.levels.es ?? null} middleSchoolResult={planResults?.levels.ms ?? null}
          numbers={numbers} visibleSchools={visibleSchools} onSchoolSelect={zoomToSchool} build={ui.build} onBuildChange={build => ui.set({ build })}
          middleSchoolLinesOn={ui.overlay === 'ms'} onMiddleSchoolLinesChange={setMiddleSchoolLines} onEditByHand={editByHand} />
      )}

      {inFreeDraw && (
        <PlanSummary staticData={staticData} plan={plan} level={level} result={result} numbers={numbers} visibleSchools={visibleSchools}
          section={section} onSectionChange={setSection} decodeSavedPlan={decodeSavedPlan} />
      )}

      {showSchoolsTable && result && (
        <section>
          <SchoolNumbersTable staticData={staticData} numbers={numbers} schools={schools.map(school => school.i)} result={result}
            compareResult={compareResults?.levels[level]} focusedSchool={focusedSchool} onSchoolSelect={zoomToSchool} />
          <p className="note">Tap a row to zoom to the school.</p>
        </section>
      )}

      {inFreeDraw && section === 'district' && result && level === 'es' && <DistrictSection staticData={staticData} result={result} plan={plan} year={ui.year} />}
      {inFreeDraw && section === 'district' && level !== 'es' && <section><p className="note">District numbers are loaded for elementary schools only.</p></section>}
      {inFreeDraw && section === 'grades' && result && <GradesSection staticData={staticData} result={result} focusedSchool={focusedSchool} onSchoolSelect={zoomToSchool} schools={schools} year={ui.year} />}
      {inFreeDraw && section === 'checks' && result && (
        <ChecksSection staticData={staticData} plan={plan} result={result} feeder={planResults!.feeder} schools={schools} visibleSchools={visibleSchools} onSchoolSelect={zoomToSchool} />
      )}
      {inFreeDraw && section === 'plan' && (
        <CompareSection staticData={staticData} plan={plan} level={level} planResults={planResults} mapRef={mapRef}
          compareLink={compareLink} onCompareLinkChange={setCompareLink} decodeSavedPlan={decodeSavedPlan} />
      )}

      <p className="indep">Independent project, not affiliated with Olathe Public Schools. Mixes district figures with modeled estimates. <a href="/about">About &amp; data</a> · <a href="/contact">Feedback</a></p>
    </>
  );
}
