'use client';

import { useSyncExternalStore } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import type { AppData, Person, Trip } from './types';
import { supabase } from './supabase';
import { build, flatten, rowKey, stable, type Row } from './rows';

/**
 * 앱 데이터 저장소.
 *
 * - Supabase 설정이 없으면: 이 기기(localStorage)에만 저장 ("local" 모드)
 * - 있으면: 로그인한 두 사람의 공간(couple)에 저장하고 실시간으로 주고받는다.
 *   화면은 늘 이 기기의 사본을 먼저 보여주고, 바뀐 행만 서버로 보낸다.
 *   인터넷이 끊기면 사본에 쌓아뒀다가 연결되면 다시 보낸다.
 *
 * 화면 코드는 `useData` / `update` / `updateTrip`만 쓴다.
 */

export type Status = 'loading' | 'local' | 'signedOut' | 'noCouple' | 'ready';
export interface Session {
  status: Status;
  email?: string;
  me?: Person;
  coupleId?: string;
  inviteCode?: string;
  partnerJoined?: boolean;
  /** 서버에 아직 못 보낸 변경이 있음 */
  offline?: boolean;
}

const LOCAL_KEY = 'our-trip:v1';
const cacheKey = (c: string) => `our-trip:cloud:${c}`;
const LAST_KEY = 'our-trip:last';

const DEFAULT_PEOPLE: AppData['people'] = { m: { name: '민우' }, g: { name: '여자친구' } };
const EMPTY: AppData = { version: 1, people: DEFAULT_PEOPLE, last: { payer: 'm', pay: 'card' }, trips: [] };
const SERVER_SESSION: Session = { status: 'loading' };

let state: AppData = EMPTY;
let session: Session = SERVER_SESSION;
let started = false;
/** 서버가 확인한 행 (id → rowKey) */
let synced: Record<string, string> = {};
let syncedPeople = '';
let channel: RealtimeChannel | null = null;

const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

let onError: ((msg: string) => void) | null = null;
export function setPersistErrorHandler(fn: (msg: string) => void) {
  onError = fn;
}

