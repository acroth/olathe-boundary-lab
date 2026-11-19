import { NextResponse } from 'next/server';
import { composeFeedbackEmail, gmailSender, parseFeedback } from '@/server/feedbackEmail';

export const runtime = 'nodejs';

/** Emails a feedback message to the site owner's Gmail inbox. */
export async function POST(request: Request) {
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'Bad request' }, { status: 400 }); }

  const parsed = parseFeedback(body, request.headers.get('user-agent'));
  if ('spam' in parsed) return NextResponse.json({ ok: true });
  if ('error' in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const send = gmailSender();
  if (!send) return NextResponse.json({ error: 'Feedback isn’t set up yet. Please try again later.' }, { status: 503 });
  try {
    await send(composeFeedbackEmail(parsed.feedback));
  } catch (error) {
    console.error('Feedback email failed', error);
    return NextResponse.json({ error: 'Couldn’t send your message. Please try again.' }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
