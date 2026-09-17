// js/constants.js
// ค่าคงที่แทน DB table (criteria_versions/score_criteria/score_levels ถูกตัดออกตาม
// Spec.md §2.2) — เนื้อหา rubric ดึงมาจาก "KAIZEN Proposal Program score criteria.xlsx"
// ตรง ๆ (verbatim) ยกเว้น Cost ที่กรรมการให้คะแนนเอง 1-5 (D2) ระบบมีแค่ cost_saving_rank
// เป็นคำแนะนำ (lookup จาก master_data type='cost_saving_band' — ไม่ใช่ constant เพราะ
// เป็นค่าที่ Admin แก้ได้ผ่านหน้า adminMaster)

// ลำดับนี้คือลำดับที่ใช้ทุกที่ในแอป (ฟอร์มให้คะแนน, ตาราง items ใน DB ใช้ code เดียวกัน)
export const CRITERIA = [
  { code: 'safety',        labelTh: 'ความปลอดภัย (Safety)',        labelEn: 'Safety' },
  { code: 'quality',       labelTh: 'คุณภาพ (Quality)',            labelEn: 'Quality' },
  { code: 'productivity',  labelTh: 'ผลิตภาพ (Productivity)',      labelEn: 'Productivity' },
  { code: 'cost',          labelTh: 'ต้นทุน (Cost saving)',        labelEn: 'Cost saving' },
  { code: 'apply',         labelTh: 'การนำไปใช้ (Apply)',          labelEn: 'Apply' },
  { code: 'gemba',         labelTh: 'เก็มบะ (Gemba)',              labelEn: 'Gemba' },
  { code: 'communication', labelTh: 'การสื่อสาร (Communication)',  labelEn: 'Communication' },
];

export const MAX_SCORE_PER_CRITERION = 5;
export const MAX_TOTAL_SCORE = CRITERIA.length * MAX_SCORE_PER_CRITERION; // 35 — ใช้หาร raw_sum ตาม D5

