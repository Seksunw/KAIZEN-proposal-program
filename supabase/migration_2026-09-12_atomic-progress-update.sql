-- Group 6 (atomicity) — kaizenProgress.js's onSaveProgress() เดิมทำ 2 คำสั่งแยกกันจากฝั่ง client
-- (insert kaizen_progress_updates แล้วค่อย update kaizen_projects.next_follow_up_date/status)
-- ถ้าคำสั่งแรกสำเร็จแต่คำสั่งที่สองล้มเหลว (เน็ตหลุด, ปิดแท็บกลางคัน, RLS/trigger ปฏิเสธ) จะได้
-- สถานะที่ไม่ตรงกัน: มี progress log บอกว่ารายงานความคืบหน้าไปแล้ว แต่ kaizen_projects ยังโชว์
-- next_follow_up_date/status เดิม — ย้ายทั้งคู่มาไว้ใน RPC เดียว (security definer) ให้ Postgres
-- รับประกัน atomicity ให้เอง (ทั้งสอง statement อยู่ใน transaction เดียวกันของ function call เดียว
-- ถ้า statement ไหนพัง ทั้งฟังก์ชัน rollback หมด) (Spec.md §4.8 backlog Low #6)
--
-- ★ ใช้ can_track_progress() ตัวเดียวกับที่ RLS policy kpu_insert/k_update_own ใช้อยู่แล้ว — ไม่ได้
-- คิด business rule ใหม่ แค่ย้ายมาบังคับซ้ำในฟังก์ชันนี้เพราะ security definer ข้าม RLS ไปเอง
-- ★ created_by มาจาก auth.uid() ตรงๆ ไม่รับเป็นพารามิเตอร์จาก client — กันสวมรอยว่าเป็นคนอื่น
-- (ของเดิมฝั่ง client ส่ง CreatedBy: session.user.id มาเอง ซึ่ง RLS เดิมก็บังคับให้ตรงกับ
-- auth.uid() อยู่แล้ว แต่ security definer ไม่ผ่าน RLS จึงต้องบังคับเองตรงนี้แทน)
create or replace function public.add_progress_update(
  p_kaizen_id uuid,
  p_note text,
  p_obstacles text,
  p_next_follow_up_date date
) returns kaizen_progress_updates
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_result kaizen_progress_updates;
begin
  if not public.can_track_progress(p_kaizen_id) then
    raise exception 'Not authorized to track progress on this KAIZEN project';
  end if;

  -- row lock กันแก้พร้อมกันสองที่ (เช่น admin เปลี่ยนสถานะ/ปิดรอบพอดีตอนเดียวกัน)
  perform 1 from kaizen_projects where id = p_kaizen_id for update;

  insert into kaizen_progress_updates (kaizen_id, note, obstacles, next_follow_up_date, created_by)
  values (p_kaizen_id, p_note, p_obstacles, p_next_follow_up_date, auth.uid())
  returning * into v_result;

  update kaizen_projects
  set next_follow_up_date = p_next_follow_up_date,
      status = case when status = 'submitted' then 'in_progress' else status end
  where id = p_kaizen_id;

  return v_result;
end;
$$;

-- ★ ไม่ต้อง grant execute แยก — "grant execute on all functions in schema public to authenticated"
-- ท้าย schema.sql ครอบฟังก์ชันนี้อยู่แล้ว (เหมือน RPC อื่นทั้งหมดในระบบ)
