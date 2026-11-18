import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/server/supabase';

export const runtime = 'nodejs';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = supabaseAdmin();
  if (!db) return NextResponse.json({ error: 'Sharing service not configured' }, { status: 503 });
  const { data } = await db.from('plans').select('id, hash, name, data_version, created_at').eq('id', id).maybeSingle();
  if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(data);
}
