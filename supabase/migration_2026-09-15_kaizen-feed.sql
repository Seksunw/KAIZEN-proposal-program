-- ============================================================
-- Migration 2026-09-15 — เพิ่ม RLS ให้เห็นโครงการ KAIZEN ของคนอื่นได้ (สำหรับหน้า Feed ใหม่)
-- รันไฟล์นี้ครั้งเดียวใน Supabase SQL editor บน project จริง (schema.sql ที่แก้ไว้แล้ว
-- คือ source of truth สำหรับ deploy ใหม่ตั้งแต่ต้น — ไฟล์นี้คือ diff สำหรับ project ที่มีอยู่แล้ว)
-- ปลอดภัยที่จะรันซ้ำได้ (idempotent)
--
-- บริบท: เดิมหน้า "ผลการประเมิน" (leaderboard.js, route #/leaderboard/:periodCode) แสดงอันดับ/
-- คะแนนเฉพาะรอบที่ "ประกาศผลแล้ว" เท่านั้น (ตาม v_kaizen_results) พนักงานทั่วไปมองไม่เห็นโครงการ
-- ของคนอื่นเลยนอกจากนั้น (RLS เดิม: k_read_own + k_read_published + k_read_committee เฉพาะช่วง
-- ให้คะแนน) — ผู้ใช้ขอเปลี่ยนเป็นหน้า "Feed" แบบ social feed ให้ทุกคนเห็นโครงการที่ "ส่งแล้ว"
-- (submitted ขึ้นไป ไม่รวม draft) ของทุกคนได้เสมอ ไม่ต้องรอประกาศผล แต่ "ไม่โชว์คะแนน/อันดับ"
-- ในหน้านี้เลย (ตกลงกันไว้ชัดเจน) — v_kaizen_results/committee_scores/kaizen_progress_updates
-- ไม่ถูกแตะต้องเลย ยังคงกฎเดิมทุกประการ (คะแนนดูได้เฉพาะ published/admin เหมือนเดิม)
--
-- เพิ่ม 4 policy ใหม่แบบ additive (permissive OR เข้ากับ policy เดิม ไม่ได้แทนที่อะไร):
-- ============================================================

create policy k_read_feed on kaizen_projects for select to authenticated
  using (status <> 'draft');

create policy ka_read_feed on kaizen_attachments for select to authenticated
  using (exists (
    select 1 from kaizen_projects k where k.id = kaizen_attachments.kaizen_id and k.status <> 'draft'
  ));

create policy profiles_read_feed on profiles for select to authenticated
  using (exists (
    select 1 from kaizen_projects k where k.owner_id = profiles.id and k.status <> 'draft'
  ));

-- ★ พบระหว่างทดสอบสด — ka_read_feed เปิดแค่แถวเมทาดาต้า kaizen_attachments เท่านั้น ไฟล์รูปจริง
-- ใน storage bucket "kaizen-photos" เป็นคนละ RLS (storage.objects) ยังต้องเปิดแยกอีกจุด ไม่งั้น
-- signed URL ของรูปคนอื่นจะได้ 400 ทั้งที่แถว attachment เองอ่านได้แล้ว
create policy kaizen_photos_read_feed on storage.objects for select to authenticated
  using (
    bucket_id = 'kaizen-photos'
    and exists (
      select 1 from kaizen_projects k
       where k.id = (storage.foldername(name))[1]::uuid and k.status <> 'draft'
    )
  );
