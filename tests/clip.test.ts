// Polygon operations (src/lab/model/clip.ts) keep areas consistent.
import { expect, it } from 'vitest';
import { boolOp } from '../src/lab/model/clip';
import { polyAcres, toMPoly, type MPoly } from '../src/lab/model/geo';
import { readJson } from './support/loadStatic';

const acres = (shape: MPoly) => shape.reduce((sum, polygon) => sum + polyAcres(polygon), 0);

it('union, difference and intersection of attendance areas add up', () => {
  const zones = readJson('zones_es.geojson').features, district = toMPoly(readJson('district.geojson').features[0].geometry);
  const first = toMPoly(zones[0].geometry), second = toMPoly(zones[1].geometry);
  expect(acres(boolOp('intersection', first, district))).toBeCloseTo(acres(first), -1);              // areas lie inside the district
  expect(acres(boolOp('union', first, second))).toBeCloseTo(acres(first) + acres(second), -1);       // areas don't overlap
  expect(acres(boolOp('difference', district, first))).toBeCloseTo(acres(district) - acres(first), -1);
});
