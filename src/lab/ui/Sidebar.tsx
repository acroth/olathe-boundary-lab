// The side panel: the Concept Builder, or Free draw's plan summary and details.
import { useState, type MutableRefObject } from 'react';
import type { MapRef } from 'react-map-gl/maplibre';
import type { Results } from '../App';
import { areaGeom, type Static } from '../data';
import { headlineSummary, type SchoolNumber } from '../numbers';
import { usePlan, useUI } from '../store';
import { decodePlan } from '../url';
import Builder from './Builder';
import Fold from './Fold';
import ChecksSection from './freeDraw/ChecksSection';
import CompareSection from './freeDraw/CompareSection';
import DistrictSection from './freeDraw/DistrictSection';
import GradesSection from './freeDraw/GradesSection';
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
}

export default function Sidebar({ staticData, planResults, compareResults, mapRef, faceGeometry, visibleSchools, numbers }: SidebarProps) {
  const plan = usePlan(state => state.plan);
  const ui = useUI();
  const [compareLink, setCompareLink] = useState('');

  const level = ui.level, inFreeDraw = ui.mode === 'draw';
  const result = planResults?.levels[level];
  const schools = staticData.schools
    .filter(school => school.level === level && visibleSchools.has(school.i))
    .sort((first, second) => first.name.localeCompare(second.name));
  const focusedSchool = ui.focusSchool !== null && staticData.schools[ui.focusSchool]?.level === level ? ui.focusSchool : null;
  const showSchoolList = inFreeDraw || level === 'hs';
  const { sourceLabel } = headlineSummary(staticData, numbers, visibleSchools);

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
  const editByHand = () => ui.set({ mode: 'draw', toast: 'This plan is ready to edit. Use the tools on the map.' });

  return (
    <>
      {!inFreeDraw && (
        <Builder staticData={staticData} plan={plan} level={level} elementaryResult={planResults?.levels.es ?? null} middleSchoolResult={planResults?.levels.ms ?? null}
          numbers={numbers} visibleSchools={visibleSchools} onSchoolSelect={zoomToSchool} build={ui.build} onBuildChange={build => ui.set({ build })}
          middleSchoolLinesOn={ui.overlay === 'ms'} onMiddleSchoolLinesChange={setMiddleSchoolLines} onEditByHand={editByHand} />
      )}

      {inFreeDraw && <PlanSummary staticData={staticData} plan={plan} level={level} result={result} numbers={numbers} visibleSchools={visibleSchools} decodeSavedPlan={decodeSavedPlan} />}

      {showSchoolList && result && (
        <section className="panel-section">
          <h3 className="panel-heading">How full each school would be</h3>
          <p className="section-note">{sourceLabel} The district's goal is {staticData.meta.target * 100}% full or less.</p>
          <SchoolList staticData={staticData} numbers={numbers} schools={schools.map(school => school.i)} result={result}
            compareResult={compareResults?.levels[level]} focusedSchool={focusedSchool} onSchoolSelect={zoomToSchool} />
        </section>
      )}

      {inFreeDraw && result && (
        <section className="panel-section folds">
          {level === 'es' && <Fold title="District numbers"><DistrictSection staticData={staticData} result={result} plan={plan} year={ui.year} /></Fold>}
          <Fold title="Grade by grade"><GradesSection staticData={staticData} result={result} focusedSchool={focusedSchool} onSchoolSelect={zoomToSchool} schools={schools} year={ui.year} /></Fold>
          <Fold title="Plan checks"><ChecksSection staticData={staticData} plan={plan} result={result} feeder={planResults!.feeder} schools={schools} visibleSchools={visibleSchools} onSchoolSelect={zoomToSchool} /></Fold>
          <Fold title="Compare and export">
            <CompareSection staticData={staticData} plan={plan} level={level} planResults={planResults} mapRef={mapRef}
              compareLink={compareLink} onCompareLinkChange={setCompareLink} decodeSavedPlan={decodeSavedPlan} />
          </Fold>
        </section>
      )}

      <p className="indep">Independent project, not affiliated with Olathe Public Schools. <a href="/about">About the data</a> · <a href="/contact">Send feedback</a></p>
    </>
  );
}
