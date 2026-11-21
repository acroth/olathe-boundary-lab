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
  { id: 'using-free-draw', title: 'Using Free draw', children: [
    { id: 'guide-pick-areas', title: 'Pick areas' },
    { id: 'guide-trace', title: 'Trace' },
    { id: 'guide-follow-streets', title: 'Follow streets' },
    { id: 'guide-remove', title: 'Remove' },
  ] },
  { id: 'numbers', title: 'Reading the numbers', children: [
    { id: 'district-figures', title: 'District figures' },
    { id: 'model-estimates', title: 'Model estimates' },
    { id: 'figure-notes', title: 'Notes on district figures' },
    { id: 'capacity', title: 'Max functional capacity' },
  ] },
  { id: 'methodology', title: 'Methodology', children: [
    { id: 'accuracy', title: 'Accuracy' },
    { id: 'formulas', title: 'Formulas' },
    { id: 'starting-counts', title: 'Starting counts' },
    { id: 'grades', title: 'Grades and class sections' },
  ] },
  { id: 'sources', title: 'Data sources' },
  { id: 'limitations', title: 'Limitations' },
];

const titles = new Map(SECTIONS.flatMap(section => [section, ...(section.children ?? [])]).map(item => [item.id, item.title]));
const H2 = ({ id }: { id: string }) => <h2 id={id}>{titles.get(id)}</h2>;
const H3 = ({ id }: { id: string }) => <h3 id={id}>{titles.get(id)}</h3>;

/** A Free draw screenshot (scripts/draw-guide.mjs): the phone capture on narrow screens, the desktop one otherwise. */
function GuideShot({ name, alt }: { name: string; alt: string }) {
  return (
    <picture>
      <source media="(max-width: 700px)" srcSet={`/guide/phone-${name}.webp`} />
      <img className="guide-shot" src={`/guide/desktop-${name}.webp`} alt={alt} loading="lazy" />
    </picture>
  );
}

const typeset = (tex: string) => katex.renderToString(tex, { displayMode: true, throwOnError: true, output: 'htmlAndMathml' });

/** One numbered formula, typeset from LaTeX when the page is built, and what it means. `narrow` is the same formula broken
 *  over several lines, shown on phones in place of a version too wide for the screen. */
