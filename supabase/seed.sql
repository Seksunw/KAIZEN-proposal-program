-- ================================================================
-- Seed data — สมมติ 100% ตาม D8 (ไม่ migrate ข้อมูลเก่า)
-- รันหลัง schema.sql เท่านั้น — ใช้สำหรับ dev/test ให้ dropdown ใน register.js
-- และ workflow อื่น ๆ ใช้งานได้ก่อนที่ adminMaster.js (Admin flow) จะสร้างเสร็จ
-- ================================================================

-- departments (สมมติ)
insert into master_data (type, code, label_th, label_en, sort_order) values
  ('department', 'production',  'ฝ่ายผลิต',        'Production',   1),
  ('department', 'quality',     'ฝ่ายควบคุมคุณภาพ', 'Quality',      2),
  ('department', 'maintenance', 'ฝ่ายซ่อมบำรุง',    'Maintenance',  3),
  ('department', 'warehouse',   'ฝ่ายคลังสินค้า',    'Warehouse',    4),
  ('department', 'hr',          'ฝ่ายทรัพยากรบุคคล', 'HR',           5)
on conflict (type, code) do nothing;

-- plants (สมมติ)
insert into master_data (type, code, label_th, label_en, sort_order) values
  ('plant', 'plant1', 'โรงงาน 1', 'Plant 1', 1),
  ('plant', 'plant2', 'โรงงาน 2', 'Plant 2', 2)
on conflict (type, code) do nothing;

-- committee_role + น้ำหนักตั้งต้น (default_weight_pct) — อ้างอิงจาก
-- "KAIZEN Proposal Program score criteria.xlsx" ตาราง Key/Value/Name (B2:F8)
-- หมายเหตุ: นี่คือ "ค่าเริ่มต้นให้ Admin ใช้ตั้งรอบ" เท่านั้น ไม่ใช่ตัวกำหนด
-- evaluation_periods.committee_weights จริง (ตั้งต่อรอบใน adminPeriods.js)
insert into master_data (type, code, label_th, label_en, extra, sort_order) values
  ('committee_role', 'head_of_pd', 'หัวหน้าฝ่าย PD', 'Head of PD',   '{"default_weight_pct": 30}', 1),
  ('committee_role', 'director',   'ผู้อำนวยการ',     'Director',     '{"default_weight_pct": 20}', 2),
  ('committee_role', 'plant_mgr',  'ผู้จัดการโรงงาน', 'Plant Manager','{"default_weight_pct": 30}', 3),
  ('committee_role', 'hr_mgr',     'ผู้จัดการฝ่าย HR', 'HR Manager',  '{"default_weight_pct": 10}', 4),
  ('committee_role', 'mt_ut_mgr',  'ผู้จัดการ MT/UT',  'MT/UT Manager','{"default_weight_pct": 10}', 5)
on conflict (type, code) do nothing;

-- cost_saving_band — จาก "KAIZEN Proposal Program score criteria.xlsx" ตาราง
-- Cost saving/เดือน → Rank (B10:C15) ต่อเดือน หน่วยบาท — ใช้โดย set_cost_saving_rank()
insert into master_data (type, code, label_th, label_en, extra, sort_order) values
  ('cost_saving_band', 'band1', 'น้อยกว่า 10,000 บาท/เดือน',        '< 10,000 THB/month',        '{"rank": 1, "min": 0,      "max": 9999.99}',    1),
  ('cost_saving_band', 'band2', '10,000-19,999 บาท/เดือน',          '10,000-19,999 THB/month',   '{"rank": 2, "min": 10000,  "max": 19999.99}',   2),
  ('cost_saving_band', 'band3', '20,000-49,999 บาท/เดือน',          '20,000-49,999 THB/month',   '{"rank": 3, "min": 20000,  "max": 49999.99}',   3),
  ('cost_saving_band', 'band4', '50,000-99,999 บาท/เดือน',          '50,000-99,999 THB/month',   '{"rank": 4, "min": 50000,  "max": 99999.99}',   4),
  ('cost_saving_band', 'band5', 'มากกว่า 100,000 บาท/เดือน',        '> 100,000 THB/month',       '{"rank": 5, "min": 100000, "max": null}',        5)
on conflict (type, code) do nothing;

-- budget_band — ช่วงติ๊ก 6 ระดับตาม D6 (ไม่มีตัวเลขจริงในเอกสารต้นทาง — ตัวเลขสมมติ
-- ตาม D8 ให้ Admin ปรับผ่าน adminMaster.js ทีหลังได้)
insert into master_data (type, code, label_th, label_en, extra, sort_order) values
  ('budget_band', 'band1', 'ไม่ใช้งบประมาณ',              'No budget',              '{"min": 0,      "max": 0}',       1),
  ('budget_band', 'band2', 'น้อยกว่า 5,000 บาท',           '< 5,000 THB',            '{"min": 1,      "max": 4999}',    2),
  ('budget_band', 'band3', '5,000-19,999 บาท',             '5,000-19,999 THB',       '{"min": 5000,   "max": 19999}',  3),
  ('budget_band', 'band4', '20,000-49,999 บาท',            '20,000-49,999 THB',      '{"min": 20000,  "max": 49999}',  4),
  ('budget_band', 'band5', '50,000-99,999 บาท',            '50,000-99,999 THB',      '{"min": 50000,  "max": 99999}',  5),
  ('budget_band', 'band6', 'มากกว่า 100,000 บาท',          '>= 100,000 THB',         '{"min": 100000, "max": null}',    6)
on conflict (type, code) do nothing;
