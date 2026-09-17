-- Group 5 (file/DB validation) — kaizen_attachments.mime_type เดิมไม่มี CHECK constraint เลย
-- (รับค่าอะไรก็ได้ที่ client ส่งมา) และ uploadAttachment() ฝั่ง client เชื่อ file.type/file.name
-- ที่ผู้ใช้ควบคุมได้ตรงๆ ทั้งคู่ — ถ้าเรียก API ตรง (ข้าม UI) ใส่ mime_type ปลอมเป็นอะไรก็ได้
-- ยืนยันแล้วว่าตาราง kaizen_attachments ว่างอยู่ (0 แถว) ก่อน migration นี้ จึงเพิ่ม constraint
-- ได้ปลอดภัยไม่กระทบข้อมูลเดิม (Spec.md §4.8 backlog Low #5)
alter table kaizen_attachments
  add constraint kaizen_attachments_mime_type_allowed
  check (mime_type in ('image/jpeg', 'image/png', 'image/webp', 'image/gif'));
