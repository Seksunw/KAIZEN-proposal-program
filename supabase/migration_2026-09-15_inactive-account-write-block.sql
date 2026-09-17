-- ============================================================
-- Migration 2026-09-15 — บัญชีที่ is_active=false (รออนุมัติ หรือถูกปิดใช้งาน) ยังสร้าง/แก้/ส่ง
-- โครงการ KAIZEN ได้ปกติ (Critical bug fix — RLS gap)
-- รันไฟล์นี้ครั้งเดียวใน Supabase SQL editor บน project จริง (schema.sql ที่แก้ไว้แล้ว
-- คือ source of truth สำหรับ deploy ใหม่ตั้งแต่ต้น — ไฟล์นี้คือ diff สำหรับ project ที่มีอยู่แล้ว)
-- ปลอดภัยที่จะรันซ้ำได้ (idempotent)
--
-- บั๊กที่แก้: พบระหว่างทดสอบ registration flow (2026-09-14) — หน้า dashboard.js โชว์ข้อความ
-- "บัญชีของคุณยังไม่ถูกเปิดใช้งาน กรุณาติดต่อผู้ดูแลระบบ" ให้บัญชีที่ is_active=false แต่นั่นเป็นแค่
-- ข้อความ UI เท่านั้น — RLS จริง (k_insert_own, k_update_own, can_write_kaizen(),
-- can_track_progress()) และ RPC submit_kaizen() ไม่มีจุดไหนเช็ค is_active เลยแม้แต่จุดเดียว
-- (ต่างจาก is_admin()/is_committee() ที่เช็คมาตั้งแต่ต้น) ทดสอบยืนยันแล้วว่าบัญชีที่เพิ่งสมัครและ
-- ยังไม่ถูกอนุมัติสามารถ insert แถว kaizen_projects (status='draft') ผ่าน client โดยตรงได้จริง
--
-- ทางแก้: เพิ่มฟังก์ชัน is_active_user() (สไตล์เดียวกับ is_admin()/is_committee()) แล้วเสียบเข้า
-- ทุกจุดที่เป็นเส้นทางเขียนของเจ้าของโครงการ (ไม่แตะ read policy ใดๆ — บัญชีที่ถูกปิดใช้งานภายหลัง
-- ยังควรอ่านประวัติโครงการเดิมของตัวเองได้ตามปกติ, ไม่แตะ k_delete_own เช่นกันเพราะการลบร่างของ
-- ตัวเองไม่ใช่การ "กระทำการในฐานะสมาชิกที่ active" แบบเดียวกับ insert/update/submit)
-- ============================================================

create or replace function public.is_active_user() returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce((select is_active from profiles where id = auth.uid()), false);
$$;

create or replace function public.can_write_kaizen(p_kaizen uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select public.is_admin() or exists (
    select 1 from kaizen_projects k
     where k.id = p_kaizen
       and k.owner_id = auth.uid()
       and k.status in ('draft','submitted','in_progress','need_revision')
       and (k.period_id is null or public.period_status_of(k.period_id) in ('draft','open','scoring'))
       and public.is_active_user()
  );
$$;

create or replace function public.can_track_progress(p_kaizen uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select public.is_admin() or exists (
    select 1 from kaizen_projects k
     where k.id = p_kaizen
       and k.owner_id = auth.uid()
       and k.is_completed = false
       and k.status in ('submitted','in_progress','pending_review','scored','approved','need_revision')
       and (k.period_id is null or public.period_status_of(k.period_id) in ('draft','open','scoring'))
       and public.is_active_user()
  );
$$;

drop policy if exists k_insert_own on kaizen_projects;
create policy k_insert_own on kaizen_projects for insert to authenticated
  with check (owner_id = auth.uid() and status = 'draft' and public.is_active_user());

drop policy if exists k_update_own on kaizen_projects;
create policy k_update_own on kaizen_projects for update to authenticated
  using (
    owner_id = auth.uid()
    and public.is_active_user()
    and (
      status in ('draft','submitted','in_progress','need_revision')
      or (is_completed = false and status in ('pending_review','scored','approved'))
    )
    and (
      period_id is null
      or public.period_status_of(period_id) in ('draft','open','scoring')
      or public.has_active_edit_grant(id)
    )
  )
  with check (owner_id = auth.uid());

-- ★ security definer ข้าม RLS ของ kaizen_projects เอง (แม้ force row level security ก็ตาม เพราะ
-- ฟังก์ชันนี้รันด้วยสิทธิ์ผู้สร้าง/superuser) เช็ค is_active_user() ที่เพิ่มใน k_insert_own/k_update_own
-- ข้างบนจึงไม่ครอบคลุมเส้นทางนี้ ต้องเช็คซ้ำตรงนี้เอง
create or replace function public.submit_kaizen(p_kaizen_id uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_owner  uuid;
  v_status text;
begin
  if not public.is_active_user() then
    raise exception 'บัญชีของคุณยังไม่ถูกเปิดใช้งาน — ไม่สามารถส่งโครงการได้';
  end if;

  select owner_id, status into v_owner, v_status
    from kaizen_projects where id = p_kaizen_id for update;
  if v_owner is null then
    raise exception 'KAIZEN project not found';
  end if;
  if v_owner <> auth.uid() then
    raise exception 'Only the owner may submit this project';
  end if;
  if v_status <> 'draft' then
    raise exception 'Only a draft project can be submitted';
  end if;

  update kaizen_projects set status = 'submitted' where id = p_kaizen_id;

  insert into audit_log (actor_id, action, entity_type, entity_id)
  values (auth.uid(), 'submit_kaizen', 'kaizen_projects', p_kaizen_id);
end $$;
