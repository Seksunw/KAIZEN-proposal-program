-- ============================================================
-- Migration 2026-09-10 — Storage bucket avatars (รูปโปรไฟล์ผู้ใช้)
-- รันไฟล์นี้ครั้งเดียวใน Supabase SQL editor บน project จริง (schema.sql ที่แก้ไว้แล้ว
-- คือ source of truth สำหรับ deploy ใหม่ตั้งแต่ต้น — ไฟล์นี้คือ diff สำหรับ project ที่มีอยู่แล้ว)
-- ปลอดภัยที่จะรันซ้ำได้ (idempotent) ทุกคำสั่ง
-- ============================================================

-- profiles.avatar_path มีอยู่แล้วในตารางเดิม (เตรียมไว้ตั้งแต่ schema แรก) — migration นี้เพิ่ม
-- แค่ bucket + policy เท่านั้น ไม่ต้อง alter table

insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', false)
on conflict (id) do nothing;

drop policy if exists avatars_read on storage.objects;
create policy avatars_read on storage.objects for select to authenticated
  using (bucket_id = 'avatars');

drop policy if exists avatars_insert on storage.objects;
create policy avatars_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists avatars_update on storage.objects;
create policy avatars_update on storage.objects for update to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists avatars_delete on storage.objects;
create policy avatars_delete on storage.objects for delete to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
