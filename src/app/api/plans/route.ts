import { NextResponse } from 'next/server';
import { createHash } from 'node:crypto';
import { supabaseAdmin, shortId } from '@/server/supabase';

export const runtime = 'nodejs';

/** Save a plan (the lab's encoded URL hash) and return a short id for /p/<id>. */
export async function POST(req: Request) {
  const db = supabaseAdmin();
  if (!db) return NextResponse.json({ error: 'Sharing service not configured' }, { status: 503 });
  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Bad request' }, { status: 400 }); }
  const hash = typeof body?.hash === 'string' ? body.hash : '';
  if (!hash || hash.length > 200_000 || !/^[\w\-.~=&%+]*$/.test(hash)) return NextResponse.json({ error: 'Bad plan' }, { status: 400 });
  const name = typeof body?.name === 'string' ? body.name.slice(0, 120) : null;
  const dataVersion = typeof body?.dataVersion === 'string' ? body.dataVersion.slice(0, 40) : null;
  // the same plan always gets the same link
  const md5 = createHash('md5').update(hash).digest('hex');
  const existing = await db.from('plans').select('id').eq('hash_md5', md5).limit(1).maybeSingle();
  if (existing.data?.id) return NextResponse.json({ id: existing.data.id });
  for (let attempt = 0; attempt < 4; attempt++) {
    const id = shortId();
    const { error } = await db.from('plans').insert({ id, hash, name, data_version: dataVersion });
    if (!error) return NextResponse.json({ id });
    if (error.code !== '23505') return NextResponse.json({ error: 'Could not save' }, { status: 500 });   // retry only on id collision
  }
  return NextResponse.json({ error: 'Could not save' }, { status: 500 });
}
