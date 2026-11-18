import Link from 'next/link';
import Rail from '@/components/Rail';

/** Frame for the plain content pages (About, Feedback): top bar, readable column, independence notice in the footer. */
export default function Shell({ children, active }: { children: React.ReactNode; active?: 'about' | 'contact' }) {
  return (
    <div className="site md:pl-[72px] pb-[calc(60px+env(safe-area-inset-bottom))] md:pb-0">
      <Rail active={active ?? 'about'} />
      <main className="site-main">{children}</main>
      <footer className="site-foot">
        <p><b>Independent project.</b> Not affiliated with, endorsed by or produced by Olathe Public Schools (USD 233). Numbers here
          mix figures the district has published with modeled estimates; see <Link href="/about#data">About &amp; data</Link>.
          For official information, go to the district.</p>
      </footer>
    </div>
  );
}

export function Notice() {
  return (
    <aside className="notice" role="note">
      <b>Not affiliated with the district.</b> This is an independent project built by an Olathe parent. It is not affiliated with,
      endorsed by or produced by Olathe Public Schools (USD 233), its board or its consultants. It is not an official source for
      boundaries, enrollment or any district decision.
    </aside>
  );
}
