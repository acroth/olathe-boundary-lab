import type { Metadata } from 'next';
import Link from 'next/link';
import katex from 'katex';
import 'katex/dist/katex.min.css';
import { SquareFunction, TriangleAlert } from 'lucide-react';
import Shell, { NoticeBanner } from '../_site/Shell';
import OnThisPage, { type TocItem } from './OnThisPage';

export const metadata: Metadata = {
  title: 'About & data · Olathe Boundary Lab',
  description: 'How the Olathe Boundary Lab works, how its numbers are calculated, and the district and public data it uses. Independent project, not affiliated with Olathe Public Schools.',
};

const D = <span className="stag district">District</span>;
const P = <span className="stag public">Public</span>;

/** The page's sections; the headings below and the "On this page" nav both come from this list. */
const SECTIONS: TocItem[] = [
  { id: 'overview', title: 'Overview', children: [
    { id: 'concept-builder', title: 'Concept builder' },
    { id: 'free-draw', title: 'Free draw' },
    { id: 'sharing', title: 'Sharing and exports' },
  ] },
  { id: 'numbers', title: 'Reading the numbers', children: [
    { id: 'district-figures', title: 'District figures' },
    { id: 'model-estimates', title: 'Model estimates' },
    { id: 'figure-notes', title: 'Notes on district figures' },
    { id: 'capacity', title: 'Max functional capacity' },
  ] },
  { id: 'methodology', title: 'Methodology', children: [
    { id: 'formulas', title: 'Formulas' },
    { id: 'accuracy', title: 'Accuracy' },
    { id: 'starting-counts', title: 'Starting counts' },
  ] },
  { id: 'sources', title: 'Data sources' },
  { id: 'limitations', title: 'Limitations' },
];

const titles = new Map(SECTIONS.flatMap(section => [section, ...(section.children ?? [])]).map(item => [item.id, item.title]));
const H2 = ({ id }: { id: string }) => <h2 id={id}>{titles.get(id)}</h2>;
const H3 = ({ id }: { id: string }) => <h3 id={id}>{titles.get(id)}</h3>;

/** One numbered formula, typeset from LaTeX when the page is built, and what it means. */
function Formula({ number, tex, note }: { number: number; tex: string; note: React.ReactNode }) {
  const html = katex.renderToString(tex, { displayMode: true, throwOnError: true, output: 'htmlAndMathml' });
  return (
    <div className="formula-row">
      <div className="formula"><span className="formula-number">{number}.</span><div className="formula-math" dangerouslySetInnerHTML={{ __html: html }} /></div>
      <p className="formula-note">{note}</p>
    </div>
  );
}

