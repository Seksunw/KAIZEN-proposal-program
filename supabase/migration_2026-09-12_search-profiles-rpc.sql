-- Group 3 (pagination) — adminUsers.js ต้องค้นหา full_name/employee_id/email พร้อมกัน (OR) แบบ
-- server-side ปลอดภัย ลองสร้าง filter string ด้วย .or() ฝั่ง client ก่อนแล้วพบว่า PostgREST parse
-- ไม่ผ่านถ้าคำค้นมีอักขระสงวน เช่น , ( ) . แม้ escape ด้วย \ ตามเอกสารแล้วก็ตาม (ทดสอบสดยืนยัน:
-- ค้นหา "a,b(c)d.e" ได้ PGRST100 "failed to parse logic tree") — ย้ายมาทำเป็น SQL function แทน
-- p_search ผูกเป็น bound parameter (ไม่ใช่ string interpolation ในตัว query เอง) จึงปลอดภัยจาก
-- SQL injection และไม่ต้องพึ่ง PostgREST filter-string syntax เลย (Spec.md §4.8 backlog Low #3)
create or replace function search_profiles(
  p_search text default '',
  p_role_filter text default 'all',
  p_active_only boolean default true
) returns setof profiles
language sql
stable
security invoker
as $$
  select *
  from profiles p
  where p.is_active = p_active_only
    and (p_role_filter = 'all' or p_role_filter = any(p.roles))
    and (
      p_search = '' or
      p.full_name ilike '%' || p_search || '%' or
      p.employee_id ilike '%' || p_search || '%' or
      p.email ilike '%' || p_search || '%'
    )
  order by p.created_at desc
$$;
