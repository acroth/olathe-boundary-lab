import type { Metadata } from 'next';
import { ExternalLink } from 'lucide-react';
import Shell from '../_site/Shell';
import FeedbackForm from './FeedbackForm';

export const metadata: Metadata = {
  title: 'Feedback · Olathe Boundary Lab',
  description: 'Send a correction, report a problem or suggest an idea for the Olathe Boundary Lab.',
};

/** The district's own feedback forms for the boundary process, open until Nov 22, 2026. */
const DISTRICT_FORMS = [
  { label: 'Elementary boundaries', href: 'https://forms.cloud.microsoft/pages/responsepage.aspx?id=f8IlL4QKYEmIamhcur6jq1-pb6cuHtxPpY860Es0rc9UN0M1WTNXN1ZCOEwzUDdGQlpHOVc0RlNOOC4u&route=shorturl' },
  { label: 'Middle school boundaries', href: 'https://forms.cloud.microsoft/pages/responsepage.aspx?id=f8IlL4QKYEmIamhcur6jq1-pb6cuHtxPpY860Es0rc9UM08wREpVMk8xM0VRUkU3MFhQNlhTTkY5Ny4u&route=shorturl' },
];

export default async function Contact({ searchParams }: { searchParams: Promise<{ plan?: string }> }) {
  const { plan } = await searchParams;
  return (
    <Shell active="contact">
      <aside className="district-forms" aria-labelledby="district-forms-title">
        <p id="district-forms-title" className="district-forms-title">Want to reach the district?</p>
        <p>For questions about the boundary process itself, or to give the district your input, use the district&rsquo;s own feedback
          forms. They&rsquo;re open until <b>November 22, 2026</b>.</p>
        <ul>
          {DISTRICT_FORMS.map(form => (
            <li key={form.label}>
              <a href={form.href} target="_blank" rel="noopener noreferrer">{form.label}<ExternalLink aria-hidden /></a>
            </li>
          ))}
        </ul>
        <p className="district-forms-note">Or contact Olathe Public Schools directly.</p>
      </aside>

      <h1>Feedback</h1>
      <p className="lede">Corrections, bugs and ideas are welcome! This form reaches me, not the school district.</p>
      <FeedbackForm plan={typeof plan === 'string' ? plan.slice(0, 2000) : ''} />
    </Shell>
  );
}