export default function About() {
  return (
    <Shell active="about" banner={<NoticeBanner />} mainClassName="docs">
      <OnThisPage items={SECTIONS} />
      <article className="docs-content">
        <h1>About the Boundary Lab</h1>
        <p className="lede">A tool for viewing, comparing and editing the elementary and middle school boundary concepts proposed in Olathe
          USD 233&rsquo;s facility alignment.</p>

        <H2 id="overview" />
        <p>The district plans to close Black Bob, Heritage, Scarborough, Tomahawk and Walnut Grove elementary schools and Indian Trail Middle
          School, and has published several concepts for redrawing the affected boundaries. The lab places those concepts on one map and
          shows how full each school would be under each of them.</p>
        <H3 id="concept-builder" />
        <p>View any of the district&rsquo;s concepts, or combine them school by school to see how a mix would play out.</p>
        <H3 id="free-draw" />
        <p>Start from current boundaries or a district concept, then reassign planning areas or trace new lines along streets. School
          capacity updates as you draw.</p>
        <H3 id="sharing" />
        <p>Every view has a link that reproduces it exactly. Plans can also be saved in the browser or exported as boundaries (GeoJSON),
          numbers (CSV) or a map image.</p>

        <H2 id="numbers" />
        <H3 id="district-figures" />
        <p>District figures always come first. When a plan matches one the district published, the lab shows the district&rsquo;s projections
          for 2026&ndash;27 through 2031&ndash;32.</p>
        <H3 id="model-estimates" />
        <p>Custom mixes, hand-drawn plans and years after 2031&ndash;32 use the lab&rsquo;s model. These numbers are marked
          with <SquareFunction className="about-icon" aria-label="function icon" /> beside the number.</p>
        <H3 id="figure-notes" />
        <p><TriangleAlert className="about-icon warn" aria-label="warning icon" /> marks a school with a note about its district figure, such
          as a parent-meeting slide that shows a different total, or a figure that appears to be an error.</p>
        <H3 id="capacity" />
        <p>Capacity is the district&rsquo;s published max functional capacity for every school in the concepts. Capacities for other schools
          are estimated (formula 6).</p>

        <H2 id="methodology" />
        <p>The model estimates students home by home, then totals them by school.</p>
        <H3 id="formulas" />
        <div className="formulas">
          <Formula number={1} tex={String.raw`w(h) = \text{expected children at home } h`}
            note={<>From the home&rsquo;s census block: its housing units and the ages of the children living there.</>} />
          <Formula number={2} tex={String.raw`f(o,t) = \frac{E(o,t)}{\sum_{h \in o} w(h)} \cdot a(o) \cdot b(o,t)`}
            note={<>Students per child for school <var>o</var> in year <var>t</var>: its projected enrollment <var>E</var> spread over the
              children living in its area today, then scaled by <var>a</var> to match fall 2026 enrollment and by <var>b</var> to follow
              the district&rsquo;s five-year tables.</>} />
          <Formula number={3} tex={String.raw`N(s,t) = \sum_{h \to s} w(h)\, f\big(o(h),\, t\big) + F(s)`}
            note={<>A school&rsquo;s students: every home now assigned to it, each keeping its <i>original</i> school&rsquo;s rate, plus
              students placed in the building (<var>F</var>: Pre-K, and 118 Spanish immersion students at Arbor Creek).</>} />
          <Formula number={4} tex={String.raw`U(s,t) = \frac{N(s,t)}{C(s)}`}
            note={<>Utilization: students over max functional capacity <var>C</var>. The district&rsquo;s goal is 85% or less.</>} />
          <Formula number={5} tex={String.raw`\min_{b} \; \sum_{c,\,s} \big(N(c,s) - D(c,s)\big)^2 \;+\; \lambda \sum_{o} \Big(S(o)\,\big(b(o) - 1\big)\Big)^2`}
            note={<>Trend tuning: for each year through 2031&ndash;32, the <var>b</var> values that best match the district&rsquo;s
              figures <var>D</var> across all of its concepts <var>c</var>. The second term keeps each <var>b</var> near 1 (&lambda; = 0.05;{' '}
              <var>S</var> = the school&rsquo;s own students). After 2031&ndash;32, each <var>b</var> holds its 2031&ndash;32 value.</>} />
          <Formula number={6} tex={String.raw`C(s) = \frac{\text{enrollment}(s,\ \text{2025–26})}{U(s,\ \text{2025–26})}`}
            note={<>Capacity for schools without a published figure: 2025&ndash;26 enrollment divided by the utilization the July 2026
              forecast reports for that year. Example: 452 &divide; 0.75 &asymp; 603.</>} />
        </div>
        <H3 id="accuracy" />
        <p>Across the district&rsquo;s published plans for 2027&ndash;28 to 2031&ndash;32, the model averages 1.7 percentage points from the
          district&rsquo;s figures for elementary schools and 1.1 for middle schools, and is within 5 points 94% and 98% of the time.</p>
        <p>One district figure is excluded from the tuning: Frontier Trail&rsquo;s 933 students in middle school concept 4, which appears to
          count areas 620, 630 and 650 at both Frontier Trail and California Trail. The district&rsquo;s figure is still shown, with a note.</p>
        <H3 id="starting-counts" />
        <p>Each closing school starts from the number of students the district moves: Black Bob about 229, Heritage 233, Scarborough 237,
          Tomahawk 322, Walnut Grove 367 and Indian Trail 570. Distances are measured along streets and compared with the 2.5-mile busing
          threshold.</p>

        <H2 id="sources" />
        <div className="src-wrap">
          <table className="src">
            <thead><tr><th>Source</th><th>Type</th><th>Used for</th></tr></thead>
            <tbody>
              <tr><td>Boundary presentations and parent-meeting decks, Nov 2026</td><td>{D}</td>
                <td>Capacities, fall 2026 enrollment, five-year tables, students moving, concept maps</td></tr>
              <tr><td>District 2026 planning-area map</td><td>{D}</td><td>Planning areas (610, 750 and so on)</td></tr>
              <tr><td>Demographic Analytics Advisors forecast, July 2026</td><td>{D}</td><td>Enrollment trends (<var>E</var>), and years after 2031&ndash;32</td></tr>
              <tr><td><a href="https://www.ksde.gov" rel="noopener">Kansas State Department of Education</a>, 2025&ndash;26 headcounts</td><td>{P}</td><td>Enrollment and grade mix</td></tr>
              <tr><td><a href="https://nces.ed.gov/ccd/" rel="noopener">NCES Common Core of Data</a>, 2024&ndash;25</td><td>{P}</td><td>Pre-K counts</td></tr>
              <tr><td><a href="https://aims.jocogov.org" rel="noopener">Johnson County AIMS</a></td><td>{P}</td><td>Current attendance areas and the district boundary</td></tr>
              <tr><td><a href="https://data.census.gov" rel="noopener">U.S. Census</a>, 2020 blocks (2010 for back-testing)</td><td>{P}</td><td>Housing units and children by age (<var>w</var>)</td></tr>
              <tr><td><a href="https://overturemaps.org" rel="noopener">Overture Maps</a> and <a href="https://protomaps.com" rel="noopener">Protomaps</a></td><td>{P}</td><td>Buildings, streets and the base map</td></tr>
            </tbody>
          </table>
        </div>
        <p className="note">Map data &copy; <a href="https://www.openstreetmap.org/copyright" rel="noopener">OpenStreetMap contributors</a>, under the Open Database License.</p>

        <H2 id="limitations" />
        <ul>
          <li><b>Boundary lines are approximate.</b> The district published its concepts as images, so the lines were traced onto streets.</li>
          <li><b>Model numbers are estimates</b> based on census patterns, and are least reliable for small areas and new neighborhoods.</li>
          <li><b>Nothing here is a decision.</b> Only the Board of Education sets boundaries.</li>
        </ul>
        <p>Found an error? <Link href="/contact">Send a correction</Link>.</p>
        <p className="note">Built with Next.js and MapLibre and hosted on Vercel. Plans are calculated in your browser and are sent nowhere
          unless you share them. No accounts, ads or tracking cookies.</p>
      </article>
    </Shell>
  );
}
