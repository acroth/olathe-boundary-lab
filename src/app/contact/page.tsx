import type { Metadata } from 'next';
import Shell from '../_site/Shell';
import FeedbackForm from './FeedbackForm';

export const metadata: Metadata = {
  title: 'Feedback · Olathe Boundary Lab',
  description: 'Send a correction, report a problem or suggest an idea for the Olathe Boundary Lab.',
};

export default async function Contact({ searchParams }: { searchParams: Promise<{ plan?: string }> }) {
  const { plan } = await searchParams;
  return (
    <Shell active="contact">
      <h1>Feedback</h1>
      <p className="lede">Corrections, bugs and ideas are all welcome. Corrections to a boundary line or a number are the most useful: say
        which option and which street or area.</p>
      <p>This form reaches the person who runs the lab, not the school district. For questions about the boundary process itself, or to
        give the district your input, contact Olathe Public Schools directly.</p>
      <FeedbackForm plan={typeof plan === 'string' ? plan.slice(0, 2000) : ''} />
    </Shell>
  );
}
