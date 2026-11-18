import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/server/supabase';

export const runtime = 'nodejs';

const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

/** Store a feedback message. Read them in Supabase (table "feedback"). */
export async function POST(req: Request) {
  let b: any;
  try { b = await req.json(); } catch { return NextResponse.json({ error: 'Bad request' }, { status: 400 }); }
  // spam traps: a hidden field people never fill in, and forms sent within 3 seconds of opening
  if (str(b?.website, 200) || (typeof b?.elapsed === 'number' && b.elapsed < 3000)) return NextResponse.json({ ok: true });
  const message = str(b?.message, 5000);
  if (message.length < 5) return NextResponse.json({ error: 'Please write a message.' }, { status: 400 });
  const email = str(b?.email, 200);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return NextResponse.json({ error: 'That email address doesn’t look right.' }, { status: 400 });
  const db = supabaseAdmin();
  if (!db) return NextResponse.json({ error: 'Feedback isn’t set up yet. Please try again later.' }, { status: 503 });
  const { error } = await db.from('feedback').insert({
    topic: str(b?.topic, 80) || null, message, plan_url: str(b?.plan, 2000) || null,
    name: str(b?.name, 120) || null, email: email || null, user_agent: str(req.headers.get('user-agent'), 300) || null,
  });
  if (error) return NextResponse.json({ error: 'Couldn’t send your message. Please try again.' }, { status: 500 });
  return NextResponse.json({ ok: true });
}