/* ---------- localStorage helpers ---------- */
function readJSON<T>(k: string): T | null {
  try {
    const raw = localStorage.getItem(k);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}
function writeJSON(k: string, v: unknown): boolean {
  try {
    localStorage.setItem(k, JSON.stringify(v));
    return true;
  } catch {
    onError?.('이 기기 저장 공간이 부족해요. 바우처 사진을 줄여주세요.');
    return false;
  }
}
function saveLocal(): boolean {
  writeJSON(LAST_KEY, state.last);
  if (session.status === 'local') return writeJSON(LOCAL_KEY, state);
  if (session.coupleId) return writeJSON(cacheKey(session.coupleId), { state, synced, syncedPeople });
  return true;
}

/** 로그인 전에 이 기기에만 있던 여행 (옮겨오기용) */
export function legacyTrips(): Trip[] {
  if (typeof window === 'undefined') return [];
  return readJSON<AppData>(LOCAL_KEY)?.trips ?? [];
}
export function clearLegacy() {
  try {
    localStorage.removeItem(LOCAL_KEY);
  } catch {}
  emit();
}

/* ---------- 시작 ---------- */
function setSession(s: Session) {
  session = s;
  emit();
}

function start() {
  if (started || typeof window === 'undefined') return;
  started = true;
  const last = readJSON<AppData['last']>(LAST_KEY);
  if (!supabase) {
    const d = readJSON<AppData>(LOCAL_KEY);
    state = { ...EMPTY, ...(d ?? {}), last: last ?? d?.last ?? EMPTY.last };
    session = { status: 'local' };
    return;
  }
  if (last) state = { ...state, last };
  supabase.auth.onAuthStateChange((event, s) => {
    if (event === 'INITIAL_SESSION' || event === 'SIGNED_IN' || event === 'SIGNED_OUT') {
      // 콜백 안에서 바로 supabase를 부르면 막힐 수 있어 다음 틱으로 미룬다
      setTimeout(() => void connect(s?.user?.id, s?.user?.email), 0);
    }
  });
  window.addEventListener('online', () => void flush());
}

let connecting = '';
async function connect(userId?: string, email?: string) {
  if (!supabase) return;
  if (!userId) {
    channel?.unsubscribe();
    channel = null;
    state = { ...EMPTY, last: state.last };
    synced = {};
    setSession({ status: 'signedOut' });
    return;
  }
  if (connecting === userId && session.status === 'ready') return;
  connecting = userId;
  const { data: mem, error } = await supabase.from('members').select('couple_id, slot').eq('user_id', userId).maybeSingle();
  if (error) {
    // 오프라인일 수 있다: 마지막 공간의 사본이라도 보여준다
    const lastCouple = readJSON<string>('our-trip:couple');
    if (lastCouple) return openCouple(lastCouple, (readJSON<Person>('our-trip:me') ?? 'm') as Person, email, true);
    onError?.('서버에 연결하지 못했어요. 인터넷을 확인해주세요.');
    return setSession({ status: 'signedOut' });
  }
  if (!mem) return setSession({ status: 'noCouple', email });
  await openCouple(mem.couple_id as string, mem.slot as Person, email);
}

async function openCouple(coupleId: string, me: Person, email?: string, offline = false) {
  if (!supabase) return;
  writeJSON('our-trip:couple', coupleId);
  writeJSON('our-trip:me', me);
  const cache = readJSON<{ state: AppData; synced: Record<string, string>; syncedPeople: string }>(cacheKey(coupleId));
  if (cache) {
    state = { ...cache.state, last: state.last };
    synced = cache.synced;
    syncedPeople = cache.syncedPeople;
  } else {
    state = { ...EMPTY, last: { ...state.last, payer: me } };
    synced = {};
    syncedPeople = '';
  }
  setSession({ status: 'ready', email, me, coupleId, offline });
  if (offline) return;

  await flush(); // 끊겨 있던 동안 바뀐 것부터 보낸다
  await refresh();
  subscribe(coupleId);
}

/** 서버 전체를 다시 읽는다. 아직 못 보낸 내 변경은 지키고 덮어쓴다. */
async function refresh() {
  if (!supabase || !session.coupleId) return;
  const cid = session.coupleId;
  const [couple, members, items] = await Promise.all([
    supabase.from('couples').select('invite_code, names').eq('id', cid).single(),
    supabase.from('members').select('slot').eq('couple_id', cid),
    supabase.from('items').select('id, kind, trip_id, data').eq('couple_id', cid),
  ]);
  if (couple.error || items.error) {
    setSession({ ...session, offline: true });
    return;
  }
  const local = flatten(state);
  const server = new Map<string, Row>();
  const nextSynced: Record<string, string> = {};
  for (const r of items.data as Row[]) {
    server.set(r.id, r);
    nextSynced[r.id] = rowKey(r);
  }
  // 로컬에서 고쳤는데 아직 못 보낸 행은 로컬 값을 유지
  for (const [id, r] of local) if (rowKey(r) !== synced[id]) server.set(id, r);
  for (const id of Object.keys(synced)) if (!local.has(id) && server.has(id) && rowKey(server.get(id)!) === synced[id]) server.delete(id);
  synced = nextSynced;
  const names = (couple.data.names as AppData['people']) ?? DEFAULT_PEOPLE;
  const peopleDirty = syncedPeople !== '' && stable(state.people) !== syncedPeople;
  syncedPeople = stable(names);
  state = { ...state, people: peopleDirty ? state.people : names, trips: build(server.values()) };
  session = { ...session, inviteCode: couple.data.invite_code as string, partnerJoined: (members.data?.length ?? 0) >= 2, offline: false };
  saveLocal();
  emit();
  void flush();
}

function subscribe(coupleId: string) {
  if (!supabase) return;
  channel?.unsubscribe();
  channel = supabase
    .channel('couple-' + coupleId)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'items', filter: `couple_id=eq.${coupleId}` }, (p) => {
      if (p.eventType === 'DELETE') applyRemote((p.old as { id: string }).id, null);
      else applyRemote((p.new as Row).id, p.new as Row);
    })
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'couples', filter: `id=eq.${coupleId}` }, (p) => {
      const names = (p.new as { names: AppData['people'] }).names;
      const before = syncedPeople;
      syncedPeople = stable(names);
      if (stable(state.people) === before) {
        state = { ...state, people: names };
        saveLocal();
        emit();
      }
    })
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'members', filter: `couple_id=eq.${coupleId}` }, () => {
      setSession({ ...session, partnerJoined: true });
    })
    .subscribe((st) => {
      // 다시 연결되면 그사이 놓친 변경을 받아온다
      if (st === 'SUBSCRIBED' && session.status === 'ready') void refresh();
    });
}

function applyRemote(id: string, row: Row | null) {
  const local = flatten(state);
  const mine = local.get(id);
  const prev = synced[id];
  const locallyDirty = mine ? rowKey(mine) !== prev : prev !== undefined;
  if (row) synced[id] = rowKey(row);
  else delete synced[id];
  if (locallyDirty) return saveLocal(); // 내 변경이 곧 올라간다
  if (row) local.set(id, { id: row.id, kind: row.kind, trip_id: row.trip_id, data: row.data });
  else local.delete(id);
  state = { ...state, trips: build(local.values()) };
  saveLocal();
  emit();
}

/* ---------- 서버로 보내기 ---------- */
let flushing: Promise<void> | null = null;
let again = false;
let retry: ReturnType<typeof setTimeout> | undefined;
let warned = false;

