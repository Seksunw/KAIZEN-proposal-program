-- ============================================================
-- Migration 2026-09-08 — ส่งเข้าคิวกรรมการได้แม้ยังไม่เสร็จงาน
-- รันไฟล์นี้ครั้งเดียวใน Supabase SQL editor บน project จริง (schema.sql ที่แก้ไว้แล้ว
-- คือ source of truth สำหรับ deploy ใหม่ตั้งแต่ต้น — ไฟล์นี้คือ diff สำหรับ project ที่มีอยู่แล้ว)
-- ปลอดภัยที่จะรันซ้ำได้ (idempotent) ทุกคำสั่ง
-- ============================================================

-- 1) ผ่อนเงื่อนไข → pending_review: ไม่บังคับ is_completed=true อีกต่อไป
--    (ยังบังคับ completion_date/after-photo/cost_saving_basis เหมือนเดิม "ถ้า" is_completed=true
--    ตอนเข้าคิวพอดี)
create or replace function public.guard_kaizen_transition() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_allowed text[];
  v_before  int;
  v_after   int;
  v_period_status text;
  v_deadline timestamptz;
  v_roster  text[];
  v_missing int;
begin
  if new.status = old.status then return new; end if;

  v_allowed := case old.status
    when 'draft'          then array['submitted']
    when 'submitted'      then array['in_progress','pending_review','draft']
    when 'in_progress'    then array['pending_review','need_revision']
    when 'pending_review' then array['scored','need_revision','in_progress']
    when 'scored'         then array['approved','need_revision']
    when 'approved'       then array['published','need_revision']
    when 'need_revision'  then array['draft','in_progress']
    when 'published'      then array[]::text[]
    else array[]::text[]
  end;

  if not (new.status = any(v_allowed)) then
    raise exception 'Illegal transition % -> %', old.status, new.status;
  end if;

  if new.status in ('approved','need_revision','published') and not public.is_admin() then
    raise exception 'Only admin can set status %', new.status;
  end if;
  if new.status = 'scored'
     and not public.is_admin()
     and current_setting('app.in_submit_score', true) is distinct from 'on' then
    raise exception 'status "scored" is set by submit_score() only';
  end if;

  if new.status = 'submitted' then
    if new.period_id is null then
      raise exception 'period_id is required to submit';
    end if;
    select status, submission_deadline into v_period_status, v_deadline
      from evaluation_periods where id = new.period_id;
    if v_period_status is distinct from 'open' then
      raise exception 'Submission requires an open evaluation period';
    end if;
    if v_deadline < now() then
      raise exception 'Submission deadline has passed';
    end if;
    select count(*) into v_before from kaizen_attachments
      where kaizen_id = new.id and phase = 'before';
    if v_before = 0 then
      raise exception 'At least one BEFORE photo is required';
    end if;
    if coalesce(new.title,'') = '' or coalesce(new.problem_description,'') = ''
       or coalesce(new.improvement_approach,'') = '' or cardinality(new.categories) = 0 then
      raise exception 'Required fields are incomplete';
    end if;
    new.submitted_at := now();
  end if;

  -- ★ เปลี่ยน: เช็คหลักฐานครบเฉพาะตอน is_completed=true เท่านั้น ไม่บังคับ is_completed อีกแล้ว
  if new.status = 'pending_review' and new.is_completed then
    if new.completion_date is null then
      raise exception 'completion_date is required';
    end if;
    select count(*) into v_after from kaizen_attachments
      where kaizen_id = new.id and phase = 'after';
    if v_after = 0 then
      raise exception 'At least one AFTER photo is required';
    end if;
    if coalesce(new.cost_saving_per_month,0) > 0 and new.cost_saving_basis is null then
      raise exception 'cost_saving_basis is required when cost_saving_per_month > 0';
    end if;
  end if;

  if new.status = 'scored' then
    select array(select jsonb_object_keys(committee_weights))
      into v_roster from evaluation_periods where id = new.period_id;
    select count(*) into v_missing
      from unnest(coalesce(v_roster, array[]::text[])) as committee_id
     where not exists (
       select 1 from committee_scores cs
        where cs.kaizen_id = new.id
          and cs.committee_user_id::text = committee_id
          and cs.status = 'submitted'
     );
    if coalesce(array_length(v_roster,1),0) = 0 or v_missing > 0 then
      raise exception 'All committee members for this period must submit their scores first';
    end if;
    new.scored_at := now();
  end if;

  if new.status in ('approved','need_revision') then
    new.decided_at := now();
  end if;
  if new.status = 'published' then
    new.published_at := now();
  end if;

  return new;
end $$;

-- 2) ใหม่: เช็ค "ต้องมีรูป after" ตอน is_completed เปลี่ยนเป็น true ไม่ว่าจะเกิดตอนไหน
--    (แยกจากข้อ 1 เพราะตอนนี้ is_completed อาจถูกตั้งทีหลัง หลัง status เป็น pending_review ไปแล้ว)
create or replace function public.guard_kaizen_completion() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_after int;
begin
  if new.is_completed and not old.is_completed then
    select count(*) into v_after from kaizen_attachments
      where kaizen_id = new.id and phase = 'after';
    if v_after = 0 then
      raise exception 'At least one AFTER photo is required to mark a project completed';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists trg_10b_guard_kaizen_completion on kaizen_projects;
create trigger trg_10b_guard_kaizen_completion before update of is_completed on kaizen_projects
  for each row execute function public.guard_kaizen_completion();

