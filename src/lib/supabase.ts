import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// 공개용 값(publishable key)이라 코드에 넣어도 안전하다. 환경변수가 있으면 그걸 쓴다.
const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://olxsyfvenwlesvlipyak.supabase.co';
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'sb_publishable_lC36qnUwoCbYeJlCxFKuHQ_EN5jiAHY';

/** Supabase 값이 없으면 null: 이 기기에만 저장하는 모드로 동작한다. */
export const supabase: SupabaseClient | null =
  url && key && typeof window !== 'undefined'
    ? createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } })
    : null;

export const cloudEnabled = !!(url && key);
