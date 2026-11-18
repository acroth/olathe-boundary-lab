import 'server-only';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/** Server-side Supabase client (service role). Null when the project isn't configured, so the app still runs without it. */
let client: SupabaseClient | null | undefined;
export function supabaseAdmin(): SupabaseClient | null {
  if (client !== undefined) return client;
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  client = url && key ? createClient(url, key, { auth: { persistSession: false } }) : null;
  return client;
}

const ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';
export function shortId(n = 7) {
  const b = crypto.getRandomValues(new Uint8Array(n));
  return Array.from(b, x => ALPHABET[x % ALPHABET.length]).join('');
}
