-- ============================================================
-- Migration 2026-09-12 — v_kaizen_results ต้องกรองด้วย kaizen_projects.status ด้วย (Critical bug fix)
-- รันไฟล์นี้ครั้งเดียวใน Supabase SQL editor บน project จริง (schema.sql ที่แก้ไว้แล้ว
-- คือ source of truth สำหรับ deploy ใหม่ตั้งแต่ต้น — ไฟล์นี้คือ diff สำหรับ project ที่มีอยู่แล้ว)
-- ปลอดภัยที่จะรันซ้ำได้ (idempotent)
--
-- บั๊กที่แก้: view เดิมกรองแค่ cs.status='submitted' + ep.status (published/closed) เท่านั้น
-- ไม่เคยเช็ค k.status เลย — ทำให้โครงการที่ admin กด "ตีกลับให้แก้" (need_revision) หลังให้คะแนน
-- ครบแล้ว หรือโครงการที่ยังไม่เคยถูก approve เลย (ค้างที่ scored/pending_review) ยังคงโผล่ใน
-- leaderboard/ผลเปรียบเทียบ Top-3 พร้อมอันดับ/คะแนน ทั้งที่ admin ไม่เคยอนุมัติ — ดู Spec.md
-- entry วันที่ 2026-09-12 (ตรวจสอบระบบแบบ end-to-end) หัวข้อ Critical #2
-- ============================================================

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
  and k.status in ('approved','published')
  and (ep.status = 'published' or (ep.status = 'closed' and public.is_admin()))
group by cs.kaizen_id, cs.period_id, k.cost_saving_rank, k.owner_id, k.is_completed, ep.rank_requires_completion;
