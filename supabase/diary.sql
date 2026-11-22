-- 여행 기록(사진·일기) 켜기. 이미 schema.sql을 실행해둔 경우 이 파일만 실행하면 된다.
-- Supabase 대시보드 → SQL Editor → New query 에 붙여넣고 Run. 여러 번 실행해도 안전하다.

-- 1) items에 'memo'(여행 기록) 종류 허용
alter table public.items drop constraint if exists items_kind_check;
alter table public.items add constraint items_kind_check
  check (kind in ('trip', 'plan', 'exp', 'book', 'wish', 'check', 'memo'));

-- 2) 사진 저장소 (비공개). 파일 경로: <공간 id>/<여행 id>/<사진 id>.jpg
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('photos', 'photos', false, 5242880, array['image/jpeg', 'image/webp'])
on conflict (id) do nothing;

-- 3) 자기 공간 폴더의 사진만 보고 올리고 지울 수 있다
drop policy if exists photos_rw on storage.objects;
create policy photos_rw on storage.objects for all to authenticated
  using (bucket_id = 'photos' and (storage.foldername(name))[1] = public.my_couple()::text)
  with check (bucket_id = 'photos' and (storage.foldername(name))[1] = public.my_couple()::text);