async function flush(): Promise<void> {
  if (!supabase || session.status !== 'ready' || !session.coupleId) return;
  if (flushing) {
    again = true;
    return flushing;
  }
  flushing = (async () => {
    const cid = session.coupleId!;
    const cur = flatten(state);
    const ups: Row[] = [];
    for (const [id, r] of cur) if (rowKey(r) !== synced[id]) ups.push(r);
    const dels = Object.keys(synced).filter((id) => !cur.has(id));
    const people = stable(state.people);
    try {
      if (ups.length) {
        const { error } = await supabase!.from('items').upsert(ups.map((r) => ({ ...r, couple_id: cid, updated_at: new Date().toISOString() })));
        if (error) throw error;
        for (const r of ups) synced[r.id] = rowKey(r);
      }
      if (dels.length) {
        const { error } = await supabase!.from('items').delete().eq('couple_id', cid).in('id', dels);
        if (error) throw error;
        for (const id of dels) delete synced[id];
      }
      if (syncedPeople && people !== syncedPeople) {
        const { error } = await supabase!.from('couples').update({ names: state.people }).eq('id', cid);
        if (error) throw error;
        syncedPeople = people;
      }
      warned = false;
      if (session.offline) setSession({ ...session, offline: false });
      saveLocal();
    } catch {
      if (!warned) onError?.('인터넷이 끊겨서 이 폰에만 저장했어요. 연결되면 자동으로 올라가요.');
      warned = true;
      if (!session.offline) setSession({ ...session, offline: true });
      clearTimeout(retry);
      retry = setTimeout(() => void flush(), 15000);
    }
  })();
  await flushing;
  flushing = null;
  if (again) {
    again = false;
    await flush();
  }
}

let debounce: ReturnType<typeof setTimeout> | undefined;
function scheduleFlush() {
  clearTimeout(debounce);
  debounce = setTimeout(() => void flush(), 250);
}

/* ---------- 공개 API ---------- */
function subscribeStore(fn: () => void) {
  start();
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function useData(): AppData {
  return useSyncExternalStore(subscribeStore, () => (start(), state), () => EMPTY);
}
export function useSession(): Session {
  return useSyncExternalStore(subscribeStore, () => (start(), session), () => SERVER_SESSION);
}
/** 화면에 데이터를 보여줘도 되는지 (서버 렌더/첫 로딩 중엔 false) */
export function useHydrated(): boolean {
  const s = useSession();
  return s.status === 'local' || s.status === 'ready';
}

/** 변경은 항상 이 함수로. 복사본을 고친 뒤 저장하고 화면에 알린다. */
export function update(fn: (draft: AppData) => void): boolean {
  start();
  const draft = structuredClone(state);
  fn(draft);
  state = draft;
  const ok = saveLocal();
  emit();
  scheduleFlush();
  return ok;
}

export function updateTrip(id: string, fn: (t: Trip) => void): boolean {
  return update((d) => {
    const t = d.trips.find((x) => x.id === id);
    if (t) fn(t);
  });
}

export function useTrip(id: string | undefined): Trip | undefined {
  const d = useData();
  return d.trips.find((t) => t.id === id);
}

/* ---------- 로그인 / 공간 ---------- */
const AUTH_ERR: Record<string, string> = {
  'Invalid login credentials': '이메일이나 비밀번호가 맞지 않아요.',
  'User already registered': '이미 가입된 이메일이에요. 로그인해주세요.',
  'Email not confirmed': '메일함에서 가입 확인 링크를 먼저 눌러주세요.',
};
const msg = (e: { message: string }) => AUTH_ERR[e.message] ?? (/password/i.test(e.message) ? '비밀번호는 6자 이상이어야 해요.' : e.message);

export async function signIn(email: string, password: string): Promise<string | null> {
  const { error } = await supabase!.auth.signInWithPassword({ email, password });
  return error ? msg(error) : null;
}
export async function signUp(email: string, password: string): Promise<string | null> {
  const { data, error } = await supabase!.auth.signUp({ email, password, options: { emailRedirectTo: window.location.origin } });
  if (error) return msg(error);
  if (!data.session) return 'confirm';
  return null;
}
export async function signOut() {
  await supabase?.auth.signOut();
}
export async function createCouple(myName: string, partnerName: string): Promise<string | null> {
  const names = { m: { name: myName || '민우' }, g: { name: partnerName || '여자친구' } };
  const { error } = await supabase!.rpc('create_couple', { p_names: names });
  if (error) return '공간을 만들지 못했어요. 잠시 뒤 다시 해주세요.';
  const { data } = await supabase!.auth.getUser();
  await connect(data.user?.id, data.user?.email);
  return null;
}
export async function joinCouple(code: string): Promise<string | null> {
  const { error } = await supabase!.rpc('join_couple', { p_code: code });
  if (error) {
    if (/invalid code/.test(error.message)) return '초대 코드가 맞지 않아요.';
    if (/full/.test(error.message)) return '이미 두 사람이 들어가 있는 공간이에요.';
    return '들어가지 못했어요. 잠시 뒤 다시 해주세요.';
  }
  const { data } = await supabase!.auth.getUser();
  await connect(data.user?.id, data.user?.email);
  return null;
}
