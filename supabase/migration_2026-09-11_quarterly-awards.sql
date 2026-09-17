-- ============================================================
-- Migration 2026-09-11 — ตาราง quarterly_awards (ประกาศผล Top 3 รางวัลใหญ่ข้ามรอบ)
-- รันไฟล์นี้ครั้งเดียวใน Supabase SQL editor บน project จริง (schema.sql ที่แก้ไว้แล้ว
-- คือ source of truth สำหรับ deploy ใหม่ตั้งแต่ต้น — ไฟล์นี้คือ diff สำหรับ project ที่มีอยู่แล้ว)
-- ปลอดภัยที่จะรันซ้ำได้ (idempotent) ทุกคำสั่ง
-- ดูมติเต็มที่ Spec.md §3 B15 / §2.11
-- ============================================================

create table if not exists quarterly_awards (
  id            uuid primary key default gen_random_uuid(),
  label         text not null,
  period_ids    jsonb not null default '[]',
  winners       jsonb not null default '[]',
  published_at  timestamptz not null default now(),
  created_by    uuid references profiles(id)
);

alter table quarterly_awards enable row level security;
alter table quarterly_awards force row level security;

drop policy if exists qa_read on quarterly_awards;
create policy qa_read on quarterly_awards for select to authenticated
  using (true);

drop policy if exists qa_insert_admin on quarterly_awards;
create policy qa_insert_admin on quarterly_awards for insert to authenticated
  with check (public.is_admin());

drop policy if exists qa_delete_admin on quarterly_awards;
create policy qa_delete_admin on quarterly_awards for delete to authenticated
  using (public.is_admin());