// Rubric ข้อความระดับ 1-5 — คีย์ 'cost' มาจากตาราง "Cost saving/per month → Rank" (B10:C15)
// ในไฟล์ excel ตรง ๆ (เหมือนกับ master_data type='cost_saving_band' ใน seed.sql ทุกประการ)
// แต่กรรมการยังกดเลือกคะแนน 1-5 เองอยู่เหมือนเดิม (D2) — ข้อความนี้ใช้เป็น guideline ในหน้าให้
// คะแนนเท่านั้น ไม่ได้ auto-fill จากยอด cost saving ที่กรอกจริง (ถ้า admin แก้ band ใน adminMaster
// ภายหลัง ข้อความชุดนี้จะไม่ sync ตามอัตโนมัติ เพราะ CRITERIA/SCORE_LEVELS ทั้งชุดเป็นค่าคงที่ตาม D1)
export const SCORE_LEVELS = {
  safety: [
    { level: 5, textTh: 'ลดความเสี่ยงอุบัติเหตุอย่างชัดเจน มีมาตรการป้องกันถาวร และไม่มีการเกิดซ้ำ',
      textEn: 'Proactively eliminates accident risks with permanent preventive measures and established standards. No recurrence of accidents.' },
    { level: 4, textTh: 'ลดความเสี่ยงได้ดี มีมาตรการควบคุมที่ชัดเจน',
      textEn: 'Clearly reduces the level of safety risk with effective control measures.' },
    { level: 3, textTh: 'ลดความเสี่ยงได้บางส่วน ยังต้องปรับปรุงเพิ่มเติม',
      textEn: 'Partially reduces safety risks, but improvement is still limited.' },
    { level: 2, textTh: 'ผลต่อความปลอดภัยน้อย หรือยังไม่ชัดเจน',
      textEn: 'Has minimal impact on workplace safety.' },
    { level: 1, textTh: 'ไม่ส่งผลต่อความปลอดภัย',
      textEn: 'Not related to Safety improvement.' },
  ],
  quality: [
    { level: 5, textTh: 'ลดของเสีย/NG ได้ชัดเจน ป้องกันปัญหาซ้ำ และคุณภาพคงที่',
      textEn: 'Significantly improves quality by eliminating root causes, reducing defects, and preventing recurrence with stable results.' },
    { level: 4, textTh: 'คุณภาพดีขึ้นอย่างเห็นได้ชัด',
      textEn: 'Clearly improves product or process quality with consistent results.' },
    { level: 3, textTh: 'มีแนวโน้มคุณภาพดีขึ้น แต่ผลยังไม่สม่ำเสมอ',
      textEn: 'Shows some quality improvement, but results are not consistent.' },
    { level: 2, textTh: 'ผลต่อคุณภาพเล็กน้อย',
      textEn: 'Has little impact on quality improvement.' },
    { level: 1, textTh: 'ไม่เกี่ยวข้องกับคุณภาพ',
      textEn: 'Not related to Quality improvement.' },
  ],
  productivity: [
    { level: 5, textTh: 'เพิ่มผลผลิต ลดเวลาทำงาน/ขั้นตอน อย่างชัดเจน',
      textEn: 'Significantly improves productivity by reducing cycle time, eliminating unnecessary steps, or increasing output capacity.' },
    { level: 4, textTh: 'ประสิทธิภาพดีขึ้นในระดับสูง',
      textEn: 'Productivity is clearly improved with measurable efficiency gains.' },
    { level: 3, textTh: 'ประสิทธิภาพดีขึ้นเล็กน้อย',
      textEn: 'Productivity improves slightly.' },
    { level: 2, textTh: 'แทบไม่ส่งผลต่อ Productivity',
      textEn: 'Has minimal impact on productivity.' },
    { level: 1, textTh: 'ไม่เกี่ยวข้อง',
      textEn: 'Not related to Productivity improvement.' },
  ],
  cost: [
    { level: 5, textTh: 'มากกว่า 100,000 บาท/เดือน',
      textEn: '> 100,000 THB/month' },
    { level: 4, textTh: '50,000-99,999 บาท/เดือน',
      textEn: '50,000-99,999 THB/month' },
    { level: 3, textTh: '20,000-49,999 บาท/เดือน',
      textEn: '20,000-49,999 THB/month' },
    { level: 2, textTh: '10,000-19,999 บาท/เดือน',
      textEn: '10,000-19,999 THB/month' },
    { level: 1, textTh: 'น้อยกว่า 10,000 บาท/เดือน',
      textEn: '< 10,000 THB/month' },
  ],
  apply: [
    { level: 5, textTh: 'สามารถขยายผลใช้ได้หลายกระบวนการ/หลายหน่วยงาน',
      textEn: 'The Kaizen solution can be easily replicated and applied across multiple processes, lines, or departments.' },
    { level: 4, textTh: 'ประยุกต์ใช้ได้มากกว่า 1 กระบวนการ',
      textEn: 'Can be applied to more than one process or work area.' },
    { level: 3, textTh: 'ใช้ได้เฉพาะจุดงานนั้น',
      textEn: 'Applicable only to the specific process or workplace.' },
    { level: 2, textTh: 'ใช้ได้ยาก หรือเฉพาะบุคคล',
      textEn: 'Difficult to apply or requires high dependency on individuals.' },
    { level: 1, textTh: 'ไม่สามารถนำไปใช้จริง',
      textEn: 'Cannot be practically applied or sustained.' },
  ],
  gemba: [
    { level: 5, textTh: 'วิเคราะห์ปัญหาจากหน้างานจริง ใช้ข้อมูลจริงและ Root Cause',
      textEn: 'Problem identification and solution are strongly based on direct Gemba observation, real data, and clear root cause analysis.' },
    { level: 4, textTh: 'ลงพื้นที่หน้างานและเข้าใจปัญหาชัดเจน',
      textEn: 'Based on actual workplace observations with good understanding of the problem.' },
    { level: 3, textTh: 'ลง Gemba บ้าง แต่การวิเคราะห์ยังไม่ลึก',
      textEn: 'Some Gemba observation, but analysis depth is limited.' },
    { level: 2, textTh: 'ขาดข้อมูลหน้างาน',
      textEn: 'Limited reference to actual workplace conditions.' },
    { level: 1, textTh: 'ไม่อ้างอิง Gemba',
      textEn: 'Not based on Gemba observation.' },
  ],
  communication: [
    { level: 5, textTh: 'ทีมงานมีส่วนร่วมดี สื่อสารเข้าใจง่ายและทั่วถึง',
      textEn: 'Excellent teamwork with active participation, clear communication, and effective knowledge sharing.' },
    { level: 4, textTh: 'การสื่อสารดี มีการทำงานเป็นทีม',
      textEn: 'Good teamwork and communication among members.' },
    { level: 3, textTh: 'สื่อสารพอใช้ มีบางส่วนยังไม่เข้าใจ',
      textEn: 'Adequate communication, but not fully effective.' },
    { level: 2, textTh: 'การสื่อสารจำกัด',
      textEn: 'Limited communication and participation.' },
    { level: 1, textTh: 'ขาดการสื่อสาร/ทำคนเดียว',
      textEn: 'Lack of communication or teamwork.' },
  ],
};

// project_type (kaizen_projects.project_type)
export const PROJECT_TYPES = ['individual', 'group'];

