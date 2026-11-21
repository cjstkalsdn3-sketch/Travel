import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/** Supabase 값이 없으면 null: 이 기기에만 저장하는 모드로 동작한다. */
export const supabase: SupabaseClient | null =
  url && key && typeof window !== 'undefined'
    ? createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } })
    : null;

export const cloudEnabled = !!(url && key);
