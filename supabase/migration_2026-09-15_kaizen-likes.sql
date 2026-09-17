-- ============================================================
-- Migration 2026-09-15 — เพิ่มปุ่ม Like บนหน้า Feed (เก็บจริงใน DB ไม่ใช่แค่ UI toggle)
-- รันไฟล์นี้ครั้งเดียวใน Supabase SQL editor บน project จริง (schema.sql ที่แก้ไว้แล้ว
-- คือ source of truth สำหรับ deploy ใหม่ตั้งแต่ต้น — ไฟล์นี้คือ diff สำหรับ project ที่มีอยู่แล้ว)
-- ปลอดภัยที่จะรันซ้ำได้ (idempotent — ใช้ create table if not exists / drop policy if exists)
--
-- ทุกคนเห็นจำนวนไลค์/สถานะไลค์ของตัวเองเหมือนกัน อยู่ถาวรข้ามการรีโหลด — คนละเรื่องกับคะแนน
-- (committee_scores) เลย ไม่กระทบกฎ "ไม่โชว์คะแนนในหน้า Feed" ที่ตกลงกันไว้ก่อนหน้านี้เลย
-- ============================================================

create table if not exists kaizen_likes (
  kaizen_id  uuid not null references kaizen_projects(id) on delete cascade,
  user_id    uuid not null references profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (kaizen_id, user_id)
);

alter table kaizen_likes enable row level security;
alter table kaizen_likes force row level security;

drop policy if exists kl_read on kaizen_likes;
create policy kl_read on kaizen_likes for select to authenticated
  using (exists (select 1 from kaizen_projects k where k.id = kaizen_id and k.status <> 'draft'));

drop policy if exists kl_insert_own on kaizen_likes;
create policy kl_insert_own on kaizen_likes for insert to authenticated
  with check (
    user_id = auth.uid()
    and exists (select 1 from kaizen_projects k where k.id = kaizen_id and k.status <> 'draft')
  );

drop policy if exists kl_delete_own on kaizen_likes;
create policy kl_delete_own on kaizen_likes for delete to authenticated
  using (user_id = auth.uid());
