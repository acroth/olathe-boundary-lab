import type { Metadata } from 'next';
import Link from 'next/link';
import Shell, { Notice } from '../_site/Shell';

export const metadata: Metadata = {
  title: 'About & data · Olathe Boundary Lab',
  description: 'What the Olathe Boundary Lab is, how it works, and the district and public data it uses. Independent project, not affiliated with Olathe Public Schools.',
};

const D = <span className="stag district">District</span>;
const P = <span className="stag public">Public</span>;
const M = <span className="stag model">Modeled</span>;

export default function About() {
  return (
    <Shell active="about">
      <h1>About the Boundary Lab</h1>
      <p className="lede">A map-based tool for looking at the elementary boundary options in Olathe USD 233&rsquo;s facility alignment:
        who moves where, how full each school gets, and how far families end up from their new school.</p>
      <Notice />
      <ul className="toc">
        <li><a href="#what">What it does</a></li>
        <li><a href="#data">District vs. modeled numbers</a></li>
        <li><a href="#model">How the model works</a></li>
        <li><a href="#sources">Data sources</a></li>
        <li><a href="#limits">Limits</a></li>
        <li><a href="#built">How it&rsquo;s built</a></li>
      </ul>

      <h2 id="what">What it does</h2>
      <p>The district closes five elementary schools (Black Bob, Heritage, Scarborough, Tomahawk and Walnut Grove) and has shown several
        ways to redraw their boundaries. The lab puts those options on one map so you can compare them side by side.</p>
      <ul>
        <li><b>Option Builder.</b> Pick one of the district&rsquo;s concepts for each closing school, or one of the district&rsquo;s
          full options, and see the result. Some concepts can be mixed and matched; the builder shows what a mix looks like.</li>
        <li><b>Free draw.</b> Move areas by hand, by tracing a new line or by picking whole planning areas or current attendance areas,
          and see how capacity and distances change.</li>
        <li><b>Share.</b> Every view has a link, so you can send someone exactly what you are looking at.</li>
      </ul>

      <h2 id="data">District numbers vs. modeled numbers</h2>
      <p>The lab shows two kinds of numbers, and labels them wherever both appear. They will not always agree.</p>
      <div className="split">
        <div>
          <h3>{D} From the district</h3>
          <ul>
            <li>Functional capacity of each school</li>
            <li>Fall 2026 enrollment and the five-year estimates for each option</li>
            <li>Students moving from each closing school to each receiving school</li>
            <li>The boundary concept maps, student-dot maps and planning areas shown at the November 2026 meetings</li>
          </ul>
        </div>
        <div>
          <h3>{M} Modeled by the lab</h3>
          <ul>
            <li>Where students live, home by home</li>
            <li>Projections for any boundary you build or edit, beyond what the district published</li>
            <li>Road distances from homes to schools</li>
            <li>The boundary lines themselves, as read from the district&rsquo;s maps (see <a href="#limits">Limits</a>)</li>
          </ul>
        </div>
      </div>
      <p>When you use one of the district&rsquo;s options unchanged, the lab shows the district&rsquo;s figures first and the model next to them.
        Once you change a boundary, only modeled numbers exist for the result. Modeled numbers are estimates built from public data and are
        calibrated to match the district&rsquo;s totals, not independent forecasts.</p>

      <h2 id="model">How the model works</h2>
      <ol>
        <li><b>Homes.</b> Every residential building in the district gets a point and an estimated number of housing units, from 2020 Census
          blocks placed onto building footprints. Homes built after 2020 are added from newer footprints.</li>
        <li><b>Children per home.</b> Each home gets an expected number of elementary, middle and high school-age children from its census
          block&rsquo;s age counts. A 2010-to-2020 check within the district was used to tune how much those age patterns carry forward.</li>
        <li><b>Matching the district.</b> For each school, those children are scaled so the school&rsquo;s total matches the district&rsquo;s
          own enrollment and projections. For the five closing schools, students are placed according to the district&rsquo;s student-dot maps.</li>
        <li><b>Moving boundaries.</b> When an area changes schools, its homes carry their projected students with them. Each school&rsquo;s
          total is compared with its functional capacity, year by year. About half of Spanish immersion students are assumed to move with the
          program to Arbor Creek, following the district&rsquo;s estimate.</li>
        <li><b>Distances.</b> Distances are measured along the street network, not in straight lines, and checked against the 2.5-mile busing threshold.</li>
      </ol>

      <h2 id="sources">Data sources</h2>
      <p>Everything the lab uses, where it comes from and what it&rsquo;s used for. District items are public documents the district released.</p>
      <div className="src-wrap">
        <table className="src">
          <thead><tr><th>Source</th><th>Type</th><th>Used for</th></tr></thead>
          <tbody>
            <tr><td>Facility alignment boundary presentations, Nov 2026 (elementary deck and parent-meeting decks)</td><td>{D}</td>
              <td>Capacities, fall 2026 enrollment, five-year estimates by option, students moving by piece, concept maps, student-dot maps</td></tr>
            <tr><td>District 2026 planning-area map</td><td>{D}</td><td>Planning areas (the numbered areas such as 610 or 750)</td></tr>
            <tr><td>Demographic Analytics Advisors, <i>Enrollment Forecasting, Capacity and Utilization Analysis</i> (July 2026), prepared for the district</td><td>{D}</td>
              <td>Utilization projections by school, 2025&ndash;26 through 2034&ndash;35</td></tr>
            <tr><td><a href="https://www.ksde.gov" rel="noopener">Kansas State Department of Education</a>, 2025&ndash;26 headcount by building and grade</td><td>{P}</td>
              <td>Starting enrollment and grade mix by school</td></tr>
            <tr><td><a href="https://nces.ed.gov/ccd/" rel="noopener">NCES Common Core of Data</a>, 2024&ndash;25</td><td>{P}</td><td>Pre-K counts by building</td></tr>
            <tr><td><a href="https://aims.jocogov.org" rel="noopener">Johnson County AIMS</a> school boundaries</td><td>{P}</td>
              <td>Current elementary, middle and high school attendance areas and the district boundary</td></tr>
            <tr><td><a href="https://data.census.gov" rel="noopener">U.S. Census Bureau</a>, 2020 Census blocks (housing units; ages from the Demographic and Housing Characteristics file, table P12)</td><td>{P}</td>
              <td>Housing units and children by age, block by block</td></tr>
            <tr><td>U.S. Census Bureau, 2010 Census blocks</td><td>{P}</td><td>Back-testing how well 2010 age patterns predicted 2020</td></tr>
            <tr><td><a href="https://overturemaps.org" rel="noopener">Overture Maps</a> buildings and transportation (including <a href="https://www.openstreetmap.org/copyright" rel="noopener">OpenStreetMap</a> data)</td><td>{P}</td>
              <td>Building footprints for placing homes; the street network for road distances and for snapping drawn lines</td></tr>
            <tr><td><a href="https://protomaps.com" rel="noopener">Protomaps</a> basemap (OpenStreetMap data)</td><td>{P}</td><td>The background map</td></tr>
          </tbody>
        </table>
      </div>
      <p className="note">Map data &copy; <a href="https://www.openstreetmap.org/copyright" rel="noopener">OpenStreetMap contributors</a>, available under the Open Database License.</p>

      <h2 id="limits">Limits</h2>
      <ul>
        <li><b>Boundary lines are approximate.</b> The district published its concepts as images, not map files. The lab&rsquo;s lines were
          traced from those images onto streets, so a few blocks near a line may be on the wrong side.</li>
        <li><b>Modeled counts are estimates.</b> They come from census patterns and will differ from the district&rsquo;s student records,
          especially for small areas and newer neighborhoods.</li>
        <li><b>Program choices aren&rsquo;t modeled in detail.</b> Transfers, special programs and Pre-K placement follow the district&rsquo;s
          published assumptions where it gave them, and are otherwise left as they are today.</li>
        <li><b>Nothing here is a decision.</b> Only the district&rsquo;s board decides boundaries. Check the district&rsquo;s own materials for anything official.</li>
      </ul>
      <p>Spot something wrong? <Link href="/contact">Send a correction</Link>.</p>

      <h2 id="built">How it&rsquo;s built</h2>
      <ul>
        <li><b>Data pipeline (Python).</b> Builds the homes, students, streets and boundary files from the sources above, and reads the
          district&rsquo;s map images. It runs offline, not on this site.</li>
        <li><b>The lab (Next.js and React).</b> The map runs in your browser with MapLibre. All boundary calculations run on your own device,
          so nothing about what you draw is sent anywhere unless you press Share.</li>
        <li><b>Hosting and storage.</b> Hosted on Vercel. Shared links and feedback are stored in a Supabase (Postgres) database.</li>
      </ul>
      <p>No accounts, no ads and no tracking cookies.</p>
    </Shell>
  );
}
