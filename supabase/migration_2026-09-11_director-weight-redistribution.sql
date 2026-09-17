-- ============================================================
-- Migration 2026-09-11 — ยกน้ำหนักกรรมการที่ให้คะแนนโครงการตัวเองไม่ได้ไปให้ Director
-- รันไฟล์นี้ครั้งเดียวใน Supabase SQL editor บน project จริง (schema.sql ที่แก้ไว้แล้ว
-- คือ source of truth สำหรับ deploy ใหม่ตั้งแต่ต้น — ไฟล์นี้คือ diff สำหรับ project ที่มีอยู่แล้ว)
-- ปลอดภัยที่จะรันซ้ำได้ (idempotent) ทุกคำสั่ง
-- ดูมติเต็มที่ Spec.md §2.9
-- ============================================================

-- 1) ฟังก์ชันคำนวณน้ำหนักกรรมการ "ที่ใช้จริง" ต่อโครงการ (ไม่แก้ evaluation_periods.committee_weights
--    จริง — แค่ปรับตอนคำนวณ weighted_score ของ v_kaizen_results เท่านั้น)
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

-- 2) แทนที่ v_kaizen_results ให้ใช้น้ำหนักที่ปรับแล้วแทนน้ำหนักดิบจาก committee_weights ตรงๆ
--    (column list/order เดิมทุกอย่าง เปลี่ยนแค่สูตร weighted_score/rank_overall)
create or replace view v_kaizen_results with (security_invoker = false) as
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
  rank() over (partition by cs.period_id order by
    sum((cs.raw_sum/35.0) * public.committee_weight_for_kaizen(cs.period_id, k.owner_id, cs.committee_user_id)) desc
  ) as rank_overall
from committee_scores cs
join evaluation_periods ep on ep.id = cs.period_id
join kaizen_projects   k  on k.id  = cs.kaizen_id
where cs.status = 'submitted'
  and (ep.status = 'published' or (ep.status = 'closed' and public.is_admin()))
group by cs.kaizen_id, cs.period_id, k.cost_saving_rank, k.owner_id;

grant execute on function public.committee_weight_for_kaizen(uuid, uuid, uuid) to authenticated;
