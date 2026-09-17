-- ============================================================
-- Migration 2026-09-12 — เจ้าของโครงการที่เป็นกรรมการของรอบเดียวกัน ไม่ต้องถูกนับเป็นคนที่
-- "ต้องส่งคะแนน" สำหรับโครงการของตัวเอง (Critical bug fix — deadlock ที่ pending_review)
-- รันไฟล์นี้ครั้งเดียวใน Supabase SQL editor บน project จริง (schema.sql ที่แก้ไว้แล้ว
-- คือ source of truth สำหรับ deploy ใหม่ตั้งแต่ต้น — ไฟล์นี้คือ diff สำหรับ project ที่มีอยู่แล้ว)
-- ปลอดภัยที่จะรันซ้ำได้ (idempotent)
--
-- บั๊กที่แก้: guard_kaizen_transition()'s เกต "→scored" และ submit_score()'s v_all_submitted
-- เดิมต้องการให้ "ทุกคน" ใน roster ของ committee_weights ส่งคะแนนครบ รวมเจ้าของโครงการเอง
-- ด้วยถ้าเขาเป็นกรรมการของรอบนั้น — แต่ระบบกันไว้แล้ว (ระดับ UI, §2.8/§2.9) ไม่ให้กรรมการ
-- ให้คะแนนโครงการของตัวเอง ทำให้โครงการแบบนี้ไม่มีทางไปถึง 'scored' ได้เลย ค้างที่
-- pending_review ตลอดกาล แม้ admin ก็บังคับสถานะนี้ตรงๆ ไม่ได้ (bypass เฉพาะ target
-- approved/need_revision/published เท่านั้น) — ดู Spec.md §4.8 (ตรวจสอบระบบ 2026-09-12)
--
-- ทางแก้ที่เลือก (ผู้ใช้ยืนยันแล้ว): ยกเว้นเจ้าของโครงการออกจาก roster ที่ต้องส่งคะแนน
-- "เฉพาะสำหรับโครงการของตัวเอง" เท่านั้น (เขายังต้องให้คะแนนโครงการคนอื่นในรอบเดียวกันตามปกติ)
-- สอดคล้องกับ design เดิมของ §2.9 ที่ยกน้ำหนักของเขาไปให้ director อยู่แล้ว
--
-- Edge case ที่ตั้งใจไม่จัดการเพิ่ม (ยอมรับเหมือนเคส "ไม่มี director" ใน §2.9): ถ้ารอบนั้นมี
-- กรรมการแค่คนเดียวคือเจ้าของโครงการเอง โครงการจะเข้า 'scored' ได้ทันทีโดยไม่มีใครให้คะแนนจริง
-- ============================================================

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

  -- Gate: → scored (กรรมการทุกคนในรอบ = keys ของ committee_weights ต้องส่งคะแนนครบ ★ ยกเว้น
  -- เจ้าของโครงการเอง ถ้าเขาเป็นกรรมการของรอบนี้ด้วย — ดูหมายเหตุเต็มด้านบนของไฟล์นี้)
  if new.status = 'scored' then
    select array(select jsonb_object_keys(committee_weights))
      into v_roster from evaluation_periods where id = new.period_id;
    select count(*) into v_missing
      from unnest(coalesce(v_roster, array[]::text[])) as committee_id
     where committee_id <> new.owner_id::text
       and not exists (
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

create or replace function public.submit_score(p_score_id uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_committee_user uuid;
  v_kaizen_id      uuid;
  v_period_id      uuid;
  v_status         text;
  v_is_locked      boolean;
  v_items          jsonb;
  v_missing_keys   text[];
  v_roster         text[];
  v_all_submitted  boolean;
  v_owner_id       uuid;
begin
  select committee_user_id, kaizen_id, period_id, status, is_locked, items
    into v_committee_user, v_kaizen_id, v_period_id, v_status, v_is_locked, v_items
    from committee_scores where id = p_score_id for update;

  if v_committee_user is null then
    raise exception 'Score not found';
  end if;
  if v_committee_user <> auth.uid() then
    raise exception 'You may only submit your own score';
  end if;
  if v_is_locked then
    raise exception 'Score is locked';
  end if;
  if v_status = 'submitted' then
    raise exception 'Score already submitted';
  end if;
  if public.period_status_of(v_period_id) not in ('open','scoring') then
    raise exception 'Period is not accepting scores';
  end if;

  select array(
    select code from unnest(public.criteria_codes()) as code where not (v_items ? code)
  ) into v_missing_keys;
  if coalesce(array_length(v_missing_keys,1),0) > 0 then
    raise exception 'Missing scores for: %', array_to_string(v_missing_keys, ', ');
  end if;

  update committee_scores set status = 'submitted', submitted_at = now() where id = p_score_id;

  insert into audit_log (actor_id, action, entity_type, entity_id, after)
  values (auth.uid(), 'submit_score', 'committee_scores', p_score_id,
          jsonb_build_object('kaizen_id', v_kaizen_id, 'period_id', v_period_id));

  select owner_id into v_owner_id from kaizen_projects where id = v_kaizen_id;

  select array(select jsonb_object_keys(committee_weights))
    into v_roster from evaluation_periods where id = v_period_id;

  -- ★ ยกเว้นเจ้าของโครงการเองออกจาก roster ที่ต้องส่งคะแนน — เหตุผลเดียวกับ
  -- guard_kaizen_transition()'s Gate: → scored (ดูหมายเหตุเต็มด้านบนของไฟล์นี้)
  v_all_submitted := coalesce(array_length(v_roster,1),0) > 0 and not exists (
    select 1 from unnest(v_roster) as committee_id
     where committee_id <> v_owner_id::text
       and not exists (
       select 1 from committee_scores cs
        where cs.kaizen_id = v_kaizen_id
          and cs.committee_user_id::text = committee_id
          and cs.status = 'submitted'
     )
  );

  if v_all_submitted then
    perform set_config('app.in_submit_score', 'on', true);
    update kaizen_projects set status = 'scored' where id = v_kaizen_id and status = 'pending_review';
  end if;
end $$;
