-- Group 7 — need_revision หลังรอบปิดไปแล้ว: เจ้าของแก้ไขอะไรไม่ได้เลย
-- ------------------------------------------------------------------
-- บั๊กเดิม: k_update_own ใช้ period_status_of(period_id) in ('draft','open','scoring') เป็นเงื่อนไข
-- ร่วมกับทุก status รวมถึง need_revision ด้วย — ถ้ารอบของโครงการปิด/ประกาศผลไปแล้ว (ปกติมากเพราะ
-- กรรมการตีกลับให้แก้ระหว่างที่รอบยังเปิดอยู่ แต่ admin ปิดรอบก่อนเจ้าของจะแก้ทัน) เจ้าของจะแก้ไข
-- อะไรไม่ได้อีกเลย ทั้งที่สถานะยัง need_revision อยู่ — ไม่มีทางแก้ในระบบเดิมเลยนอกจาก admin เปิดรอบ
-- คืน (กระทบทุกโครงการในรอบ ไม่ใช่แค่โครงการนี้)
--
-- ★ ห้ามแก้โดยเปิด RLS กว้างๆ ตามสถานะเฉยๆ (เช่น "need_revision แก้ได้เสมอไม่ว่าจะรอบไหน") เพราะจะ
-- เปิดช่องแก้ไขโครงการเก่าย้อนหลังได้ไม่จำกัดเวลา — ทำเป็น "สิทธิ์แก้ไขชั่วคราวเฉพาะโครงการ" ที่
-- admin ต้องอนุมัติทีละโครงการ มีวันหมดอายุ มีเหตุผล มีบันทึกว่าใครให้/ให้เมื่อไหร่/หมดอายุเมื่อไหร่
-- และมี audit_log (Spec.md §4.8 backlog Low #7)

-- ------------------------------------------------------------------
-- 1) ตาราง kaizen_edit_grants — ประวัติสิทธิ์แก้ไขชั่วคราวทั้งหมด (ไม่ลบทิ้ง เก็บไว้เป็น audit trail)
-- ------------------------------------------------------------------
create table kaizen_edit_grants (
  id           uuid primary key default gen_random_uuid(),
  kaizen_id    uuid not null references kaizen_projects(id) on delete cascade,
  granted_by   uuid not null references profiles(id),
  granted_at   timestamptz not null default now(),
  expires_at   timestamptz not null,
  reason       text not null check (length(trim(reason)) > 0),
  revoked_at   timestamptz,        -- admin เพิกถอนก่อนหมดอายุได้ (กันเปิดผิดโครงการโดยไม่ตั้งใจ)
  revoked_by   uuid references profiles(id),
  check (expires_at > granted_at)
);
create index idx_keg_kaizen on kaizen_edit_grants(kaizen_id, expires_at);

alter table kaizen_edit_grants enable row level security;
alter table kaizen_edit_grants force row level security;

-- admin เห็น/จัดการได้ทุกแถว, เจ้าของโครงการเห็นได้เฉพาะแถวของโครงการตัวเอง (โชว์ banner ว่าได้รับ
-- สิทธิ์ชั่วคราวถึงเมื่อไหร่/เพราะอะไร) — insert/update (revoke) ทำได้เฉพาะ admin ผ่าน RPC เท่านั้น
create policy keg_read_admin on kaizen_edit_grants for select to authenticated
  using (public.is_admin());
create policy keg_read_own on kaizen_edit_grants for select to authenticated
  using (exists (select 1 from kaizen_projects k where k.id = kaizen_id and k.owner_id = auth.uid()));
create policy keg_write_admin on kaizen_edit_grants for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ------------------------------------------------------------------
-- 2) has_active_edit_grant() — ใช้ใน RLS ของ kaizen_projects (security definer ข้าม RLS ของตาราง
--    kaizen_edit_grants เอง ไม่งั้นวนกลับมาเช็คสิทธิ์อ่านตารางนี้ก่อนซึ่งไม่จำเป็น)
-- ------------------------------------------------------------------
create or replace function public.has_active_edit_grant(p_kaizen uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from kaizen_edit_grants g
     where g.kaizen_id = p_kaizen
       and g.revoked_at is null
       and now() between g.granted_at and g.expires_at
  );
