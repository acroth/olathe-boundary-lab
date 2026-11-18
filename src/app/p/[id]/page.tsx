import { notFound, redirect } from 'next/navigation';
import { supabaseAdmin } from '@/server/supabase';

/** Short share links: /p/<id> opens the lab with the saved plan. */
export default async function SharedPlan({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = supabaseAdmin();
  if (!db) notFound();
  const { data } = await db.from('plans').select('hash').eq('id', id).maybeSingle();
  if (!data?.hash) notFound();
  redirect('/#' + data.hash);
}