// categories (kaizen_projects.categories text[])
export const CATEGORIES = [
  'safety', 'quality', 'productivity', 'cost',
  'environment', 'communication', 'work_environment', 'other',
];
export const CATEGORY_LABELS = {
  safety: { th: 'ความปลอดภัย', en: 'Safety' },
  quality: { th: 'คุณภาพ', en: 'Quality' },
  productivity: { th: 'ผลิตภาพ', en: 'Productivity' },
  cost: { th: 'ต้นทุน', en: 'Cost' },
  environment: { th: 'สิ่งแวดล้อม', en: 'Environment' },
  communication: { th: 'การสื่อสาร', en: 'Communication' },
  work_environment: { th: 'สภาพแวดล้อมการทำงาน', en: 'Work Environment' },
  other: { th: 'อื่น ๆ', en: 'Other' },
};

// impacts (kaizen_projects.impacts text[])
export const IMPACTS = ['safety', 'quality', 'cost', 'delivery', 'productivity', 'environment'];
export const IMPACT_LABELS = {
  safety: { th: 'ความปลอดภัย', en: 'Safety' },
  quality: { th: 'คุณภาพ', en: 'Quality' },
  cost: { th: 'ต้นทุน', en: 'Cost' },
  delivery: { th: 'การส่งมอบ', en: 'Delivery' },
  productivity: { th: 'ผลิตภาพ', en: 'Productivity' },
  environment: { th: 'สิ่งแวดล้อม', en: 'Environment' },
};

// support_needed (kaizen_projects.support_needed text[])
export const SUPPORT_NEEDED = ['equipment', 'budget', 'man_power', 'time', 'other'];
export const SUPPORT_NEEDED_LABELS = {
  equipment: { th: 'อุปกรณ์/เครื่องมือ', en: 'Equipment' },
  budget: { th: 'งบประมาณ', en: 'Budget' },
  man_power: { th: 'กำลังคน', en: 'Man power' },
  time: { th: 'เวลา', en: 'Time' },
  other: { th: 'อื่น ๆ', en: 'Other' },
};

// kaizen_projects.status — ลำดับ state machine ตาม supabase/schema.sql guard_kaizen_transition()
export const KAIZEN_STATUSES = [
  'draft', 'submitted', 'in_progress', 'pending_review',
  'scored', 'approved', 'need_revision', 'published',
];
export const KAIZEN_STATUS_LABELS = {
  draft:          { th: 'ร่าง',              en: 'Draft' },
  submitted:      { th: 'ส่งแล้ว',           en: 'Submitted' },
  in_progress:    { th: 'กำลังดำเนินการ',    en: 'In progress' },
  pending_review: { th: 'รอตรวจให้คะแนน',   en: 'Pending review' },
  scored:         { th: 'ให้คะแนนครบแล้ว',  en: 'Scored' },
  approved:       { th: 'อนุมัติแล้ว',       en: 'Approved' },
  need_revision:  { th: 'ต้องแก้ไข',         en: 'Need revision' },
  published:      { th: 'ประกาศผลแล้ว',      en: 'Published' },
};

// evaluation_periods.status
export const PERIOD_STATUSES = ['draft', 'open', 'scoring', 'closed', 'published'];
export const PERIOD_STATUS_LABELS = {
  draft:     { th: 'ร่าง',        en: 'Draft' },
  open:      { th: 'เปิดรับ',     en: 'Open' },
  scoring:   { th: 'กำลังให้คะแนน', en: 'Scoring' },
  closed:    { th: 'ปิดรอบแล้ว',  en: 'Closed' },
  published: { th: 'ประกาศผลแล้ว', en: 'Published' },
};

// kaizen_attachments.phase
export const ATTACHMENT_PHASES = ['before', 'during', 'after', 'evidence'];
export const ATTACHMENT_PHASE_LABELS = {
  before: { th: 'ก่อนทำ (Before)', en: 'Before' },
  during: { th: 'ระหว่างทำ (During)', en: 'During' },
  after: { th: 'หลังทำ (After)', en: 'After' },
  evidence: { th: 'หลักฐานอื่น ๆ (Evidence)', en: 'Evidence' },
};

// profiles.roles (subset)
export const ROLES = ['employee', 'committee', 'admin'];

// master_data.type
export const MASTER_DATA_TYPES = [
  'department', 'plant', 'committee_role', 'budget_band', 'cost_saving_band',
];

// เขตเวลากลางของทั้งระบบ — ทุกการคำนวณ/แสดงผลวันที่ (deadline, "เลยกำหนดกี่วัน", "วันนี้")
// อิงเขตเวลานี้เขตเดียวเสมอ ไม่ใช่ timezone ของเครื่อง/เบราว์เซอร์ผู้ใช้ (Suntory Wellness ใช้งาน
// ในไทยเท่านั้นตาม Spec.md §1) — ดู js/ui.js: todayInSystemTz/daysBetweenDateStrings/
// addDaysToDateString และ thaiDate/thaiDateTime ที่ผูกกับค่านี้ (Spec.md §4.8 backlog Low #2)
export const SYSTEM_TIMEZONE = 'Asia/Bangkok';
export const SYSTEM_TIMEZONE_LABEL = 'เวลาไทย (ICT, UTC+7)';
