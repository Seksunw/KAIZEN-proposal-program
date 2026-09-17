-- ============================================================
-- Migration 2026-09-11 — โครงการที่ยังไม่เสร็จไม่ติดอันดับ leaderboard (rank_overall = null)
-- รันไฟล์นี้ครั้งเดียวใน Supabase SQL editor บน project จริง (schema.sql ที่แก้ไว้แล้ว
-- คือ source of truth สำหรับ deploy ใหม่ตั้งแต่ต้น — ไฟล์นี้คือ diff สำหรับ project ที่มีอยู่แล้ว)
-- ปลอดภัยที่จะรันซ้ำได้ (idempotent) ทุกคำสั่ง
-- ดูมติเต็มที่ Spec.md §3 B13 — ใช้กับ "รอบใหม่เท่านั้น" ตามที่ผู้ใช้ยืนยัน ไม่กระทบรอบที่
-- publish ไปแล้วก่อนหน้านี้เลย
-- ============================================================

-- 1) เพิ่มคอลัมน์ก่อนด้วย default false (รอบเดิมทุกรอบที่มีอยู่แล้วตอนรัน migration นี้ = false
--    เท่ากับพฤติกรรมเดิมทุกอย่าง ไม่มีอะไรเปลี่ยนสำหรับรอบเก่า) แล้วค่อยเปลี่ยน default เป็น true
--    ทีหลัง ให้มีผลเฉพาะรอบที่ "สร้างใหม่" หลังจากนี้เท่านั้น
alter table evaluation_periods
  add column if not exists rank_requires_completion boolean not null default false;

alter table evaluation_periods
  alter column rank_requires_completion set default true;

-- 2) แทนที่ v_kaizen_results ให้ rank_overall เป็น null สำหรับโครงการที่ยังไม่เสร็จในรอบที่
--    rank_requires_completion=true (รอบเก่าทุกรอบเป็น false จากขั้นตอนที่ 1 จึงไม่กระทบเลย)
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
  and (ep.status = 'published' or (ep.status = 'closed' and public.is_admin()))
group by cs.kaizen_id, cs.period_id, k.cost_saving_rank, k.owner_id, k.is_completed, ep.rank_requires_completion;