$$;

-- ------------------------------------------------------------------
-- 3) k_update_own — เพิ่มเงื่อนไข "หรือมีสิทธิ์แก้ไขชั่วคราวที่ยังไม่หมดอายุ" ต่อจากเงื่อนไขเดิม
--    (ไม่ได้แทนที่เงื่อนไขเดิม แค่เปิดทางเพิ่มเฉพาะกรณีนี้) ยังคง owner_id = auth.uid() และ status
--    allow-list เดิมทุกอย่าง — โครงการอื่น/เจ้าของอื่น/ไม่มี grant ยังโดนบล็อกเหมือนเดิมทุกประการ
-- ------------------------------------------------------------------
drop policy k_update_own on kaizen_projects;
create policy k_update_own on kaizen_projects for update to authenticated
  using (
    owner_id = auth.uid()
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

-- ------------------------------------------------------------------
-- 4) grant_kaizen_edit_window() / revoke_kaizen_edit_grant() — RPC เดียวที่สร้าง/เพิกถอน grant ได้
--    (admin เท่านั้น) บังคับ precondition ว่าต้อง "ติดจริง" เท่านั้นถึงจะให้ grant ได้ กันเผลอกด
--    ให้สิทธิ์โครงการที่แก้ไขได้อยู่แล้วตามปกติ (Spec.md §4.8 backlog Low #7)
-- ------------------------------------------------------------------
create or replace function public.grant_kaizen_edit_window(
  p_kaizen_id uuid,
  p_reason text,
  p_hours int
) returns kaizen_edit_grants
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_status   text;
  v_period   uuid;
  v_result   kaizen_edit_grants;
begin
  if not public.is_admin() then
    raise exception 'Only admin can grant a temporary edit window';
  end if;
  if p_hours is null or p_hours < 1 or p_hours > 168 then
    raise exception 'Edit window must be between 1 and 168 hours';
  end if;
  if coalesce(trim(p_reason), '') = '' then
    raise exception 'A reason is required to grant a temporary edit window';
  end if;

  select status, period_id into v_status, v_period from kaizen_projects where id = p_kaizen_id for update;
  if v_status is null then
    raise exception 'KAIZEN project not found';
  end if;
  if v_status <> 'need_revision' then
    raise exception 'A temporary edit window can only be granted while status is need_revision';
  end if;
  if v_period is null or public.period_status_of(v_period) in ('draft','open','scoring') then
    raise exception 'This project is already editable normally — no edit window needed';
  end if;
  if public.has_active_edit_grant(p_kaizen_id) then
    raise exception 'This project already has an active edit window';
  end if;

  insert into kaizen_edit_grants (kaizen_id, granted_by, expires_at, reason)
  values (p_kaizen_id, auth.uid(), now() + (p_hours || ' hours')::interval, trim(p_reason))
  returning * into v_result;

  insert into audit_log (actor_id, action, entity_type, entity_id, after)
  values (auth.uid(), 'grant_kaizen_edit_window', 'kaizen_projects', p_kaizen_id,
          jsonb_build_object('reason', v_result.reason, 'expires_at', v_result.expires_at, 'grant_id', v_result.id));

  return v_result;
end $$;

create or replace function public.revoke_kaizen_edit_grant(p_grant_id uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_kaizen_id uuid;
begin
  if not public.is_admin() then
    raise exception 'Only admin can revoke a temporary edit window';
  end if;

  update kaizen_edit_grants set revoked_at = now(), revoked_by = auth.uid()
  where id = p_grant_id and revoked_at is null
  returning kaizen_id into v_kaizen_id;

  if v_kaizen_id is null then
    raise exception 'Edit grant not found or already revoked';
  end if;

  insert into audit_log (actor_id, action, entity_type, entity_id, after)
  values (auth.uid(), 'revoke_kaizen_edit_grant', 'kaizen_projects', v_kaizen_id,
          jsonb_build_object('grant_id', p_grant_id));
end $$;

-- ★ ไม่ต้อง grant execute แยก — "grant execute on all functions in schema public to authenticated"
-- ท้าย schema.sql ครอบฟังก์ชันทั้งสองนี้อยู่แล้ว
