-- ================================================================
-- KAIZEN Proposal Program — MVP schema
-- Suntory Wellness · generated from Spec.md §5.1 (2026-09-07)
-- Run once, top to bottom, in the Supabase SQL editor of a fresh project.
-- ================================================================

-- ============================================================
-- 0. extensions
-- ============================================================
create extension if not exists pgcrypto;
create extension if not exists pg_trgm;

-- ============================================================
-- 1. profiles  (1:1 กับ auth.users)
-- ============================================================
create table profiles (
  id              uuid primary key references auth.users(id) on delete cascade,
  employee_id     text not null unique,
  full_name       text not null,
  full_name_en    text,
  email           text not null unique,
  department      text not null,               -- FK เชิงตรรกะ → master_data(type='department', code)
  plant           text not null,               -- FK เชิงตรรกะ → master_data(type='plant', code)
  roles           text[] not null default '{employee}',   -- subset of employee|committee|admin
  committee_role  text,                        -- FK เชิงตรรกะ → master_data(type='committee_role', code)
  preferred_lang  text not null default 'th' check (preferred_lang in ('th','en')),
  avatar_path     text,
  is_active       boolean not null default false,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index idx_profiles_dept on profiles(department);
create index idx_profiles_plant on profiles(plant);

-- ============================================================
-- 2. master_data  (แทน plants/departments/committee_roles/
--    budget_bands/cost_saving_bands ทั้งหมด — คั่นด้วย `type`)
-- ============================================================
create table master_data (
  id          uuid primary key default gen_random_uuid(),
  type        text not null check (type in
                ('department','plant','committee_role','budget_band','cost_saving_band')),
  code        text not null,
  label_th    text not null,
  label_en    text not null,
  extra       jsonb not null default '{}',
  -- extra ตัวอย่างตาม type:
  --   committee_role:   {"default_weight_pct": 30}
  --   budget_band:      {"min": 100000, "max": 499999}
  --   cost_saving_band: {"rank": 4, "min": 50000, "max": 99999}
  sort_order  int not null default 0,
  is_active   boolean not null default true,
  unique (type, code)
);

-- ============================================================
-- 3. evaluation_periods
--    (person_weighted เท่านั้นใน v1 → เก็บน้ำหนักตรง ๆ เป็น jsonb
--     {user_id: weight_pct} แทนตาราง period_committees)
-- ============================================================
create table evaluation_periods (
  id                  uuid primary key default gen_random_uuid(),
  code                text not null unique,             -- '2026-10'
  name_th             text not null,
  name_en             text,
  period_start        date not null,
  period_end          date not null,
  submission_deadline timestamptz not null,
  status              text not null default 'draft'
                        check (status in ('draft','open','scoring','closed','published')),
  committee_weights   jsonb not null default '{}',       -- {"<user_id>": 30, ...} รวมต้อง = 100 ตอน open
  -- true = โครงการที่ is_completed=false จะไม่มี rank_overall (แต่ยัง weighted_score ให้ดูเป็น
  -- feedback ได้) ใน v_kaizen_results ของรอบนี้ — เพิ่มทีหลัง (2026-09-11) ค่า default true มีผล
  -- กับรอบที่สร้างใหม่เท่านั้น รอบเก่าที่ publish ไปแล้วก่อนหน้านี้ถูก migration ตั้งเป็น false
  -- ไว้ให้ตั้งใจ กันอันดับที่เคยประกาศไปแล้วเปลี่ยนย้อนหลัง (ดู Spec.md §3 B13)
  rank_requires_completion boolean not null default true,
  opened_at   timestamptz, closed_at timestamptz, published_at timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create unique index uq_period_single_open on evaluation_periods((status)) where status = 'open';

-- ============================================================
-- 4. kaizen_projects
--    (ดูดรวม categories/impacts/support_needs/team_members
--     เป็น array/jsonb แทนตารางลูก)
-- ============================================================
create table kaizen_projects (
  id                    uuid primary key default gen_random_uuid(),
  code                  text unique,                     -- 'KZN-202610-0007' เติมตอน submit
  owner_id              uuid not null references profiles(id),
  period_id             uuid references evaluation_periods(id),
  department            text not null,
  plant                 text not null,
  project_type          text not null check (project_type in ('individual','group')),
  team_members          jsonb not null default '[]',     -- [{"employee_id":"..","full_name":".."}]

  title                 text not null,
  title_en              text,
  problem_description   text,
  problem_description_en text,
  categories            text[] not null default '{}',    -- safety|quality|productivity|cost|environment|communication|work_environment|other
  category_other        text,
  impacts               text[] not null default '{}',    -- safety|quality|cost|delivery|productivity|environment
  improvement_approach  text,
  improvement_approach_en text,
  support_needed        text[] not null default '{}',    -- equipment|budget|man_power|time|other
  support_other         text,

  budget_band           text,                             -- FK เชิงตรรกะ → master_data(type='budget_band', code)
  cost_saving_per_month numeric(14,2),
  cost_saving_basis     text,
  cost_saving_rank      int check (cost_saving_rank between 1 and 5),   -- เติมโดย trigger

  is_completed          boolean not null default false,
  start_date            date,
  completion_date       date,
  next_follow_up_date   date,
  responsible_user_id   uuid references profiles(id),
  progress_pct          int not null default 0 check (progress_pct between 0 and 100),
  confirmed_by_name     text,

  status                text not null default 'draft' check (status in
                          ('draft','submitted','in_progress','pending_review',
                           'scored','approved','need_revision','published')),
  submitted_at timestamptz, scored_at timestamptz, decided_at timestamptz, published_at timestamptz,
  revision_note text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint k_dates    check (completion_date is null or start_date is null or completion_date >= start_date),
  constraint k_completed check (not is_completed or completion_date is not null),
  constraint k_cs_basis check (coalesce(cost_saving_per_month,0) = 0 or cost_saving_basis is not null)
);
create index idx_k_owner  on kaizen_projects(owner_id);
create index idx_k_period on kaizen_projects(period_id);
create index idx_k_status on kaizen_projects(status);
create index idx_k_followup on kaizen_projects(next_follow_up_date)
  where is_completed = false and status not in ('draft','published');

-- ============================================================
-- 5. kaizen_attachments
-- ============================================================
create table kaizen_attachments (
  id            uuid primary key default gen_random_uuid(),
  kaizen_id     uuid not null references kaizen_projects(id) on delete cascade,
  phase         text not null check (phase in ('before','during','after','evidence')),
  storage_path  text not null unique,          -- bucket: kaizen-photos, path: {kaizen_id}/{phase}/{uuid}.{ext}
  file_name     text not null,
  -- ★ จำกัดเฉพาะ raster image type ที่ resizeImage()/<img> แสดงผลได้แน่นอนทุก browser — กัน
  -- svg (แฝง <script> ได้) และ type แปลกๆ ที่ client ส่งมาโดยไม่ผ่าน UI ปกติ (Spec.md §4.8 Low #5)
  mime_type     text not null check (mime_type in ('image/jpeg', 'image/png', 'image/webp', 'image/gif')),
  size_bytes    bigint not null check (size_bytes > 0 and size_bytes <= 20971520),  -- 20MB
  caption       text,
  caption_en    text,
  sort_order    int not null default 0,
  uploaded_by   uuid references profiles(id),
  created_at    timestamptz not null default now()
);
create index idx_ka_kaizen on kaizen_attachments(kaizen_id, phase, sort_order);

-- ============================================================
-- 6. kaizen_progress_updates
--    หมายเหตุ MVP: ไม่มี trigger sync ขึ้น kaizen_projects อัตโนมัติ
--    (ตัดออกเทียบกับ full design) — view/ฟอร์ม kaizenProgress.js
--    ต้องเขียน progress_pct / next_follow_up_date กลับขึ้น kaizen_projects เอง
--    ในการเรียก update() เดียวกัน (ไม่ auto-advance status ด้วย)
-- ============================================================
create table kaizen_progress_updates (
  id                  uuid primary key default gen_random_uuid(),
  kaizen_id           uuid not null references kaizen_projects(id) on delete cascade,
  update_date         date not null default current_date,
  progress_pct        int check (progress_pct between 0 and 100),
  note                text not null,
  obstacles           text,
  next_follow_up_date date,
  created_by          uuid not null references profiles(id),
  created_at          timestamptz not null default now()
);
create index idx_kpu_kaizen on kaizen_progress_updates(kaizen_id, update_date desc);

-- ============================================================
-- 6b. kaizen_edit_grants — สิทธิ์แก้ไขชั่วคราวเฉพาะโครงการ (Group 7, 2026-09-12) ให้เจ้าของแก้ไข
--     โครงการ need_revision ต่อได้แม้รอบปิดไปแล้ว โดย admin ต้องอนุมัติทีละโครงการ มีวันหมดอายุ
--     เสมอ ไม่ใช่เปิด RLS กว้างๆ ตามสถานะ (ดู has_active_edit_grant()/k_update_own ด้านล่าง และ
--     grant_kaizen_edit_window()/revoke_kaizen_edit_grant() RPC — Spec.md §4.8 backlog Low #7)
-- ============================================================
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

-- ============================================================
-- 7. committee_scores  (แทน scores + score_items รวมกัน —
--    คะแนนรายเกณฑ์เก็บใน items jsonb คีย์ = criterion code)
-- ============================================================
create table committee_scores (
  id                uuid primary key default gen_random_uuid(),
  period_id         uuid not null references evaluation_periods(id),
  kaizen_id         uuid not null references kaizen_projects(id) on delete cascade,
  committee_user_id uuid not null references profiles(id),
  items             jsonb not null default '{}',
  -- items ตัวอย่าง: {"safety":4,"quality":3,"productivity":5,"cost":3,"apply":4,"gemba":4,"communication":5}
  -- คีย์ต้องตรงกับ CRITERIA codes ใน js/constants.js เท่านั้น (ตรวจในแอปฝั่ง client + trigger ฝั่ง DB)
  raw_sum           int not null default 0,     -- sync อัตโนมัติจาก items โดย trigger
  overall_comment   text,
  status            text not null default 'draft' check (status in ('draft','submitted')),
  submitted_at      timestamptz,
  is_locked         boolean not null default false,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (period_id, kaizen_id, committee_user_id)
);
create index idx_cs_kaizen on committee_scores(kaizen_id);
create index idx_cs_committee on committee_scores(committee_user_id, period_id);

-- ============================================================
-- 8. audit_log  (generic — แทน kaizen_status_history + audit เดิม)
-- ============================================================
create table audit_log (
  id          bigserial primary key,
  actor_id    uuid references profiles(id),
  action      text not null,        -- 'submit_kaizen','submit_score','period_open','period_close','period_publish','status_change'
  entity_type text not null,        -- 'kaizen_projects' | 'evaluation_periods' | 'committee_scores'
  entity_id   uuid,
  before      jsonb,
  after       jsonb,
  created_at  timestamptz not null default now()
);
create index idx_al_entity on audit_log(entity_type, entity_id, created_at desc);

-- ============================================================
-- 9. quarterly_awards — ประกาศผล Top 3 รางวัลใหญ่ที่รวมข้ามหลายรอบ (2026-09-11 — Spec.md §3 B15)
--    ตั้งใจ "snapshot ตอนประกาศ" ไม่ใช่คำนวณสดเหมือน v_kaizen_results — กันผลที่ประกาศไปแล้ว
--    เปลี่ยนย้อนหลังถ้ามีคนแก้ is_completed/คะแนนของโครงการที่เคยติดอันดับทีหลัง (ต่างจาก
--    leaderboard ปกติที่ยอมรับ trade-off นี้อยู่แล้วตาม B5 — อันนี้เป็น "ประกาศทางการ" ควร freeze)
-- ============================================================
create table quarterly_awards (
  id            uuid primary key default gen_random_uuid(),
  label         text not null,                  -- เช่น "ไตรมาส 4/2569"
  period_ids    jsonb not null default '[]',     -- ["<period_id>", ...] รอบที่นำมารวมตอนประกาศ
  winners       jsonb not null default '[]',     -- [{"kaizen_id":"..","rank":1,"weighted_score":85.71}, ...] อันดับ 1-3
  published_at  timestamptz not null default now(),
  created_by    uuid references profiles(id)
);

-- ============================================================
-- 10. kaizen_likes — กดไลค์โครงการในหน้า Feed (2026-09-15) — เก็บจริง ไม่ใช่แค่ UI toggle,
--     ทุกคนเห็นจำนวน/สถานะเดียวกัน อยู่ถาวรข้ามการรีโหลด ไม่มี "คะแนน" เกี่ยวข้อง (คนละเรื่องกับ
--     committee_scores) primary key คู่ (kaizen_id, user_id) บังคับ "1 คนไลค์ได้ 1 ครั้งต่อโครงการ"
--     ในตัวเอง ไม่ต้อง unique constraint แยก
-- ============================================================
create table kaizen_likes (
  kaizen_id  uuid not null references kaizen_projects(id) on delete cascade,
  user_id    uuid not null references profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (kaizen_id, user_id)
);

-- ================================================================
-- Helper functions (stable, security definer — ดู docs/03-rls-policies.md §1
-- ข้อ 3 สำหรับเหตุผลที่ต้องใช้ security definer แทน security invoker:
-- ป้องกัน "infinite recursion detected in policy" เมื่อ policy ของตารางหนึ่ง
-- ต้องอ่านอีกตารางที่มี RLS ด้วยเงื่อนไขเดียวกัน)
-- ★ เพราะ security definer ข้าม RLS ของตารางที่อ่านเอง เงื่อนไขในนี้ต้อง
--   "ครบเท่ากับ" policy จริงของตารางแม่เสมอ (ดู can_read_kaizen ↔ k_read_*)
-- ================================================================
create or replace function public.criteria_codes() returns text[]
language sql immutable as $$
  select array['safety','quality','productivity','cost','apply','gemba','communication'];
$$;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from profiles where id = auth.uid() and is_active and 'admin' = any(roles)
  );
$$;

create or replace function public.is_committee() returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from profiles where id = auth.uid() and is_active and 'committee' = any(roles)
  );
$$;

-- บัญชีนี้เปิดใช้งานอยู่หรือไม่ (ยังไม่รอ admin อนุมัติ หรือยังไม่ถูกปิดใช้งาน) — ★ ใช้กันช่องโหว่ที่
-- k_insert_own/k_update_own/can_write_kaizen/can_track_progress/submit_kaizen เดิมไม่ได้เช็คเรื่องนี้
-- เลยแม้แต่จุดเดียว ทำให้บัญชีที่ is_active=false (รออนุมัติ หรือถูกปิดใช้งาน) ยังสร้าง/แก้/ส่ง
-- โครงการ KAIZEN ได้ปกติ ทั้งที่หน้า dashboard.js โชว์ข้อความบล็อกไว้ — ข้อความนั้นเป็นแค่ UI ไม่ใช่
-- การบังคับจริง (2026-09-15, พบระหว่างทดสอบ registration flow)
create or replace function public.is_active_user() returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce((select is_active from profiles where id = auth.uid()), false);
$$;

create or replace function public.period_status_of(p_period uuid) returns text
language sql stable security definer set search_path = public, pg_temp as $$
  select status from evaluation_periods where id = p_period;
$$;

-- กรรมการนี้ "อยู่ในรอบ" หรือไม่ — v1 ไม่มี period_committees/committee_assignments
-- แยกต่างหาก จึงใช้ key ใน evaluation_periods.committee_weights เป็น roster ตรง ๆ
create or replace function public.is_period_committee(p_period uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select public.is_committee()
     and exists (
       select 1 from evaluation_periods ep
        where ep.id = p_period and ep.committee_weights ? auth.uid()::text
     );
$$;

-- KAIZEN นี้อ่านได้หรือไม่ — ★ ต้องตรงกับ k_read_* ทุกข้อ (ดูหมายเหตุด้านบน)
create or replace function public.can_read_kaizen(p_kaizen uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from kaizen_projects k
     where k.id = p_kaizen
       and (
         public.is_admin()
         or k.owner_id = auth.uid()
         or k.status = 'published'
         or (
           k.period_id is not null
           and public.is_period_committee(k.period_id)
           and k.status in ('pending_review','scored','approved','need_revision','published')
         )
       )
  );
$$;

-- KAIZEN นี้แก้ได้หรือไม่ — ★ ต้องตรงกับ k_update_own (เฉพาะ branch แรก — ก่อนเข้าคิวกรรมการ)
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

-- KAIZEN นี้ "ยังตามอัปเดตความคืบหน้า/ทำเครื่องหมายเสร็จ" ได้ไหม แม้เข้าคิวกรรมการไปแล้ว —
-- ★ ต้องตรงกับ branch ที่สองของ k_update_own — ใช้กับ kaizen_attachments/kaizen_progress_updates/
-- storage เท่านั้น (ไม่ใช่แก้เนื้อหาหลัก — ตัวนั้นถูกล็อกไว้แล้วโดย guard_kaizen_field_lock trigger)
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

-- โครงการนี้มีสิทธิ์แก้ไขชั่วคราว (kaizen_edit_grants) ที่ยังไม่หมดอายุ/ไม่ถูกเพิกถอนอยู่ไหม —
-- ★ ใช้ใน k_update_own เท่านั้น (ทางเดียวที่เปิดแก้ไขโครงการ need_revision ที่รอบปิดไปแล้วได้)
-- security definer เพราะข้าม RLS ของ kaizen_edit_grants เอง (Spec.md §4.8 backlog Low #7)
create or replace function public.has_active_edit_grant(p_kaizen uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from kaizen_edit_grants g
     where g.kaizen_id = p_kaizen
       and g.revoked_at is null
       and now() between g.granted_at and g.expires_at
  );
$$;

-- ============================================================
-- Triggers
-- ============================================================

-- touch_updated_at() — ทุกตารางที่มี updated_at
create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

create trigger trg_00_touch_updated_at before update on profiles
  for each row execute function public.touch_updated_at();
create trigger trg_00_touch_updated_at before update on evaluation_periods
  for each row execute function public.touch_updated_at();
create trigger trg_00_touch_updated_at before update on kaizen_projects
  for each row execute function public.touch_updated_at();
create trigger trg_00_touch_updated_at before update on committee_scores
  for each row execute function public.touch_updated_at();

-- handle_new_user() — after insert auth.users → insert profiles จาก raw_user_meta_data
-- ★ register.js ต้องส่ง employee_id/full_name/department/plant มาใน signUp(options.data)
--   เสมอ ไม่งั้น insert profiles ล้มเหลว (not-null) และ auth.users จะ rollback ไปด้วย
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  insert into public.profiles (
    id, employee_id, full_name, full_name_en, email, department, plant, preferred_lang
  ) values (
    new.id,
    new.raw_user_meta_data ->> 'employee_id',
    coalesce(new.raw_user_meta_data ->> 'full_name', new.email),
    new.raw_user_meta_data ->> 'full_name_en',
    new.email,
    new.raw_user_meta_data ->> 'department',
    new.raw_user_meta_data ->> 'plant',
    coalesce(new.raw_user_meta_data ->> 'preferred_lang', 'th')
  );
  return new;
end $$;

create trigger trg_handle_new_user after insert on auth.users
  for each row execute function public.handle_new_user();

-- guard_profile_fields() — กันผู้ใช้แก้ฟิลด์ที่ต้องให้ Admin คุมเท่านั้น
create or replace function public.guard_profile_fields() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not public.is_admin() then
    if new.employee_id   is distinct from old.employee_id
    or new.department     is distinct from old.department
    or new.plant           is distinct from old.plant
    or new.roles           is distinct from old.roles
    or new.committee_role  is distinct from old.committee_role
    or new.is_active        is distinct from old.is_active then
      raise exception 'Only admin can change employee_id / department / plant / roles / committee_role / is_active';
    end if;
  end if;
  return new;
end $$;

create trigger trg_guard_profile_fields before update on profiles
  for each row execute function public.guard_profile_fields();

-- set_cost_saving_rank() — lookup master_data(type='cost_saving_band'); คำแนะนำเท่านั้น (D2)
create or replace function public.set_cost_saving_rank() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_rank int;
begin
  if coalesce(new.cost_saving_per_month, 0) <= 0 then
    new.cost_saving_rank := null;
    return new;
  end if;

  select (extra ->> 'rank')::int into v_rank
    from master_data
   where type = 'cost_saving_band'
     and is_active
     and new.cost_saving_per_month >= coalesce((extra ->> 'min')::numeric, 0)
     and (extra ->> 'max' is null or new.cost_saving_per_month <= (extra ->> 'max')::numeric)
   order by (extra ->> 'rank')::int desc
   limit 1;

  new.cost_saving_rank := v_rank;
  return new;
end $$;

create trigger trg_set_cost_saving_rank
  before insert or update of cost_saving_per_month on kaizen_projects
  for each row execute function public.set_cost_saving_rank();

-- guard_kaizen_transition() — state machine ตาม docs/01-architecture.md §2
-- (ไม่มี committee_assignments ใน v1 → gate 'scored' เทียบกับ roster =
--  keys ของ evaluation_periods.committee_weights แทน)
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

  -- คำตัดสินเป็นของ Admin เท่านั้น ยกเว้น 'scored' ที่ submit_score() ตั้งเองอัตโนมัติ
  if new.status in ('approved','need_revision','published') and not public.is_admin() then
    raise exception 'Only admin can set status %', new.status;
  end if;
  if new.status = 'scored'
     and not public.is_admin()
     and current_setting('app.in_submit_score', true) is distinct from 'on' then
    raise exception 'status "scored" is set by submit_score() only';
  end if;

  -- Gate: draft → submitted
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

  -- Gate: → pending_review
  -- ★ เดิมบังคับ is_completed=true ก่อนเข้ารอบประเมินเสมอ — เปลี่ยนแล้ว (ตามคำขอ 2026-09-08):
  --   ส่งเข้าคิวกรรมการได้ทันทีไม่ว่าจะเสร็จหรือยัง ถ้ายังไม่เสร็จเจ้าของยังตามอัปเดตความคืบหน้า
  --   ต่อได้ (ดู can_track_progress()) ถ้า "เสร็จแล้ว" ตอนที่เข้าคิวเลย ก็ยังต้องมีหลักฐานครบตามเดิม
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
  -- เจ้าของโครงการเอง ถ้าเขาเป็นกรรมการของรอบนี้ด้วย — เขาถูกกัน (ระดับ UI) ไม่ให้ให้คะแนน
  -- โครงการตัวเองอยู่แล้ว (conflict of interest, §2.8) และน้ำหนักของเขาถูกยกไปให้ director
  -- แทนผ่าน committee_weight_for_kaizen() (§2.9) แล้ว — ถ้ายังนับเขาเป็นคนที่ "ต้องส่งคะแนน"
  -- ด้วย โครงการนี้จะติดค้างที่ pending_review ตลอดกาลเพราะไม่มีทางส่งคะแนนให้ตัวเองได้เลย
  -- (2026-09-12 fix — ดูรายงานตรวจสอบ Critical #3 ใน Spec.md §4.8)
  -- Edge case ที่ตั้งใจไม่จัดการเพิ่ม (คล้าย §2.9): ถ้ากรรมการของรอบมีแค่เจ้าของโครงการคนเดียว
  -- (ไม่มีกรรมการคนอื่นเลย) โครงการจะเข้า 'scored' ได้ทันทีโดยไม่มีใครให้คะแนนจริงเลยสักคน —
  -- ยอมรับเป็น known limitation เหมือนเคส "ไม่มี director" ใน §2.9
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

create trigger trg_10_guard_kaizen_transition before update of status on kaizen_projects
  for each row execute function public.guard_kaizen_transition();

-- guard_kaizen_completion() — เดิมเช็ค "มีรูป after" อยู่ในเกต → pending_review เท่านั้น
-- (สมมติว่า is_completed จะกลายเป็น true พร้อมกับเข้าคิวกรรมการเสมอ) ตอนนี้แยกจากกันแล้ว
-- (is_completed อาจถูกตั้ง true "ทีหลัง" ตอนที่ status เป็น pending_review/scored/approved
-- ไปแล้วก็ได้) เลยต้องมี trigger แยกที่เช็คตอน is_completed เปลี่ยนเป็น true ไม่ว่าจะเกิดตอนไหน
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

create trigger trg_10b_guard_kaizen_completion before update of is_completed on kaizen_projects
  for each row execute function public.guard_kaizen_completion();

-- guard_kaizen_field_lock() — ตั้งแต่เข้าคิวกรรมการ (pending_review/scored/approved) แก้เนื้อหา
-- หลักของโครงการไม่ได้อีก (กันข้อมูลเปลี่ยนหลังกรรมการเริ่มให้คะแนนไปแล้ว) ยกเว้นคอลัมน์ที่เกี่ยวกับ
-- การติดตามความคืบหน้า/ทำเครื่องหมายเสร็จซึ่งต้องแก้ได้ต่อ (ดู can_track_progress()) — ใช้ allow-list
-- ของคอลัมน์ที่ "ยังแก้ได้" แทนการไล่ห้ามทีละคอลัมน์ กัน column ใหม่ในอนาคตหลุดจากการป้องกัน
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

create trigger trg_10c_guard_kaizen_field_lock before update on kaizen_projects
  for each row execute function public.guard_kaizen_field_lock();

-- set_kaizen_code() — BEFORE UPDATE เมื่อ draft→submitted (ไม่ใช่ BEFORE INSERT
-- เพราะขณะ draft ยังไม่มี period_id แน่นอน) — KZN-{YYYYMM ของ period}-{seq 4 หลัก}
create or replace function public.set_kaizen_code() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_period_code text;
  v_yyyymm      text;
  v_seq         int;
begin
  if new.status <> 'submitted' or new.code is not null then
    return new;
  end if;

  select code into v_period_code from evaluation_periods where id = new.period_id;
  v_yyyymm := replace(v_period_code, '-', '');

  -- serialize seq generation ต่อรอบ (advisory lock แทน `select ... for update` บน aggregate)
  perform pg_advisory_xact_lock(hashtextextended(new.period_id::text, 0));
  select count(*) + 1 into v_seq
    from kaizen_projects
   where period_id = new.period_id and code is not null;

  new.code := 'KZN-' || v_yyyymm || '-' || lpad(v_seq::text, 4, '0');
  return new;
end $$;

create trigger trg_20_set_kaizen_code before update of status on kaizen_projects
  for each row execute function public.set_kaizen_code();

-- log_kaizen_status_change() — AFTER UPDATE OF status → audit_log (action='status_change')
-- ครอบคลุมทุก transition รวมทั้งที่ Admin ตั้งตรง ๆ (approved/need_revision) ที่ไม่ผ่าน RPC
create or replace function public.log_kaizen_status_change() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  insert into audit_log (actor_id, action, entity_type, entity_id, before, after)
  values (auth.uid(), 'status_change', 'kaizen_projects', new.id,
          jsonb_build_object('status', old.status), jsonb_build_object('status', new.status));
  return new;
end $$;

create trigger trg_30_log_kaizen_status_change after update of status on kaizen_projects
  for each row execute function public.log_kaizen_status_change();

-- sync_committee_raw_sum() — validate items keys/levels + raw_sum = Σ values(items)
-- ★ อนุญาต items บางส่วนตอน draft (บันทึกร่างได้) — ตรวจครบ 7 เกณฑ์จริงตอน submit_score() เท่านั้น
create or replace function public.sync_committee_raw_sum() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_key  text;
  v_val  int;
  v_sum  int := 0;
  v_kaizen_period uuid;
begin
  for v_key, v_val in select key, value::int from jsonb_each_text(new.items) loop
    if not (v_key = any (public.criteria_codes())) then
      raise exception 'Unknown criterion code: %', v_key;
    end if;
    if v_val < 1 or v_val > 5 then
      raise exception 'Level for % must be between 1 and 5 (got %)', v_key, v_val;
    end if;
    v_sum := v_sum + v_val;
  end loop;
  new.raw_sum := v_sum;

  select period_id into v_kaizen_period from kaizen_projects where id = new.kaizen_id;
  if v_kaizen_period is distinct from new.period_id then
    raise exception 'committee_scores.period_id must match kaizen_projects.period_id';
  end if;

  return new;
end $$;

create trigger trg_sync_committee_raw_sum before insert or update on committee_scores
  for each row execute function public.sync_committee_raw_sum();

-- guard_period_status() — ปิดช่องเปลี่ยนสถานะรอบตรง ๆ บังคับให้ผ่าน
-- open_period()/close_period()/publish_period() เท่านั้น (docs/03 §5)
create or replace function public.guard_period_status() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_allowed text[];
begin
  if new.status = old.status then return new; end if;

  -- 'scoring' เป็นค่าที่เก็บไว้ในเอนุมตาม Spec.md แต่ไม่มี RPC ใดใน v1 พาเข้าสถานะนี้
  -- (start_scoring()/cron ถูกตัดไปกับ B7) — รอบเปิดจะปิดตรงไปที่ 'closed' เสมอ
  v_allowed := case old.status
    when 'draft'     then array['open']
    when 'open'      then array['closed']
    when 'scoring'   then array['closed']
    when 'closed'    then array['published']
    when 'published' then array[]::text[]
    else array[]::text[]
  end;

  if not (new.status = any(v_allowed)) then
    raise exception 'Illegal period transition % -> %', old.status, new.status;
  end if;

  if current_setting('app.in_period_rpc', true) is distinct from 'on' then
    raise exception 'Period status must change via open_period()/close_period()/publish_period()';
  end if;

  return new;
end $$;

create trigger trg_guard_period_status before update of status on evaluation_periods
  for each row execute function public.guard_period_status();

-- น้ำหนักกรรมการ "ที่ใช้จริง" สำหรับโครงการ K หนึ่งอัน — ต่างจาก evaluation_periods.committee_weights
-- ตรงๆ ตอนเดียว: ถ้าเจ้าของโครงการ K เองก็เป็นกรรมการของรอบนี้ด้วย (ให้คะแนนตัวเองไม่ได้ตาม
-- Spec.md §2.8) น้ำหนักของเจ้าของจะถูกยกไปให้กรรมการที่มี committee_role='director' ของรอบนี้แทน
-- (หารเฉลี่ยถ้ามีมากกว่า 1 คน) — ถ้าไม่มี director ในรอบ หรือ director คือเจ้าของโครงการเอง
-- น้ำหนักส่วนนั้นจะไม่ถูกยกให้ใคร (ยังคงหายไปเหมือนเดิม เป็น known limitation ที่ตั้งใจไม่จัดการ
-- เพิ่ม — ดู Spec.md §2.9) ไม่แก้ไข evaluation_periods.committee_weights จริง แค่ปรับเฉพาะตอนคำนวณ
-- weighted_score ต่อโครงการเท่านั้น
create or replace function public.committee_weight_for_kaizen(
  p_period_id uuid,
  p_kaizen_owner_id uuid,
  p_committee_user_id uuid
) returns numeric
language sql stable security definer set search_path = public, pg_temp as $$
  with period as (
    select committee_weights from evaluation_periods where id = p_period_id
  ),
  owner_weight as (
    select coalesce((committee_weights ->> p_kaizen_owner_id::text)::numeric, 0) as w,
           (committee_weights ? p_kaizen_owner_id::text) as owner_is_committee
    from period
  ),
  directors as (
    select pr.id
    from profiles pr, period
    where pr.committee_role = 'director'
      and period.committee_weights ? pr.id::text
      and pr.id <> p_kaizen_owner_id
  ),
  bonus as (
    select case
             when (select owner_is_committee from owner_weight)
                  and (select count(*) from directors) > 0
             then (select w from owner_weight) / (select count(*) from directors)
             else 0
           end as amount
  )
  select
    coalesce((select committee_weights ->> p_committee_user_id::text from period), '0')::numeric
    + case when p_committee_user_id in (select id from directors)
           then (select amount from bonus)
           else 0
      end;
$$;

-- ================================================================
-- View: ผลคะแนนคำนวณสด (แทน kaizen_results ถาวร — backlog B5)
-- ★ security_invoker = false (ต่างจากที่ร่างไว้ใน Spec.md เดิม): ถ้าใช้ invoker
--   จะสืบทอด RLS ของ committee_scores ที่ "เจ้าของโครงการไม่มี policy อ่านเลย"
--   และกรรมการเห็นแค่แถวตัวเอง → employee/committee จะเห็นผลลัพธ์เป็น 0 แถวเสมอ
--   จึง gate การมองเห็นด้วย period.status ในตัว view เองแทน:
--   admin เห็นตั้งแต่ 'closed', คนอื่นเห็นเฉพาะ 'published'
-- ================================================================
-- rank_overall เป็น null สำหรับโครงการที่ยังไม่เสร็จ (is_completed=false) ในรอบที่
-- rank_requires_completion=true — ยังคำนวณ weighted_score ให้เห็นเป็น feedback ตามปกติ
-- แค่ไม่ติดอันดับ (ดู Spec.md §3 B13) partition ด้วย (rank_requires_completion and not
-- is_completed) เพิ่ม เพื่อให้โครงการที่ไม่เสร็จไม่ไปแย่งอันดับ/สร้างช่องว่างอันดับของโครงการที่เสร็จ
create view v_kaizen_results with (security_invoker = false) as
select
  cs.kaizen_id,
  cs.period_id,
  count(*)                                     as committee_count,
  sum(cs.raw_sum)                              as raw_sum_total,
  avg(cs.raw_sum)                              as average_raw,
  avg(cs.raw_sum) / 35.0 * 100                 as average_pct,
  sum( (cs.raw_sum / 35.0) *
       public.committee_weight_for_kaizen(cs.period_id, k.owner_id, cs.committee_user_id) )
                                                as weighted_score,
  k.cost_saving_rank,
  case when ep.rank_requires_completion and not k.is_completed then null else
    rank() over (
      partition by cs.period_id, (ep.rank_requires_completion and not k.is_completed)
      order by sum((cs.raw_sum/35.0) * public.committee_weight_for_kaizen(cs.period_id, k.owner_id, cs.committee_user_id)) desc
    )
  end as rank_overall
from committee_scores cs
join evaluation_periods ep on ep.id = cs.period_id
join kaizen_projects   k  on k.id  = cs.kaizen_id
where cs.status = 'submitted'
  -- ★ 2026-09-12: ต้องกรอง k.status ด้วย ไม่งั้นโครงการที่ admin ตีกลับ (need_revision) หลัง
  --   ให้คะแนนครบแล้ว หรือยังไม่เคย approve เลย (ค้างที่ scored/pending_review) จะยังโผล่ใน
  --   ผลลัพธ์/leaderboard ทั้งที่ admin ไม่เคยอนุมัติ — ดู migration_2026-09-12_results-status-filter.sql
  and k.status in ('approved','published')
  and (ep.status = 'published' or (ep.status = 'closed' and public.is_admin()))
group by cs.kaizen_id, cs.period_id, k.cost_saving_rank, k.owner_id, k.is_completed, ep.rank_requires_completion;

-- ================================================================
-- RLS — deny by default, force ทุกตาราง, แยก policy ตาม command
-- ================================================================

-- ---- profiles ----
alter table profiles enable row level security;
alter table profiles force row level security;

create policy profiles_read_self on profiles for select to authenticated
  using (id = auth.uid());
create policy profiles_read_admin on profiles for select to authenticated
  using (public.is_admin());
create policy profiles_read_related on profiles for select to authenticated
  using (exists (
    select 1 from kaizen_projects k
     where k.owner_id = profiles.id and public.can_read_kaizen(k.id)
  ));
-- ★ คู่กับ k_read_feed/ka_read_feed — Feed ต้องโชว์ชื่อ/รูปโปรไฟล์เจ้าของโครงการที่ส่งแล้วได้ด้วย
create policy profiles_read_feed on profiles for select to authenticated
  using (exists (
    select 1 from kaizen_projects k where k.owner_id = profiles.id and k.status <> 'draft'
  ));
create policy profiles_update_self on profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());
create policy profiles_update_admin on profiles for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy profiles_insert_self on profiles for insert to authenticated
  with check (id = auth.uid() or public.is_admin());

-- ---- master_data ----
-- ★ อ่านได้ทั้ง authenticated และ anon (ต่างจาก Spec.md §5.1 ที่เขียนไว้แค่
--   "authenticated") เพราะหน้า register.js ต้องโชว์ dropdown แผนก/โรงงาน
--   *ก่อน* ผู้ใช้ล็อกอิน — ข้อมูลใน master_data ไม่มี PII จึงเปิด anon ได้ปลอดภัย
alter table master_data enable row level security;
alter table master_data force row level security;

create policy md_read on master_data for select to authenticated, anon using (true);
create policy md_insert_admin on master_data for insert to authenticated with check (public.is_admin());
create policy md_update_admin on master_data for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy md_delete_admin on master_data for delete to authenticated using (public.is_admin());

-- ---- evaluation_periods ----
-- ★ known limitation (เทียบกับ full design ที่ตัด period_committees ทิ้งใน MVP นี้):
--   ep_read คืนทั้งแถวรวม committee_weights — ผู้ใช้ที่ login แล้วทุกคนเห็นน้ำหนัก
--   ของกรรมการทุกคนได้ทันทีที่รอบไม่ใช่ draft (ไม่ได้ซ่อนจนกว่าจะปิดรอบเหมือน full
--   design เดิม) เพราะ RLS เป็น row-level ไม่ใช่ column-level — ยอมรับ trade-off นี้
--   ใน v1 ตามที่ Spec.md ตั้งใจยุบตารางเพื่อลด scope
alter table evaluation_periods enable row level security;
alter table evaluation_periods force row level security;

create policy ep_read on evaluation_periods for select to authenticated
  using (status <> 'draft' or public.is_admin());
create policy ep_insert_admin on evaluation_periods for insert to authenticated
  with check (public.is_admin() and status = 'draft');
create policy ep_update_admin on evaluation_periods for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy ep_delete_admin on evaluation_periods for delete to authenticated
  using (public.is_admin() and status = 'draft');

-- ---- kaizen_projects ----
alter table kaizen_projects enable row level security;
alter table kaizen_projects force row level security;

create policy k_read_own on kaizen_projects for select to authenticated
  using (owner_id = auth.uid());
create policy k_read_admin on kaizen_projects for select to authenticated
  using (public.is_admin());
create policy k_read_published on kaizen_projects for select to authenticated
  using (status = 'published');
create policy k_read_committee on kaizen_projects for select to authenticated
  using (
    period_id is not null
    and public.is_period_committee(period_id)
    and status in ('pending_review','scored','approved','need_revision','published')
  );
-- ★ Feed หน้า "โครงการทั้งหมด" (2026-09-15, แทนที่ leaderboard เดิม) — ให้ทุกคนที่ login แล้ว
-- เห็นโครงการที่ส่งแล้ว (ทุกสถานะยกเว้น draft) ของคนอื่นได้ ต่างจาก k_read_published ตรงที่ไม่ต้อง
-- รอประกาศผล — จงใจไม่รวม draft (ยังเป็นข้อมูลส่วนตัวของเจ้าของ) และไม่เปิด
-- kaizen_progress_updates/committee_scores เพิ่ม (นโยบายแยกกัน คนละตาราง ไม่ถูกกระทบ) — Feed UI
-- เองก็ไม่โชว์คะแนน/อันดับใดๆ ตามที่ตกลงกันไว้ (v_kaizen_results ยังคงมีแค่ published/admin เหมือนเดิม)
create policy k_read_feed on kaizen_projects for select to authenticated
  using (status <> 'draft');

create policy k_insert_own on kaizen_projects for insert to authenticated
  with check (owner_id = auth.uid() and status = 'draft' and public.is_active_user());

-- ★ เงื่อนไขสุดท้าย (period_id) เพิ่ม "or has_active_edit_grant(id)" (2026-09-12, Spec.md §4.8
-- backlog Low #7) — เดิมถ้ารอบของโครงการปิด/ประกาศผลไปแล้ว เจ้าของแก้ไขไม่ได้เลยแม้สถานะยังเป็น
-- need_revision (กรรมการตีกลับให้แก้ แต่ admin ดันปิดรอบก่อนเจ้าของจะแก้ทัน) — เปิดทางเพิ่มเฉพาะ
-- กรณีมี grant ที่ยังไม่หมดอายุเท่านั้น (ให้ทีละโครงการผ่าน grant_kaizen_edit_window() RPC โดย admin
-- เท่านั้น) ไม่ใช่เปิด RLS กว้างๆ ตามสถานะ — เงื่อนไขอื่นทั้งหมดเหมือนเดิมทุกประการ
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
create policy k_update_admin on kaizen_projects for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy k_delete_own on kaizen_projects for delete to authenticated
  using (owner_id = auth.uid() and status = 'draft');
create policy k_delete_admin on kaizen_projects for delete to authenticated
  using (public.is_admin());

-- ---- kaizen_edit_grants ---- (Spec.md §4.8 backlog Low #7) admin จัดการได้ทุกแถวผ่าน RPC เท่านั้น
-- (grant_kaizen_edit_window()/revoke_kaizen_edit_grant() ด้านล่าง) เจ้าของโครงการอ่านได้อย่างเดียว
-- (โชว์ banner "ได้รับสิทธิ์แก้ไขชั่วคราวถึงเมื่อไหร่/เพราะอะไร" ในหน้าฟอร์มแก้ไข)
alter table kaizen_edit_grants enable row level security;
alter table kaizen_edit_grants force row level security;

create policy keg_read_admin on kaizen_edit_grants for select to authenticated
  using (public.is_admin());
create policy keg_read_own on kaizen_edit_grants for select to authenticated
  using (exists (select 1 from kaizen_projects k where k.id = kaizen_id and k.owner_id = auth.uid()));
create policy keg_write_admin on kaizen_edit_grants for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ---- kaizen_attachments ----
alter table kaizen_attachments enable row level security;
alter table kaizen_attachments force row level security;

create policy ka_read on kaizen_attachments for select to authenticated
  using (public.can_read_kaizen(kaizen_id));
-- ★ คู่กับ k_read_feed ด้านบน — Feed ต้องโชว์รูปของโครงการคนอื่นที่ส่งแล้วได้ด้วย ไม่ใช่แค่แถว
-- kaizen_projects เฉยๆ จงใจเป็น policy แยกจาก can_read_kaizen() (ไม่แก้ can_read_kaizen() เอง)
-- เพราะฟังก์ชันนั้นใช้ร่วมกับ kaizen_progress_updates ด้วย (kpu_read) ซึ่ง "ไม่" ต้องการเปิดให้
-- Feed เห็น — บันทึกความคืบหน้า/ข้อติดขัดยังเป็นเรื่องภายในระหว่างเจ้าของ/กรรมการ/admin เท่านั้น
create policy ka_read_feed on kaizen_attachments for select to authenticated
  using (exists (
    select 1 from kaizen_projects k where k.id = kaizen_attachments.kaizen_id and k.status <> 'draft'
  ));
create policy ka_insert on kaizen_attachments for insert to authenticated
  with check ((public.can_write_kaizen(kaizen_id) or public.can_track_progress(kaizen_id)) and uploaded_by = auth.uid());
create policy ka_update on kaizen_attachments for update to authenticated
  using (public.can_write_kaizen(kaizen_id) or public.can_track_progress(kaizen_id))
  with check (public.can_write_kaizen(kaizen_id) or public.can_track_progress(kaizen_id));
create policy ka_delete on kaizen_attachments for delete to authenticated
  using (public.can_write_kaizen(kaizen_id) or public.can_track_progress(kaizen_id));

-- ---- kaizen_progress_updates ----
alter table kaizen_progress_updates enable row level security;
alter table kaizen_progress_updates force row level security;

create policy kpu_read on kaizen_progress_updates for select to authenticated
  using (public.can_read_kaizen(kaizen_id));
create policy kpu_insert on kaizen_progress_updates for insert to authenticated
  with check ((public.can_write_kaizen(kaizen_id) or public.can_track_progress(kaizen_id)) and created_by = auth.uid());
create policy kpu_update on kaizen_progress_updates for update to authenticated
  using ((public.can_write_kaizen(kaizen_id) or public.can_track_progress(kaizen_id)) and created_by = auth.uid())
  with check ((public.can_write_kaizen(kaizen_id) or public.can_track_progress(kaizen_id)) and created_by = auth.uid());
create policy kpu_delete_admin on kaizen_progress_updates for delete to authenticated
  using (public.is_admin());

-- ---- committee_scores — กรรมการเห็น/แก้เฉพาะแถวตัวเอง "ตลอดไป" ไม่มีข้อยกเว้น
--      เจ้าของโครงการไม่มี policy อ่านเลย (ดูหมายเหตุที่ v_kaizen_results ด้านบน) ----
alter table committee_scores enable row level security;
alter table committee_scores force row level security;

create policy cs_read_self on committee_scores for select to authenticated
  using (committee_user_id = auth.uid());
create policy cs_read_admin on committee_scores for select to authenticated
  using (public.is_admin());

create policy cs_insert_self on committee_scores for insert to authenticated
  with check (
    committee_user_id = auth.uid()
    and status = 'draft'
    and public.is_period_committee(period_id)
    and public.period_status_of(period_id) in ('open','scoring')
    and exists (
      select 1 from kaizen_projects k
       where k.id = kaizen_id and k.period_id = period_id and k.status = 'pending_review'
    )
  );

create policy cs_update_self on committee_scores for update to authenticated
  using (
    committee_user_id = auth.uid()
    and is_locked = false
    and public.period_status_of(period_id) in ('open','scoring')
  )
  with check (committee_user_id = auth.uid() and is_locked = false);

create policy cs_delete_admin on committee_scores for delete to authenticated
  using (public.is_admin());

-- คอลัมน์ที่กรรมการแก้ได้จริงมีแค่ 4 คอลัมน์ — kaizen_id/period_id/committee_user_id/
-- raw_sum/is_locked คุมโดย server เท่านั้น (raw_sum: trigger, is_locked: close_period())
revoke update on committee_scores from authenticated;
grant update (items, overall_comment, status, updated_at) on committee_scores to authenticated;

-- ---- audit_log — อ่านเฉพาะ admin; เขียนเฉพาะผ่าน trigger/RPC (security definer) ----
alter table audit_log enable row level security;
alter table audit_log force row level security;

create policy al_read_admin on audit_log for select to authenticated
  using (public.is_admin());

-- ---- quarterly_awards — อ่านได้ทุกคนที่ login แล้ว (ประกาศสาธารณะ); เขียน/ลบเฉพาะ admin ----
alter table quarterly_awards enable row level security;
alter table quarterly_awards force row level security;

create policy qa_read on quarterly_awards for select to authenticated
  using (true);
create policy qa_insert_admin on quarterly_awards for insert to authenticated
  with check (public.is_admin());
create policy qa_delete_admin on quarterly_awards for delete to authenticated
  using (public.is_admin());

-- ---- kaizen_likes — เห็น/ไลค์ได้เฉพาะโครงการที่ไม่ใช่ draft (เงื่อนไขเดียวกับ k_read_feed) ----
alter table kaizen_likes enable row level security;
alter table kaizen_likes force row level security;

create policy kl_read on kaizen_likes for select to authenticated
  using (exists (select 1 from kaizen_projects k where k.id = kaizen_id and k.status <> 'draft'));
create policy kl_insert_own on kaizen_likes for insert to authenticated
  with check (
    user_id = auth.uid()
    and exists (select 1 from kaizen_projects k where k.id = kaizen_id and k.status <> 'draft')
  );
create policy kl_delete_own on kaizen_likes for delete to authenticated
  using (user_id = auth.uid());

-- ================================================================
-- RPC (security definer) — logic ที่ต้องข้าม RLS หรือรับประกัน atomicity
-- ================================================================

-- open_period(period_id) — ตรวจ Σ committee_weights = 100 → status='open'
create or replace function public.open_period(p_period_id uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_status  text;
  v_weights jsonb;
  v_sum     numeric;
  v_n       int;
begin
  if not public.is_admin() then
    raise exception 'Only admin can open a period';
  end if;

  select status, committee_weights into v_status, v_weights
    from evaluation_periods where id = p_period_id for update;
  if v_status is null then
    raise exception 'Period not found';
  end if;
  if v_status <> 'draft' then
    raise exception 'Only a draft period can be opened';
  end if;
  if exists (select 1 from evaluation_periods where status = 'open' and id <> p_period_id) then
    raise exception 'Another period is already open';
  end if;

  select count(*) into v_n from jsonb_object_keys(v_weights);
  if v_n = 0 then
    raise exception 'At least one committee member with a weight is required';
  end if;
  select coalesce(sum(value::numeric), 0) into v_sum from jsonb_each_text(v_weights);
  if v_sum <> 100 then
    raise exception 'committee_weights must sum to 100 (got %)', v_sum;
  end if;

  perform set_config('app.in_period_rpc', 'on', true);
  update evaluation_periods set status = 'open', opened_at = now() where id = p_period_id;

  insert into audit_log (actor_id, action, entity_type, entity_id)
  values (auth.uid(), 'period_open', 'evaluation_periods', p_period_id);
end $$;

-- close_period(period_id) — lock committee_scores → status='closed'
-- (v_kaizen_results คำนวณสดจาก view อยู่แล้ว ไม่ต้อง snapshot — backlog B5)
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

  -- ★ 2026-09-12 fix (Spec.md §4.8 finding H4): เดิมเช็ค "กรรมการส่งคะแนนครบทุกใบ" แค่ฝั่ง client
  -- (ปุ่ม disabled ใน adminPeriodDetail.js) เท่านั้น ปิดรอบผ่านตรงๆ (เช่นจาก console) ได้โดยไม่มี
  -- ใครให้คะแนนครบเลยก็ได้ — เช็คตรงนี้แทนด้วยการนับโครงการที่ยังค้างที่ pending_review (เทียบเท่า
  -- "ยังมีคนไม่ครบตามที่ guard_kaizen_transition ต้องการ" เพราะ trigger นั้นจะเลื่อนสถานะเป็น
  -- 'scored' ให้อัตโนมัติทันทีที่ครบแล้วเสมอ ไม่มีทางค้างที่ pending_review ถ้าคะแนนครบจริง)
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

-- publish_period(period_id) — status='published' → kaizen_projects approved → published
create or replace function public.publish_period(p_period_id uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_status text;
begin
  if not public.is_admin() then
    raise exception 'Only admin can publish a period';
  end if;

  select status into v_status from evaluation_periods where id = p_period_id for update;
  if v_status is null then
    raise exception 'Period not found';
  end if;
  if v_status <> 'closed' then
    raise exception 'Only a closed period can be published';
  end if;

  perform set_config('app.in_period_rpc', 'on', true);
  update evaluation_periods set status = 'published', published_at = now() where id = p_period_id;

  update kaizen_projects set status = 'published'
   where period_id = p_period_id and status = 'approved';

  insert into audit_log (actor_id, action, entity_type, entity_id)
  values (auth.uid(), 'period_publish', 'evaluation_periods', p_period_id);
end $$;

-- submit_kaizen(kaizen_id) — ตรวจ gate (รูป before, ฟิลด์บังคับ) → status='submitted'
-- gate จริงอยู่ใน trg_10_guard_kaizen_transition (ใช้ซ้ำ ไม่ซ้ำ logic) — ฟังก์ชันนี้
-- เป็น security definer เพื่อเขียน audit_log เท่านั้น (owner เขียน kaizen_projects
-- เองได้อยู่แล้วผ่าน RLS ปกติ แต่ไม่มีสิทธิ์ insert audit_log โดยตรง)
create or replace function public.submit_kaizen(p_kaizen_id uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_owner  uuid;
  v_status text;
begin
  -- ★ security definer ข้าม RLS ของ kaizen_projects เอง (แม้ force row level security ก็ตาม เพราะ
  -- ฟังก์ชันนี้รันด้วยสิทธิ์ผู้สร้าง/superuser) เช็ค is_active_user() ที่ k_insert_own/k_update_own
  -- เพิ่มไว้จึงไม่ครอบคลุมเส้นทางนี้ ต้องเช็คซ้ำตรงนี้เอง (2026-09-15 — ดูหมายเหตุที่ is_active_user())
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

-- add_progress_update() — เดิม kaizenProgress.js ทำ insert kaizen_progress_updates กับ update
-- kaizen_projects.next_follow_up_date/status เป็น 2 คำสั่งแยกจากฝั่ง client ถ้าคำสั่งแรกสำเร็จแต่
-- คำสั่งที่สองพัง จะได้ progress log ที่ไม่ตรงกับสถานะจริงของโครงการ — รวมเป็น RPC เดียวให้
-- Postgres รับประกัน atomicity (Spec.md §4.8 backlog Low #6) ใช้ can_track_progress() ตัวเดียวกับ
-- ที่ RLS policy kpu_insert/k_update_own ใช้อยู่แล้ว (ไม่ได้คิด business rule ใหม่ แค่บังคับซ้ำ
-- เพราะ security definer ข้าม RLS ไปเอง) created_by มาจาก auth.uid() ตรงๆ ไม่รับจาก client
create or replace function public.add_progress_update(
  p_kaizen_id uuid,
  p_note text,
  p_obstacles text,
  p_next_follow_up_date date
) returns kaizen_progress_updates
language plpgsql security definer set search_path = public, pg_temp as $$
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
end $$;

-- grant_kaizen_edit_window() / revoke_kaizen_edit_grant() — สิทธิ์แก้ไขชั่วคราวเฉพาะโครงการ
-- (Group 7, Spec.md §4.8 backlog Low #7) admin เท่านั้น บังคับ precondition ว่าต้อง "ติดจริง"
-- (status='need_revision' และรอบปิด/ประกาศผลไปแล้ว) เท่านั้นถึงจะให้ grant ได้ กันเผลอกดให้สิทธิ์
-- โครงการที่แก้ไขได้อยู่แล้วตามปกติ จำกัด 1-168 ชม. (สูงสุด 7 วัน) กันเผลอตั้งเวลานานเกินไป
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

-- submit_score(score_id) — ตรวจครบ 7 เกณฑ์ → status='submitted' → เช็คกรรมการครบ
-- (roster = keys ของ evaluation_periods.committee_weights) → kaizen.status='scored'
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
  -- guard_kaizen_transition()'s Gate: → scored (2026-09-12 fix, ดู Spec.md §4.8)
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

-- ================================================================
-- Grants — deny-by-default base privileges, RLS gates rows further
-- ================================================================
revoke all on all tables in schema public from anon, public;
revoke all on all sequences in schema public from anon, public;
revoke all on all functions in schema public from anon, public;

grant usage on schema public to authenticated;
grant usage on schema public to anon;

grant select, insert, update, delete on
  profiles, kaizen_projects, kaizen_attachments, kaizen_progress_updates, committee_scores
  to authenticated;
grant select, insert, update, delete on master_data to authenticated;
-- register.js อ่าน department/plant ก่อนล็อกอิน (ดูหมายเหตุที่ md_read ด้านบน)
grant select on master_data to anon;
grant select, insert, update, delete on evaluation_periods to authenticated;
grant select on audit_log to authenticated;
grant select on v_kaizen_results to authenticated;

grant execute on all functions in schema public to authenticated;

-- ================================================================
-- Storage — bucket kaizen-photos (path convention: {kaizen_id}/{phase}/{uuid}.{ext})
-- ================================================================
insert into storage.buckets (id, name, public)
values ('kaizen-photos', 'kaizen-photos', false)
on conflict (id) do nothing;

create policy kaizen_photos_read on storage.objects for select to authenticated
  using (
    bucket_id = 'kaizen-photos'
    and public.can_read_kaizen((storage.foldername(name))[1]::uuid)
  );
-- ★ คู่กับ ka_read_feed (kaizen_attachments) — แถวเมทาดาต้าเปิดให้ Feed เห็นแล้ว แต่ไฟล์รูปจริง
-- ใน storage bucket ยังเป็นคนละ RLS กันเสมอ (storage.objects แยกจาก kaizen_attachments)
-- ถ้าไม่เพิ่ม policy นี้ signed URL ของรูปคนอื่นจะได้ 400 ทั้งที่แถว attachment เองอ่านได้แล้ว
-- (พบจากทดสอบสด 2026-09-15) จงใจไม่แก้ can_read_kaizen() เอง เหตุผลเดียวกับ ka_read_feed
create policy kaizen_photos_read_feed on storage.objects for select to authenticated
  using (
    bucket_id = 'kaizen-photos'
    and exists (
      select 1 from kaizen_projects k
       where k.id = (storage.foldername(name))[1]::uuid and k.status <> 'draft'
    )
  );

create policy kaizen_photos_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'kaizen-photos'
    and (public.can_write_kaizen((storage.foldername(name))[1]::uuid)
         or public.can_track_progress((storage.foldername(name))[1]::uuid))
  );

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

create policy kaizen_photos_delete on storage.objects for delete to authenticated
  using (
    bucket_id = 'kaizen-photos'
    and (public.can_write_kaizen((storage.foldername(name))[1]::uuid)
         or public.can_track_progress((storage.foldername(name))[1]::uuid))
  );

-- ================================================================
-- Storage — bucket avatars (path convention: {user_id}/avatar, ไฟล์เดียวต่อคน
-- เขียนทับด้วย upsert:true ตอนอัปโหลดใหม่ — ดู Spec.md §2.7)
-- ================================================================
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', false)
on conflict (id) do nothing;

-- อ่านได้ทุกคนที่ login แล้ว (ไม่ใช่แค่เจ้าของ) เพราะ avatar ต้องโชว์ให้คนอื่นเห็นด้วย
-- (เช่น adminUsers.js, adminAudit.js) ต่างจาก kaizen-photos ที่จำกัดด้วย can_read_kaizen()
create policy avatars_read on storage.objects for select to authenticated
  using (bucket_id = 'avatars');

create policy avatars_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy avatars_update on storage.objects for update to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy avatars_delete on storage.objects for delete to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
