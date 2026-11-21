-- 우리 여행: 두 사람이 함께 쓰는 데이터 구조
-- Supabase 대시보드 → SQL Editor → New query 에 전체를 붙여넣고 Run.
-- 여러 번 실행해도 안전하게 만들어져 있다.

-- 1) 커플(함께 쓰는 공간)
create table if not exists public.couples (
  id uuid primary key default gen_random_uuid(),
  invite_code text not null unique,
  names jsonb not null default '{"m":{"name":"민우"},"g":{"name":"여자친구"}}'::jsonb,
  created_at timestamptz not null default now()
);

-- 2) 공간에 속한 사람 (최대 2명). slot: 'm' = 먼저 만든 사람, 'g' = 초대받은 사람
create table if not exists public.members (
  user_id uuid primary key references auth.users (id) on delete cascade,
  couple_id uuid not null references public.couples (id) on delete cascade,
  slot text not null check (slot in ('m', 'g')),
  created_at timestamptz not null default now(),
  unique (couple_id, slot)
);

-- 3) 여행과 그 안의 모든 항목 (여행, 일정, 지출, 예약, 가볼 곳, 준비물)
create table if not exists public.items (
  couple_id uuid not null references public.couples (id) on delete cascade,
  id text not null,
  kind text not null check (kind in ('trip', 'plan', 'exp', 'book', 'wish', 'check')),
  trip_id text,
  data jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (couple_id, id)
);
create index if not exists items_trip_idx on public.items (couple_id, trip_id);

-- 내가 속한 공간 id
create or replace function public.my_couple() returns uuid
language sql stable security definer set search_path = public as $$
  select couple_id from public.members where user_id = auth.uid()
$$;

-- 보안 규칙: 자기 공간의 데이터만 읽고 쓸 수 있다
alter table public.couples enable row level security;
alter table public.members enable row level security;
alter table public.items enable row level security;

drop policy if exists couples_rw on public.couples;
create policy couples_rw on public.couples for all to authenticated
  using (id = public.my_couple()) with check (id = public.my_couple());

drop policy if exists members_read on public.members;
create policy members_read on public.members for select to authenticated
  using (user_id = auth.uid() or couple_id = public.my_couple());

drop policy if exists items_rw on public.items;
create policy items_rw on public.items for all to authenticated
  using (couple_id = public.my_couple()) with check (couple_id = public.my_couple());

-- 공간 만들기: 초대 코드를 돌려준다
create or replace function public.create_couple(p_names jsonb default null) returns text
language plpgsql security definer set search_path = public as $$
declare
  v_code text;
  v_id uuid;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  if exists (select 1 from members where user_id = auth.uid()) then
    select c.invite_code into v_code from couples c join members m on m.couple_id = c.id where m.user_id = auth.uid();
    return v_code;
  end if;
  loop
    v_code := upper(substr(translate(md5(random()::text || clock_timestamp()::text), '01', 'XY'), 1, 6));
    exit when not exists (select 1 from couples where invite_code = v_code);
  end loop;
  insert into couples (invite_code, names) values (v_code, coalesce(p_names, '{"m":{"name":"민우"},"g":{"name":"여자친구"}}'::jsonb))
    returning id into v_id;
  insert into members (user_id, couple_id, slot) values (auth.uid(), v_id, 'm');
  return v_code;
end $$;

-- 초대 코드로 들어가기
create or replace function public.join_couple(p_code text) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  select id into v_id from couples where invite_code = upper(trim(p_code));
  if v_id is null then raise exception 'invalid code'; end if;
  if exists (select 1 from members where user_id = auth.uid()) then raise exception 'already in a couple'; end if;
  if (select count(*) from members where couple_id = v_id) >= 2 then raise exception 'couple is full'; end if;
  insert into members (user_id, couple_id, slot) values (auth.uid(), v_id, 'g');
  return v_id;
end $$;

revoke all on function public.create_couple(jsonb) from public, anon;
revoke all on function public.join_couple(text) from public, anon;
grant execute on function public.create_couple(jsonb) to authenticated;
grant execute on function public.join_couple(text) to authenticated;

-- 실시간 반영
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'items') then
    alter publication supabase_realtime add table public.items;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'couples') then
    alter publication supabase_realtime add table public.couples;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'members') then
    alter publication supabase_realtime add table public.members;
  end if;
end $$;
