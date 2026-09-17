-- ============================================================
-- Migration 2026-09-12 — close_period() ต้องเช็ค "กรรมการให้คะแนนครบทุกโครงการ" ฝั่ง server
-- ด้วย ไม่ใช่แค่ disable ปุ่มฝั่ง client เท่านั้น (High bug fix — Spec.md §4.8 finding H4)
-- รันไฟล์นี้ครั้งเดียวใน Supabase SQL editor บน project จริง (schema.sql ที่แก้ไว้แล้ว
-- คือ source of truth สำหรับ deploy ใหม่ตั้งแต่ต้น — ไฟล์นี้คือ diff สำหรับ project ที่มีอยู่แล้ว)
-- ปลอดภัยที่จะรันซ้ำได้ (idempotent)
--
-- เช็คด้วยการนับโครงการที่ยังค้างที่ pending_review ในรอบนี้ — เทียบเท่ากับ "ยังมีคนให้คะแนน
-- ไม่ครบ" เพราะ guard_kaizen_transition()/submit_score() จะเลื่อนสถานะเป็น 'scored' ให้อัตโนมัติ
-- ทันทีที่ครบตามเงื่อนไขเสมอ ไม่มีทางค้างที่ pending_review ถ้าคะแนนครบจริงแล้ว
-- ============================================================

create or replace function public.close_period(p_period_id uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_status text;
  v_pending_count int;
begin
  if not public.is_admin() then
    raise exception 'Only admin can close a period';
  end if;

  select status into v_status from evaluation_periods where id = p_period_id for update;
  if v_status is null then
    raise exception 'Period not found';
  end if;
  if v_status not in ('open','scoring') then
    raise exception 'Only an open or scoring period can be closed';
  end if;

  select count(*) into v_pending_count from kaizen_projects
   where period_id = p_period_id and status = 'pending_review';
  if v_pending_count > 0 then
    raise exception 'Cannot close: % project(s) still pending committee review', v_pending_count;
  end if;

  update committee_scores set is_locked = true where period_id = p_period_id;

  perform set_config('app.in_period_rpc', 'on', true);
  update evaluation_periods set status = 'closed', closed_at = now() where id = p_period_id;

  insert into audit_log (actor_id, action, entity_type, entity_id)
  values (auth.uid(), 'period_close', 'evaluation_periods', p_period_id);
end $$;