function Formula({ number, tex, narrow, note }: { number: number; tex: string; narrow?: string; note: React.ReactNode }) {
  return (
    <div className="formula-row">
      <div className="formula">
        <span className="formula-number">{number}.</span>
        <div className={'formula-math' + (narrow ? ' wide-only' : '')} dangerouslySetInnerHTML={{ __html: typeset(tex) }} />
        {narrow && <div className="formula-math narrow-only" dangerouslySetInnerHTML={{ __html: typeset(narrow) }} />}
      </div>
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
        <p>View any of the district&rsquo;s concepts. Because the board votes on each closing school separately, you can also pick a concept
          for each closing school and see the combined result.</p>
        <H3 id="free-draw" />
        <p>Start from current boundaries or a district concept, then reassign planning areas or trace new lines along streets. School
          capacity updates as you draw.</p>
        <H3 id="sharing" />
        <p>Every view has a link that reproduces it exactly. Plans can also be saved in the browser or exported as boundaries (GeoJSON),
          numbers (CSV) or a map image.</p>

        <H2 id="using-free-draw" />
        <p>Free draw lets you redraw boundaries yourself. Open it from the rail on the left, or the Free Draw tab on a phone. These examples
          start from district concept 1 around Brougham.</p>
        <GuideShot name="start-from" alt="The Start from menu in the Free draw panel, set to District concept 1" />
        <p>Choose a starting point: current boundaries, with the closing schools&rsquo; areas left for you to assign, or one of the
          district&rsquo;s concepts.</p>
        <H3 id="guide-pick-areas" />
        <GuideShot name="pick-areas-1" alt="Selecting Green Springs, choosing Pick areas, and tapping planning area 850" />
        <ol className="guide-steps">
          <li>Select the school that should get the area.</li>
          <li>Choose <b>Pick areas</b>. You can pick numbered planning areas or whole school areas.</li>
          <li>Tap an area on the map.</li>
        </ol>
        <GuideShot name="pick-areas-2" alt="Planning area 850 now colored as part of Green Springs" />
        <p>The area takes the school&rsquo;s color, and every number updates.</p>
        <H3 id="guide-trace" />
        <GuideShot name="trace-1" alt="A traced line from one boundary line to another, ready for Done" />
        <ol className="guide-steps">
          <li>Choose <b>Trace</b> and tap on a boundary line. The point turns red when it&rsquo;s on a line.</li>
          <li>Tap your way across, and end on another boundary line. One line can cross several areas.</li>
          <li>Tap <b>Done</b>.</li>
        </ol>
        <GuideShot name="trace-2" alt="The areas the line crossed, split into highlighted pieces" />
        <p>The areas the line crossed are split into highlighted pieces. Tap each piece that should go to the selected school, then tap
          Done.</p>
        <H3 id="guide-follow-streets" />
        <GuideShot name="follow-streets" alt="The Follow streets switch turned on, with a blue ring on a street intersection" />
        <p>Lines go straight between taps. Turn on <b>Follow streets</b> to snap each tap to the nearest intersection and route the line
          along the roads. A blue ring shows where your tap will land.</p>
        <H3 id="guide-remove" />
        <GuideShot name="remove" alt="Choosing Remove and tapping an area that was changed" />
        <p>Choose <b>Remove</b> and tap an area you changed to undo just that change. Undo and redo step back and forward through every
          change.</p>

        <H2 id="numbers" />
        <H3 id="district-figures" />
        <p>District figures always come first. When a plan matches one the district published, the lab shows the district&rsquo;s projections
          for 2026&ndash;27 through 2031&ndash;32.</p>
        <H3 id="model-estimates" />
        <p>Custom combinations, hand-drawn plans and years after 2031&ndash;32 use the lab&rsquo;s model. These numbers are marked
          with <SquareFunction className="about-icon" aria-label="function icon" /> beside the number.</p>
        <H3 id="figure-notes" />
        <p><TriangleAlert className="about-icon warn" aria-label="warning icon" /> marks a school with a note about its district figure, such
          as a parent-meeting slide that shows a different total, or a figure that appears to be an error.</p>
        <H3 id="capacity" />
        <p>Capacity is the district&rsquo;s published max functional capacity for every school in the concepts. Capacities for other schools
          are estimated (formula 6).</p>

        <H2 id="methodology" />
        <p>The model estimates students home by home, then totals them by school.</p>
        <H3 id="accuracy" />
        <p>Across the district&rsquo;s published plans for 2027&ndash;28 to 2031&ndash;32, the model averages 1.7 percentage points from the
          district&rsquo;s figures for elementary schools and 1.1 for middle schools, and is within 5 points 94% and 98% of the time.</p>
        <p>One district figure is excluded from the tuning: Frontier Trail&rsquo;s 933 students in middle school concept 4, which appears to
          count areas 620, 630 and 650 at both Frontier Trail and California Trail. The district&rsquo;s figure is still shown, with a note.</p>
        <H3 id="formulas" />
        <p>How the model gets from census homes to each school&rsquo;s projected students, and how capacity is estimated where the district hasn&rsquo;t published it.</p>
        <details className="formula-details">
          <summary>Show the formulas</summary>
          <div className="formulas">
            <Formula number={1} tex={String.raw`w(h) = \beta\, w_{\text{same}}(h) + (1-\beta)\, w_{\text{aged}}(h)`}
              note={<>A relative weight for home <var>h</var>, blended from two views of its census block: children at the ages counted in
                2020, and those children aged forward. &beta; is 0.5 for elementary and 0.4 for middle and high schools. Each school&rsquo;s
                homes are scaled to sum to 100, and the five closing schools&rsquo; homes are reshaped to the district&rsquo;s student-dot
                maps. Only the ratios matter, since formula 2 divides by the sum.</>} />
            <Formula number={2} tex={String.raw`f(o,t) = a(o)\; b(o,t)\; \frac{E(o,t)}{\sum_{h:\,o(h)=o} w(h)}, \qquad a(o) = \frac{K(o,\ \text{2026})}{E(o,\ \text{2026})}`}
            narrow={String.raw`\begin{aligned} f(o,t) &= a(o)\; b(o,t)\; \frac{E(o,t)}{\sum_{h:\,o(h)=o} w(h)} \\ a(o) &= \frac{K(o,\ \text{2026})}{E(o,\ \text{2026})} \end{aligned}`}
              note={<>Students per unit of weight for school <var>o</var> in year <var>t</var>. <var>o</var>(<var>h</var>) is the school
                home <var>h</var> belongs to today. <var>E</var> is the projected number of students living in that school&rsquo;s area:
                the July 2026 forecast&rsquo;s utilization times capacity, with Black Bob&rsquo;s immersion students taken out.{' '}
                <var>a</var> matches the district&rsquo;s fall 2026 count <var>K</var>, and <var>b</var> follows the district&rsquo;s
                five-year tables (formula 5).</>} />
            <Formula number={3} tex={String.raw`N(s,t) = \sum_{h:\,\sigma(h)=s} w(h)\; f\big(o(h),\, t\big) + F(s)`}
              note={<>A school&rsquo;s students: every home the plan assigns to it (&sigma;(<var>h</var>) = <var>s</var>), each keeping its
                original school&rsquo;s rate, plus students placed in the building, <var>F</var>: Pre-K when it&rsquo;s counted, and 118
                Spanish immersion students at Arbor Creek.</>} />
            <Formula number={4} tex={String.raw`U(s,t) = \frac{N(s,t)}{C(s)}`}
              note={<>Utilization: students over max functional capacity <var>C</var>. The district&rsquo;s goal is 85% or less.</>} />
            <Formula number={5} tex={String.raw`b(\cdot,t) = \arg\min_{b} \sum_{(c,s) \notin Q} \big(N_c(s,t) - D_c(s,t)\big)^2 + \sum_{o} \lambda(o) \Big(S(o,t)\,\big(b(o,t) - 1\big)\Big)^2`}
            narrow={String.raw`\begin{aligned} & b(\cdot,t) = \arg\min_{b}\; L(b) \\ & L = \sum_{(c,s) \notin Q} \big(N_c(s,t) - D_c(s,t)\big)^2 \\ & \quad + \sum_{o} \lambda(o) \Big(S(o,t)\,\big(b(o,t) - 1\big)\Big)^2 \end{aligned}`}
              note={<>Trend tuning, a ridge regression run once for each year <var>t</var> from 2027&ndash;28 to 2031&ndash;32 (2026&ndash;27 is
                already matched to fall counts). It picks the <var>b</var> values that best match the district&rsquo;s figures <var>D</var>{' '}
                across its concepts <var>c</var>, leaving out figures that look like errors (<var>Q</var>: Frontier Trail&rsquo;s 933 in
                middle school concept 4). The second term keeps each <var>b</var> near 1: &lambda; is 0.05 for open schools and 0.5 for closing
                schools, whose counts are known, and <var>S</var> is the school&rsquo;s own students. Only schools in the district&rsquo;s
                tables and the closing schools get a <var>b</var>; every other school stays at 1. After 2031&ndash;32, each <var>b</var>{' '}
                holds its 2031&ndash;32 value.</>} />
            <Formula number={6} tex={String.raw`C(s) = \frac{K(s,\ \text{2025–26})}{u(s,\ \text{2025–26})}`}
              note={<>Capacity for schools without a published figure: 2025&ndash;26 enrollment <var>K</var> divided by <var>u</var>, the
                utilization the July 2026 forecast reports for that year, as a fraction. Example: 452 &divide; 0.75 &asymp; 603.</>} />
          </div>
        </details>
        <H3 id="starting-counts" />
        <p>Each closing school starts from the number of students the district moves: Black Bob about 229, Heritage 233, Scarborough 237,
          Tomahawk 322, Walnut Grove 367 and Indian Trail 570. Distances are measured along streets and compared with the 2.5-mile busing
          threshold.</p>
        <H3 id="grades" />
        <p>Each school&rsquo;s details split its students by grade for the year chosen at the top, and count the class sections an
          elementary school would need.</p>
        <details className="formula-details">
          <summary>Show the formulas</summary>
          <div className="formulas">
            <Formula number={7} tex={String.raw`G(s,t) = \begin{cases} D(s,t) - P(s) - I(s) & \text{district figure} \\ N(s,t) - F(s) & \text{otherwise} \end{cases}`}
            narrow={String.raw`\begin{aligned} &\text{District figure:} \\ &\quad G(s,t) = D(s,t) - P(s) - I(s) \\ &\text{Otherwise:} \\ &\quad G(s,t) = N(s,t) - F(s) \end{aligned}`}
              note={<>Students in K&ndash;5 classrooms. With the district&rsquo;s figure <var>D</var>, Pre-K (<var>P</var>) and Spanish immersion
                (<var>I</var>) always come out, since the district&rsquo;s totals include Early Childhood. With the model&rsquo;s total{' '}
                <var>N</var> (formula 3), <var>F</var> matches whether Pre-K is counted. The total is the hard stop: the district&rsquo;s
                figure while it publishes one, the model&rsquo;s estimate after that.</>} />
            <Formula number={8} tex={String.raw`n(g,s,t) = G(s,t)\; \frac{m(g,s,t)}{\sum_{k} m(k,s,t)}`}
              note={<>Students in grade <var>g</var>: the classroom total split by the grade mix <var>m</var>. With a district figure,{' '}
                <var>m</var> is the school&rsquo;s classes by grade after the move from a parent-meeting slide for that concept, where one
                exists. Those are 2026&ndash;27 classes, used for every year. Otherwise, and always for model estimates, <var>m</var> is the
                model&rsquo;s students by grade for that year, with each home keeping its original school&rsquo;s 2025&ndash;26 grade mix
                from the Kansas State Department of Education.</>} />
            <Formula number={9} tex={String.raw`k(g,s,t) = \left\lceil \frac{n(g,s,t)}{c(g)} \right\rceil, \qquad \bar{n}(g,s,t) = \frac{n(g,s,t)}{k(g,s,t)} \quad (k > 0)`}
            narrow={String.raw`\begin{aligned} k(g,s,t) &= \left\lceil \frac{n(g,s,t)}{c(g)} \right\rceil \\ \bar{n}(g,s,t) &= \frac{n(g,s,t)}{k(g,s,t)} \quad (k > 0) \end{aligned}`}
              note={<>Sections: a new section opens whenever a grade passes the district&rsquo;s staffing guideline <var>c</var>{' '}
                (kindergarten through grade 2: 24; grade 3: 26; grades 4 and 5: 28), with no combined-grade classes. The average class
                size is the grade&rsquo;s students over its sections, when it has any.</>} />
          </div>
        </details>
        <p>The staffing guidelines come from the &ldquo;Grade Breakdown&rdquo; slide in each closing school&rsquo;s parent-meeting deck.
          The slides&rsquo; grade counts set only the mix: some of their totals don&rsquo;t match the main presentations, which stay the
          hard stop.</p>

        <H2 id="sources" />
        <div className="src-wrap">
          <table className="src">
            <thead><tr><th>Source</th><th>Type</th><th>Used for</th></tr></thead>
            <tbody>
              <tr><td>Boundary presentations and parent-meeting decks, Nov 2026</td><td>{D}</td>
                <td>Capacities, fall 2026 enrollment, five-year tables, students moving, concept maps, grades after the move, staffing guidelines</td></tr>
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