-- 3) ใหม่: ล็อกเนื้อหาหลักของโครงการตั้งแต่เข้าคิวกรรมการ (pending_review/scored/approved)
--    ยกเว้นคอลัมน์ที่เกี่ยวกับการติดตามความคืบหน้า/ทำเครื่องหมายเสร็จ ยังแก้ได้ต่อ
create or replace function public.guard_kaizen_field_lock() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_mutable text[] := array[
    'is_completed','completion_date','next_follow_up_date','responsible_user_id',
    'progress_pct','cost_saving_per_month','cost_saving_basis','confirmed_by_name',
    'status','submitted_at','scored_at','decided_at','published_at','revision_note',
    'updated_at','code','cost_saving_rank'
  ];
begin
  if old.status not in ('pending_review','scored','approved') or public.is_admin() then
    return new;
  end if;
  if (to_jsonb(old) - v_mutable) is distinct from (to_jsonb(new) - v_mutable) then
    raise exception 'Cannot edit KAIZEN content once it is in the committee review queue';
  end if;
  return new;
end $$;

drop trigger if exists trg_10c_guard_kaizen_field_lock on kaizen_projects;
create trigger trg_10c_guard_kaizen_field_lock before update on kaizen_projects
  for each row execute function public.guard_kaizen_field_lock();

-- 4) ใหม่: can_track_progress() — "ยังตามอัปเดตความคืบหน้า/ทำเครื่องหมายเสร็จได้ไหม"
--    แม้เข้าคิวกรรมการไปแล้ว (ใช้กับ attachments/progress_updates/storage เท่านั้น)
create or replace function public.can_track_progress(p_kaizen uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select public.is_admin() or exists (
    select 1 from kaizen_projects k
     where k.id = p_kaizen
       and k.owner_id = auth.uid()
       and k.is_completed = false
       and k.status in ('submitted','in_progress','pending_review','scored','approved','need_revision')
       and (k.period_id is null or public.period_status_of(k.period_id) in ('draft','open','scoring'))
  );
$$;

-- 5) แก้ policy k_update_own ให้ยอมรับการแก้ไข "ตอนยังไม่เสร็จ แม้เข้าคิวกรรมการแล้ว" ด้วย
--    (guard_kaizen_field_lock ข้างบนจะเป็นคนกันไม่ให้แก้เนื้อหาหลักหลุดออกไปแทน)
drop policy if exists k_update_own on kaizen_projects;
create policy k_update_own on kaizen_projects for update to authenticated
  using (
    owner_id = auth.uid()
    and (
      status in ('draft','submitted','in_progress','need_revision')
      or (is_completed = false and status in ('pending_review','scored','approved'))
    )
    and (period_id is null or public.period_status_of(period_id) in ('draft','open','scoring'))
  )
  with check (owner_id = auth.uid());

-- 6) เปิดให้ can_track_progress() ใช้แทน/ร่วมกับ can_write_kaizen() ใน attachments + progress
--    updates + storage
drop policy if exists ka_insert on kaizen_attachments;
create policy ka_insert on kaizen_attachments for insert to authenticated
  with check ((public.can_write_kaizen(kaizen_id) or public.can_track_progress(kaizen_id)) and uploaded_by = auth.uid());

drop policy if exists ka_update on kaizen_attachments;
create policy ka_update on kaizen_attachments for update to authenticated
  using (public.can_write_kaizen(kaizen_id) or public.can_track_progress(kaizen_id))
  with check (public.can_write_kaizen(kaizen_id) or public.can_track_progress(kaizen_id));

drop policy if exists ka_delete on kaizen_attachments;
create policy ka_delete on kaizen_attachments for delete to authenticated
  using (public.can_write_kaizen(kaizen_id) or public.can_track_progress(kaizen_id));

drop policy if exists kpu_insert on kaizen_progress_updates;
create policy kpu_insert on kaizen_progress_updates for insert to authenticated
  with check ((public.can_write_kaizen(kaizen_id) or public.can_track_progress(kaizen_id)) and created_by = auth.uid());

drop policy if exists kpu_update on kaizen_progress_updates;
create policy kpu_update on kaizen_progress_updates for update to authenticated
  using ((public.can_write_kaizen(kaizen_id) or public.can_track_progress(kaizen_id)) and created_by = auth.uid())
  with check ((public.can_write_kaizen(kaizen_id) or public.can_track_progress(kaizen_id)) and created_by = auth.uid());

drop policy if exists kaizen_photos_insert on storage.objects;
create policy kaizen_photos_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'kaizen-photos'
    and (public.can_write_kaizen((storage.foldername(name))[1]::uuid)
         or public.can_track_progress((storage.foldername(name))[1]::uuid))
  );

drop policy if exists kaizen_photos_update on storage.objects;
create policy kaizen_photos_update on storage.objects for update to authenticated
  using (
    bucket_id = 'kaizen-photos'
    and (public.can_write_kaizen((storage.foldername(name))[1]::uuid)
         or public.can_track_progress((storage.foldername(name))[1]::uuid))
  )
  with check (
    bucket_id = 'kaizen-photos'
    and (public.can_write_kaizen((storage.foldername(name))[1]::uuid)
         or public.can_track_progress((storage.foldername(name))[1]::uuid))
  );

drop policy if exists kaizen_photos_delete on storage.objects;
create policy kaizen_photos_delete on storage.objects for delete to authenticated
  using (
    bucket_id = 'kaizen-photos'
    and (public.can_write_kaizen((storage.foldername(name))[1]::uuid)
         or public.can_track_progress((storage.foldername(name))[1]::uuid))
  );
