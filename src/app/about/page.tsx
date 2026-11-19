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
      <p className="lede">A map-based tool for looking at the elementary and middle school boundary concepts in Olathe USD 233&rsquo;s facility alignment:
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
      <p>The district closes five elementary schools (Black Bob, Heritage, Scarborough, Tomahawk and Walnut Grove) and one middle school
        (Indian Trail), and has shown several ways to redraw their boundaries. The lab puts those concepts on one map so you can compare them side by side.</p>
      <ul>
        <li><b>Concept Builder.</b> Pick one of the district&rsquo;s concepts for each closing school, or one of the district&rsquo;s
          full concepts, and see the result. Some concepts can be mixed and matched; the builder shows what a mix looks like.</li>
        <li><b>Free draw.</b> Move areas by hand, by tracing a new line or by picking whole planning areas or current attendance areas,
          and see how capacity and distances change.</li>
        <li><b>Share.</b> Every view has a link, so you can send someone exactly what you are looking at.</li>
      </ul>

      <h2 id="data">District numbers vs. modeled numbers</h2>
      <p>The lab shows two kinds of numbers because they answer different questions. <b>District numbers</b> are what the district officially
        projects for the plans it published. <b>Modeled numbers</b> estimate what would likely happen under any boundary, including ones the
        district never drew. The model follows the district&rsquo;s own projections, so its estimates pick up where the district&rsquo;s numbers stop.</p>
      <div className="split">
        <div>
          <h3>{D} From the district</h3>
          <ul>
            <li>Functional capacity of each school</li>
            <li>Fall 2026 enrollment and the five-year estimates for each concept</li>
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
      <p><b>Max Functional Capacity.</b> Each school&rsquo;s max functional capacity, the most students the district says the building can serve, comes from the district&rsquo;s
        November 2026 presentations for every school in the closure concepts (and from the parent-meeting slides for the closing schools). The district
        hasn&rsquo;t published one for other schools, so the lab estimates it: 2025&ndash;26 enrollment divided by how full the district&rsquo;s July 2026
        forecast says the school was that year. For example, 452 students at 75% full is a capacity of about 603. Schools with an estimated capacity say so when you tap them.</p>
      <p>District numbers come first. When a plan exactly matches one the district published, the map and scorecard show the district&rsquo;s
        figure for each school and year it covers (2026&ndash;27 to 2031&ndash;32). Anything else, such as a custom mix, a hand edit, a later year
        or a school the district didn&rsquo;t list, shows a modeled estimate marked with a <b>~</b>.</p>
      <p>Where the lab shows a district number, it doesn&rsquo;t show our estimate beside it. Estimates appear only where they&rsquo;re the number
        being used.</p>
      <p>The model starts from the district&rsquo;s verified facts: functional capacity, fall 2026 enrollment, and the students the district
        moves out of each closing school (Black Bob, Heritage, Scarborough, Tomahawk and Walnut Grove, plus Indian Trail Middle School). Each
        school&rsquo;s year-by-year trend is then tuned to the district&rsquo;s five-year projections for its published concepts, so our estimates
        extend the district&rsquo;s numbers to custom plans and to years after 2031&ndash;32. On the district&rsquo;s published plans for 2027&ndash;28 to
        2031&ndash;32, the model lands an average of 1.6 points from the district at elementary schools and 1.1 points at middle schools, and within
        5 points about 94% and 98% of the time. One district figure is left out of the tuning: in middle school concept 4, Frontier Trail shows
        933 students in 2027&ndash;28, as if the areas it gives California Trail (620, 630 and 650) never left, and that concept&rsquo;s total is about
        160 students higher than the rest. That looks like an error, so the lab still shows the district&rsquo;s number there, with a note, but
        doesn&rsquo;t bend the model toward it.</p>
      <p>A few parent-meeting slides showed a school fuller than the district&rsquo;s main presentation does for the same concept. The main
        presentations stay the official numbers, and the school list notes where a slide differed.</p>

      <h2 id="model">How the model works</h2>
      <ol>
        <li><b>Homes.</b> Every residential building in the district gets a point and an estimated number of housing units, from 2020 Census
          blocks placed onto building footprints. Homes built after 2020 are added from newer footprints.</li>
        <li><b>Children per home.</b> Each home gets an expected number of elementary, middle and high school-age children from its census
          block&rsquo;s age counts. A 2010-to-2020 check within the district was used to tune how much those age patterns carry forward.</li>
        <li><b>Matching the district&rsquo;s facts.</b> For each school, those children are scaled so the school&rsquo;s total matches the district&rsquo;s
          fall 2026 enrollment. Through 2031&ndash;32, each school&rsquo;s trend is tuned to the district&rsquo;s five-year projections; after that, it
          follows the July 2026 enrollment forecast&rsquo;s trend from where the district&rsquo;s projections end. Students at the five closing elementary schools are
          placed according to the district&rsquo;s student-dot maps, and start at their new schools from the counts the district moves (Black Bob about 229,
          Heritage 233, Scarborough 237, Tomahawk 322 and Walnut Grove 367). Indian Trail starts from its fall 2026 count of 570. For Heritage, Scarborough and Walnut
          Grove, each moving piece also holds the district&rsquo;s count. Black Bob&rsquo;s and Tomahawk&rsquo;s piece counts don&rsquo;t add up to their
          enrollment, so only their totals are matched.</li>
        <li><b>Moving boundaries.</b> When an area changes schools, its homes carry their projected students with them. Each school&rsquo;s
          total is compared with its functional capacity, year by year. Following the district&rsquo;s estimate, about half of Black Bob&rsquo;s
          236 Spanish immersion students (118) are assumed to move with the program to Arbor Creek.</li>
        <li><b>Distances.</b> Distances are measured along the street network, not in straight lines, and checked against the 2.5-mile busing threshold.</li>
      </ol>

      <h2 id="sources">Data sources</h2>
      <p>Everything the lab uses, where it comes from and what it&rsquo;s used for. District items are public documents the district released.</p>
      <div className="src-wrap">
        <table className="src">
          <thead><tr><th>Source</th><th>Type</th><th>Used for</th></tr></thead>
          <tbody>
            <tr><td>Facility alignment boundary presentations, Nov 2026 (elementary and middle school decks, and parent-meeting decks)</td><td>{D}</td>
              <td>Capacities, fall 2026 enrollment, five-year estimates by concept (also used to tune the model&rsquo;s trends), students moving by piece, elementary and middle school concept maps, student-dot maps</td></tr>
            <tr><td>District 2026 planning-area map</td><td>{D}</td><td>Planning areas (the numbered areas such as 610 or 750)</td></tr>
            <tr><td>Demographic Analytics Advisors, <i>Enrollment Forecasting, Capacity and Utilization Analysis</i> (July 2026), prepared for the district</td><td>{D}</td>
              <td>Utilization projections by school, 2025&ndash;26 through 2034&ndash;35; the trend after the district&rsquo;s five-year tables end</td></tr>
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
        <li><b>Hosting and storage.</b> Hosted on Vercel. Shared links are stored in a Supabase (Postgres) database. Feedback is emailed
          to the site&rsquo;s owner and isn&rsquo;t stored on the site.</li>
      </ul>
      <p>No accounts, no ads and no tracking cookies.</p>
    </Shell>
  );
}
