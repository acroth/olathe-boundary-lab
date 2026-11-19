import type { Metadata } from 'next';
import Link from 'next/link';
import { Calculator, TriangleAlert } from 'lucide-react';
import Shell, { Notice } from '../_site/Shell';

export const metadata: Metadata = {
  title: 'About & data · Olathe Boundary Lab',
  description: 'What the Olathe Boundary Lab is, how its numbers are calculated, and the district and public data it uses. Independent project, not affiliated with Olathe Public Schools.',
};

const D = <span className="stag district">District</span>;
const P = <span className="stag public">Public</span>;

/** One formula and what it means. */
function Formula({ children, note }: { children: React.ReactNode; note: React.ReactNode }) {
  return (
    <div className="formula-row">
      <p className="formula">{children}</p>
      <p className="formula-note">{note}</p>
    </div>
  );
}

export default function About() {
  return (
    <Shell active="about">
      <h1>About the Boundary Lab</h1>
      <p className="lede">A map for comparing Olathe USD 233&rsquo;s elementary and middle school boundary concepts: who moves, and how full each school gets.</p>
      <Notice />
      <ul className="toc">
        <li><a href="#what">What it does</a></li>
        <li><a href="#data">The numbers</a></li>
        <li><a href="#math">The math</a></li>
        <li><a href="#sources">Sources</a></li>
        <li><a href="#limits">Limits</a></li>
      </ul>

      <h2 id="what">What it does</h2>
      <p>The district is closing Black Bob, Heritage, Scarborough, Tomahawk and Walnut Grove elementary schools and Indian Trail Middle School.</p>
      <ul>
        <li><b>Concept builder:</b> view the district&rsquo;s concepts, or mix them school by school.</li>
        <li><b>Free draw:</b> redraw lines yourself and see how full each school gets.</li>
        <li><b>Share:</b> every view has a link to exactly what you&rsquo;re looking at.</li>
      </ul>

      <h2 id="data">The numbers</h2>
      <ul>
        <li><b>District numbers come first.</b> When a plan matches one the district published, you see the district&rsquo;s figures for
          2026&ndash;27 through 2031&ndash;32.</li>
        <li><b>Model numbers fill the gaps:</b> custom mixes, hand-drawn plans and years after 2031&ndash;32. They&rsquo;re marked
          with <b>~</b> and <Calculator className="about-icon" aria-label="calculator icon" />.</li>
        <li><TriangleAlert className="about-icon warn" aria-label="warning icon" /> <b>marks a note about a district figure</b>, such as a
          parent-meeting slide that shows a different total, or a number that looks like an error.</li>
        <li><b>Max functional capacity</b> is the district&rsquo;s published figure for every school in the concepts. Other schools&rsquo;
          capacities are estimated (formula 6).</li>
      </ul>

      <h2 id="math">The math</h2>
      <p>The model estimates students home by home, then adds them up by school.</p>
      <div className="formulas">
        <Formula note={<>Expected children at home <var>h</var>, from its census block&rsquo;s housing units and ages.</>}>
          1.&ensp;<var>w</var><sub><var>h</var></sub> = children per home (census)
        </Formula>
        <Formula note={<>Students per child for school <var>o</var> in year <var>t</var>: its projected enrollment <var>E</var> spread over the
          children living in its area today, then scaled by <var>a</var> to match fall 2026 enrollment and by <var>b</var>(<var>t</var>) to follow
          the district&rsquo;s five-year tables.</>}>
          2.&ensp;<var>f</var><sub><var>o</var></sub>(<var>t</var>) = <var>E</var><sub><var>o</var></sub>(<var>t</var>) &frasl; &Sigma;<sub><var>h</var>&isin;<var>o</var></sub> <var>w</var><sub><var>h</var></sub> &times; <var>a</var><sub><var>o</var></sub> &times; <var>b</var><sub><var>o</var></sub>(<var>t</var>)
        </Formula>
        <Formula note={<>A school&rsquo;s students: every home now assigned to it, each keeping its <i>original</i> school&rsquo;s rate, plus
          students placed in the building (<var>F</var>: Pre-K, and 118 Spanish immersion students at Arbor Creek).</>}>
          3.&ensp;<var>N</var><sub><var>s</var></sub>(<var>t</var>) = &Sigma;<sub><var>h</var>&rarr;<var>s</var></sub> <var>w</var><sub><var>h</var></sub> &times; <var>f</var><sub><var>o</var>(<var>h</var>)</sub>(<var>t</var>) + <var>F</var><sub><var>s</var></sub>
        </Formula>
        <Formula note={<>How full: students over max functional capacity <var>C</var>. The district&rsquo;s goal is 85% or less.</>}>
          4.&ensp;<var>U</var><sub><var>s</var></sub>(<var>t</var>) = <var>N</var><sub><var>s</var></sub>(<var>t</var>) &frasl; <var>C</var><sub><var>s</var></sub>
        </Formula>
        <Formula note={<>Trend tuning: for each year through 2031&ndash;32, the <var>b</var> values that best match the district&rsquo;s
          numbers <var>D</var> across all of its concepts <var>c</var>. The second term keeps each <var>b</var> near 1 (&lambda; = 0.05;{' '}
          <var>S</var> = the school&rsquo;s own students). After 2031&ndash;32, each <var>b</var> stays at its 2031&ndash;32 value.</>}>
          5.&ensp;min &Sigma;<sub><var>c</var>,<var>s</var></sub> (<var>N</var><sub><var>s</var></sub><sup><var>c</var></sup> &minus; <var>D</var><sub><var>s</var></sub><sup><var>c</var></sup>)&sup2; + &lambda; &Sigma;<sub><var>o</var></sub> (<var>S</var><sub><var>o</var></sub>(<var>b</var><sub><var>o</var></sub> &minus; 1))&sup2;
        </Formula>
        <Formula note={<>Capacity for schools the district hasn&rsquo;t published one for: 2025&ndash;26 enrollment over how full the July 2026
          forecast says it was. Example: 452 &frasl; 0.75 &asymp; 603.</>}>
          6.&ensp;<var>C</var> = enrollment<sub>2025&ndash;26</sub> &frasl; <var>U</var><sub>2025&ndash;26</sub>
        </Formula>
      </div>
      <p><b>How close it lands.</b> On the district&rsquo;s published plans for 2027&ndash;28 to 2031&ndash;32, the model is on average 1.6
        points from the district for elementary schools and 1.1 for middle schools. It&rsquo;s within 5 points 94% and 98% of the time.</p>
      <p><b>Left out of the tuning:</b> Frontier Trail&rsquo;s 933 students in middle school concept 4, which looks as if areas 620, 630 and 650
        never left. The district&rsquo;s number is still shown, with a note.</p>
      <p><b>Closing schools</b> start from the students the district moves out of each: Black Bob about 229, Heritage 233, Scarborough 237,
        Tomahawk 322, Walnut Grove 367, and Indian Trail 570. Distances are measured along streets and checked against the 2.5-mile busing line.</p>

      <h2 id="sources">Sources</h2>
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
            <tr><td><a href="https://aims.jocogov.org" rel="noopener">Johnson County AIMS</a></td><td>{P}</td><td>Current attendance areas and the district line</td></tr>
            <tr><td><a href="https://data.census.gov" rel="noopener">U.S. Census</a>, 2020 blocks (2010 for back-testing)</td><td>{P}</td><td>Housing units and children by age (<var>w</var>)</td></tr>
            <tr><td><a href="https://overturemaps.org" rel="noopener">Overture Maps</a> and <a href="https://protomaps.com" rel="noopener">Protomaps</a></td><td>{P}</td><td>Buildings, streets and the background map</td></tr>
          </tbody>
        </table>
      </div>
      <p className="note">Map data &copy; <a href="https://www.openstreetmap.org/copyright" rel="noopener">OpenStreetMap contributors</a>, under the Open Database License.</p>

      <h2 id="limits">Limits</h2>
      <ul>
        <li><b>Lines are approximate.</b> The district shared its concepts as images, so they were traced onto streets by hand.</li>
        <li><b>Model numbers are estimates</b> built from census patterns, and are least reliable for small areas and new neighborhoods.</li>
        <li><b>Nothing here is a decision.</b> Only the Board of Education sets boundaries.</li>
      </ul>
      <p>Spot something wrong? <Link href="/contact">Send a correction</Link>.</p>
      <p className="note">Built with Next.js and MapLibre and hosted on Vercel. Everything you draw is calculated in your browser and is only
        sent anywhere if you press Share. No accounts, ads or tracking cookies.</p>
    </Shell>
  );
}
