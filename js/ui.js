// js/ui.js — helper กลางที่ view เรียกใช้ร่วมกัน (MIGRATION.md ข้อ 0c)
// escapeHtml ย้ายมาจากที่เคยซ้ำอยู่หลายไฟล์ — view อื่นควร import จากที่นี่แทนการประกาศเอง
import { KAIZEN_STATUS_LABELS, PERIOD_STATUS_LABELS, CRITERIA, SCORE_LEVELS, SYSTEM_TIMEZONE } from './constants.js?v=20260911z6';
import { getLang, setLang } from './i18n.js?v=20260911z6';

const ALL_STATUS_LABELS = { ...PERIOD_STATUS_LABELS, ...KAIZEN_STATUS_LABELS };
const ROLE_LABELS = {
  th: { employee: 'พนักงาน', committee: 'กรรมการ', admin: 'ผู้ดูแลระบบ' },
  en: { employee: 'Employee', committee: 'Committee', admin: 'Admin' },
};

export function escapeHtml(s) {
  const div = document.createElement('div');
  div.textContent = s ?? '';
  return div.innerHTML;
}

// escapeHtml() ปลอดภัยเฉพาะใน text content — ไม่ escape `"` เพราะไม่จำเป็นที่นั่น แต่ทำให้
// unsafe ทันทีถ้าเอาไปแทรกใน attribute ที่ครอบด้วย " (ค่าที่มี " หลุดออกจาก attribute ได้)
// ใช้ตัวนี้แทนทุกจุดที่ interpolate ค่าที่ผู้ใช้คุมได้เข้าไปใน attribute string
export function escapeAttr(s) {
  return escapeHtml(s).replace(/"/g, '&quot;');
}

// ★ trigger/RPC ใน schema.sql โยน error message เป็นภาษาอังกฤษดิบเสมอ (raise exception '...')
// — เดิม view ทุกไฟล์โชว์ err.message ตรงๆ กลางแอปภาษาไทย (Spec.md §4.8 finding M7) แม็ปข้อความ
// ที่ผู้ใช้จริงเจอบ่อยเป็นข้อความอ่านง่ายที่นี่ที่เดียว ข้อความที่ไม่รู้จัก (เช่น network error ทั่วไป)
// ให้คืน null เพื่อ fallback ไปที่ err.message เดิมหรือ common_error_generic ตามที่ผู้เรียกกำหนด
// ★ ผู้ใช้ขอ (2026-09-17, i18n audit Round 12) ให้ทำสองภาษา — เดิมคืนภาษาไทยเสมอไม่ว่า
// getLang() จะเป็นอะไร แต่ละรายการเป็น [pattern, thReplacement, enReplacement] แทน
// tuple 2 ช่องเดิม — replacement เป็น string หรือ function(m) ก็ได้เหมือนเดิม
const ERROR_MESSAGE_MAP = [
  [/^Submission deadline has passed$/, 'หมดเขตส่งผลงานของรอบนี้แล้ว', 'The submission deadline for this period has passed'],
  [/^Submission requires an open evaluation period$/, 'ต้องมีรอบประเมินที่เปิดอยู่จึงจะส่งได้', 'An open evaluation period is required to submit'],
  [/^At least one BEFORE photo is required$/, 'ต้องมีรูป "ก่อนทำ" อย่างน้อย 1 รูป', 'At least one "Before" photo is required'],
  [/^At least one AFTER photo is required$/, 'ต้องมีรูป "หลังทำ" อย่างน้อย 1 รูป', 'At least one "After" photo is required'],
  [/^At least one AFTER photo is required to mark a project completed$/, 'ต้องมีรูป "หลังทำ" อย่างน้อย 1 รูปก่อนทำเครื่องหมายว่าเสร็จ', 'At least one "After" photo is required before marking this complete'],
  [/^Required fields are incomplete$/, 'กรอกข้อมูลที่จำเป็นไม่ครบ', 'Required fields are incomplete'],
  [/^completion_date is required$/, 'ต้องระบุวันที่เสร็จ', 'A completion date is required'],
  [/^cost_saving_basis is required when cost_saving_per_month > 0$/, 'ต้องระบุหลักฐาน Cost saving เมื่อมีตัวเลข Cost saving/เดือน', 'Cost-saving evidence is required when a monthly cost-saving amount is entered'],
  [/^period_id is required to submit$/, 'ต้องเลือกรอบก่อนถึงจะส่งได้', 'A period must be selected before submitting'],
  [/^Only a draft project can be submitted$/, 'ส่งได้เฉพาะโครงการที่ยังเป็นร่างเท่านั้น', 'Only a draft project can be submitted'],
  [/^Only the owner may submit this project$/, 'เฉพาะเจ้าของโครงการเท่านั้นที่ส่งได้', 'Only the project owner can submit it'],
  [/^KAIZEN project not found$/, 'ไม่พบโครงการนี้', 'This project was not found'],
  [/^Cannot edit KAIZEN content once it is in the committee review queue$/, 'แก้ไขเนื้อหาโครงการไม่ได้แล้ว เพราะเข้าคิวกรรมการไปแล้ว', "This project's content can no longer be edited — it's already in the committee review queue"],
  [/^Score not found$/, 'ไม่พบใบคะแนนนี้', 'This score was not found'],
  [/^You may only submit your own score$/, 'ส่งได้เฉพาะคะแนนของตัวเองเท่านั้น', 'You may only submit your own score'],
  [/^Score is locked$/, 'คะแนนนี้ถูกล็อกแล้ว (รอบปิดแล้ว) แก้ไขไม่ได้อีก', 'This score is locked (the period has closed) and can no longer be edited'],
  [/^Score already submitted$/, 'ส่งคะแนนนี้ไปแล้ว', 'This score has already been submitted'],
  [/^Period is not accepting scores$/, 'รอบนี้ไม่รับคะแนนแล้ว', 'This period is no longer accepting scores'],
  [/^Missing scores for: (.+)$/, (m) => `ให้คะแนนไม่ครบเกณฑ์: ${m[1]}`, (m) => `Missing scores for: ${m[1]}`],
  [/^All committee members for this period must submit their scores first$/, 'ต้องรอกรรมการทุกคนในรอบนี้ให้คะแนนให้ครบก่อน', 'All committee members for this period must submit their scores first'],
  [/^Only admin can set status (.+)$/, (m) => `เฉพาะ admin เท่านั้นที่ตั้งสถานะ "${m[1]}" ได้`, (m) => `Only an admin can set the status to "${m[1]}"`],
  [/^Illegal transition (\S+) -> (\S+)$/, (m) => `เปลี่ยนสถานะจาก "${m[1]}" เป็น "${m[2]}" ไม่ได้`, (m) => `Cannot change status from "${m[1]}" to "${m[2]}"`],
  [/^Cannot close: (\d+) project\(s\) still pending committee review$/, (m) => `ปิดรอบไม่ได้ — ยังมี ${m[1]} โครงการที่รอกรรมการให้คะแนนอยู่`, (m) => `Cannot close this period — ${m[1]} project(s) are still pending committee review`],
  [/^Only an open or scoring period can be closed$/, 'ปิดได้เฉพาะรอบที่เปิดอยู่เท่านั้น', 'Only an open or scoring period can be closed'],
  [/^Only a closed period can be published$/, 'ประกาศผลได้เฉพาะรอบที่ปิดแล้วเท่านั้น', 'Only a closed period can be published'],
  [/^committee_weights must sum to 100 \(got (.+)\)$/, (m) => `น้ำหนักกรรมการต้องรวมเป็น 100% (ตอนนี้รวม ${m[1]}%)`, (m) => `Committee weights must sum to 100% (currently ${m[1]}%)`],
  [/^At least one committee member with a weight is required$/, 'ต้องมีกรรมการอย่างน้อย 1 คนก่อนเปิดรอบ', 'At least one committee member with a weight is required before opening the period'],
  [/^Another period is already open$/, 'มีอีกรอบที่เปิดอยู่แล้ว — ปิดรอบนั้นก่อน', 'Another period is already open — close it first'],
  [/^Only a draft period can be opened$/, 'เปิดได้เฉพาะรอบที่เป็นร่างเท่านั้น', 'Only a draft period can be opened'],
  [/^Period not found$/, 'ไม่พบรอบประเมินนี้', 'This evaluation period was not found'],
  [/^File must be one of: image\/jpeg, image\/png, image\/webp, image\/gif$/, 'ไฟล์ต้องเป็นรูปภาพประเภท JPEG, PNG, WEBP หรือ GIF เท่านั้น', 'The file must be a JPEG, PNG, WEBP, or GIF image'],
  [/violates check constraint "kaizen_attachments_mime_type_allowed"/, 'ไฟล์ต้องเป็นรูปภาพประเภท JPEG, PNG, WEBP หรือ GIF เท่านั้น', 'The file must be a JPEG, PNG, WEBP, or GIF image'],
  [/^Only admin can grant a temporary edit window$/, 'เฉพาะ admin เท่านั้นที่ให้สิทธิ์แก้ไขชั่วคราวได้', 'Only an admin can grant a temporary edit window'],
  [/^Edit window must be between 1 and 168 hours$/, 'ระยะเวลาสิทธิ์แก้ไขต้องอยู่ระหว่าง 1-168 ชั่วโมง (สูงสุด 7 วัน)', 'The edit window must be between 1 and 168 hours (7 days max)'],
  [/^A reason is required to grant a temporary edit window$/, 'กรุณาระบุเหตุผลก่อนให้สิทธิ์แก้ไขชั่วคราว', 'Please provide a reason before granting a temporary edit window'],
  [/^A temporary edit window can only be granted while status is need_revision$/, 'ให้สิทธิ์แก้ไขชั่วคราวได้เฉพาะโครงการที่สถานะ "ต้องแก้ไข" เท่านั้น', 'A temporary edit window can only be granted while the status is "Needs revision"'],
  [/^This project is already editable normally — no edit window needed$/, 'โครงการนี้แก้ไขได้ตามปกติอยู่แล้ว ไม่จำเป็นต้องให้สิทธิ์ชั่วคราว', 'This project is already editable normally — no edit window is needed'],
  [/^This project already has an active edit window$/, 'โครงการนี้มีสิทธิ์แก้ไขชั่วคราวที่ยังไม่หมดอายุอยู่แล้ว', 'This project already has an active edit window'],
  [/^Only admin can revoke a temporary edit window$/, 'เฉพาะ admin เท่านั้นที่เพิกถอนสิทธิ์แก้ไขชั่วคราวได้', 'Only an admin can revoke a temporary edit window'],
  [/^Edit grant not found or already revoked$/, 'ไม่พบสิทธิ์แก้ไขนี้ หรือถูกเพิกถอนไปแล้ว', 'This edit grant was not found, or has already been revoked'],
];

export function translateError(message, lang = getLang()) {
  if (!message) return null;
  for (const [pattern, th, en] of ERROR_MESSAGE_MAP) {
    const m = message.match(pattern);
    if (m) {
      const replacement = lang === 'en' ? en : th;
      return typeof replacement === 'function' ? replacement(m) : replacement;
    }
  }
  return null;
}

// title/sub รับ HTML ที่ผู้เรียก escape มาก่อนแล้ว (เผื่อต้องฝัง <span class="mono"> ปนได้)
// ส่วน eyebrow/breadcrumb label escape ให้อัตโนมัติ
export function pageHeader({ eyebrow, title, sub, actions, breadcrumb } = {}) {
  const crumbHtml = breadcrumb?.length
    ? `<div class="breadcrumb">${breadcrumb.map((c, i) => `${i > 0 ? '<span class="sep">/</span>' : ''}${c.href ? `<a href="${c.href}">${escapeHtml(c.label)}</a>` : `<span>${escapeHtml(c.label)}</span>`}`).join('')}</div>`
    : '';
  return `
    <header class="page-header">
      <div class="page-header-main">
        ${crumbHtml}
        ${eyebrow ? `<div class="eyebrow">${escapeHtml(eyebrow)}</div>` : ''}
        <h1>${title}</h1>
        ${sub ? `<p class="page-sub">${sub}</p>` : ''}
      </div>
      ${actions ? `<div class="page-header-actions">${actions}</div>` : ''}
    </header>
  `;
}

export function skeletonRows(n = 3) {
  const row = `
    <div class="skeleton-row">
      <div class="sk-main">
        <div class="skeleton sk-line" style="width:60%"></div>
        <div class="skeleton sk-line" style="width:35%"></div>
      </div>
      <div class="skeleton sk-end"></div>
    </div>
  `;
  return `<div class="skeleton-list">${row.repeat(n)}</div>`;
}

const STATE_ICONS = {
  error: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16h.01"/></svg>',
  warning: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3 2 20h20L12 3Z"/><path d="M12 10v4M12 17h.01"/></svg>',
  forbidden: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="m8 8 8 8"/></svg>',
};

// kind: 'error' | 'warning' | 'forbidden' | undefined — body รับ HTML (ผู้เรียก escape เอง)
export function stateCard({ kind, icon, title, body, actions } = {}) {
  const cls = kind ? ` is-${kind}` : '';
  const svg = icon ?? STATE_ICONS[kind] ?? STATE_ICONS.error;
  return `
    <div class="state-card${cls}">
      <div class="state-icon">${svg}</div>
      <div class="state-main">
        <div class="state-title">${escapeHtml(title ?? '')}</div>
        ${body ? `<p class="state-body">${body}</p>` : ''}
        ${actions ? `<div class="state-actions">${actions}</div>` : ''}
      </div>
    </div>
  `;
}

// action รับ HTML ปุ่ม/ลิงก์ทั้งก้อน (ไม่ใช่แค่ label เฉย ๆ)
export function emptyState({ title, body, action } = {}) {
  return `
    <div class="empty-state">
      <div class="empty-title">${escapeHtml(title ?? '')}</div>
      ${body ? `<p>${escapeHtml(body)}</p>` : ''}
      ${action ? `<div class="empty-actions">${action}</div>` : ''}
    </div>
  `;
}

// ★ default เดิม lang='th' ตายตัว ทำให้ 5 ใน 6 จุดที่เรียกไม่ได้ส่ง lang เข้ามาแล้วโชว์ไทยเสมอ
// แม้ตั้งค่า EN ไว้ (i18n audit Round 12) — เปลี่ยน default เป็น getLang() แทน ผู้เรียกเดิมที่ไม่ได้
// ส่ง lang จะได้ภาษาปัจจุบันอัตโนมัติโดยไม่ต้องแก้ call site ทีละจุด
export function statusBadge(status, lang = getLang()) {
  const label = ALL_STATUS_LABELS[status]?.[lang] ?? status;
  return `<span class="badge" data-status="${status}">${escapeHtml(label)}</span>`;
}

export function statusDot(status) {
  return `<span class="dot" data-status="${status}"></span>`;
}

// ★ ระบุ timeZone: SYSTEM_TIMEZONE เสมอ — ไม่งั้น toLocaleDateString/toLocaleTimeString จะ
// format ตาม timezone ของเครื่อง/เบราว์เซอร์ผู้ใช้ (ผิดถ้ามีคนเปิดเครื่องนอกไทย ค่า date-only
// อย่าง PeriodStart/PeriodEnd ก็ถูกตีความเป็นเที่ยงคืน UTC มาก่อนแล้วด้วย — ระบุ timeZone ตรงนี้
// ให้ผลลัพธ์คงที่ไม่ว่าเครื่องผู้ใช้จะตั้งเขตเวลาอะไรไว้ (Spec.md §4.8 backlog Low #2)
// ★ ชื่อฟังก์ชันยังเป็น "thai"Date ตามเดิม (ไม่เปลี่ยนชื่อ กัน call site ทั้งแอปต้องแก้) แต่ locale
// ที่ใช้จริงตอนนี้ขึ้นกับภาษา — เดิม hardcode 'th-TH' ตายตัว ซึ่งผูกปฏิทินพุทธศักราช+เดือนย่อไทยไว้
// อัตโนมัติ (ยืนยันด้วย Intl.DateTimeFormat จริง) แม้ตั้งค่าเป็น EN ก็ยังเห็นปี พ.ศ./เดือนไทยอยู่ดี
// (i18n audit Round 12) — เพิ่ม lang = getLang() แล้วสลับเป็น 'en-GB' (ปฏิทินสากล เรียง วัน-เดือน-ปี
// แบบเดียวกับ th-TH ไม่สลับเป็น เดือน-วัน-ปี แบบ en-US ให้งง) เมื่อภาษาเป็น EN
export function thaiDate(iso, lang = getLang()) {
  if (!iso) return '—';
  const locale = lang === 'en' ? 'en-GB' : 'th-TH';
  return new Date(iso).toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric', timeZone: SYSTEM_TIMEZONE });
}

export function thaiDateTime(iso, lang = getLang()) {
  if (!iso) return '—';
  const locale = lang === 'en' ? 'en-GB' : 'th-TH';
  const d = new Date(iso);
  return `${thaiDate(iso, lang)} ${d.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit', timeZone: SYSTEM_TIMEZONE })}`;
}

// วันที่ปัจจุบัน "YYYY-MM-DD" ตาม SYSTEM_TIMEZONE (ไม่ใช่ timezone เครื่องผู้ใช้) — ใช้เทียบกับ
// ฟิลด์ date-only อย่าง NextFollowUpDate แทน Date.now()/new Date() ตรงๆ
export function todayInSystemTz() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: SYSTEM_TIMEZONE }).format(new Date());
}

// ★ ห้ามเทียบวันที่ date-only (เช่น NextFollowUpDate) ด้วย new Date(str) เทียบ Date.now()/new
// Date() ตรงๆ — new Date('2026-09-20') ถูกตีความเป็นเที่ยงคืน UTC เสมอ (ECMA-262) ซึ่งคือ 07:00 น.
// เวลาไทย ไม่ใช่เที่ยงคืนไทย ทำให้ "เลยกำหนด" ขยับเร็วไป/ช้าไปได้ถึง 7 ชม. รอบเที่ยงคืน — ฟังก์ชัน
// กลุ่มนี้เทียบเป็น calendar date ล้วนๆ แทน (Spec.md §4.8 backlog Low #2)

// จำนวนวันเต็ม (laterStr - earlierStr) ระหว่าง 2 วันที่แบบ "YYYY-MM-DD" — anchor ทั้งคู่ที่
// เที่ยงคืน UTC เหมือนกันแล้วลบกัน (offset หักล้างกันพอดี) จึงได้ผลต่างวันปฏิทินที่แม่นยำเสมอ
export function daysBetweenDateStrings(laterStr, earlierStr) {
  const [ly, lm, ld] = laterStr.split('-').map(Number);
  const [ey, em, ed] = earlierStr.split('-').map(Number);
  return Math.round((Date.UTC(ly, lm - 1, ld) - Date.UTC(ey, em - 1, ed)) / 86400000);
}

// บวกวัน (จำนวนเต็ม, ลบได้) เข้ากับวันที่ "YYYY-MM-DD" คืนค่ารูปแบบเดียวกัน
export function addDaysToDateString(dateStr, days) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

// แปลงค่า input[type=datetime-local] ("YYYY-MM-DDTHH:mm") เป็น ISO timestamp ที่ตีความว่าเป็น
// เวลา SYSTEM_TIMEZONE เสมอ (ไทยไม่มี daylight saving จึงเป็น offset +07:00 คงที่ทั้งปี) — ไม่พึ่ง
// new Date(str) ตรงๆ ซึ่งตีความตาม timezone ของเครื่อง/เบราว์เซอร์ผู้กรอกแทน (ถ้า admin เปิดเครื่อง
// ขณะอยู่นอกไทย ค่า deadline จะเพี้ยนไปตามนั้น) (Spec.md §4.8 backlog Low #2)
export function parseDatetimeLocalInSystemTz(value) {
  return new Date(`${value}:00+07:00`).toISOString();
}

export function roleLabel(role, lang = getLang()) {
  return ROLE_LABELS[lang]?.[role] ?? ROLE_LABELS.th[role] ?? role;
}

// ★ ใหม่ (i18n audit Round 12) — ชื่อแผนก/โรงงาน/งบประมาณ ฯลฯ ใน master_data มีคอลัมน์ label_en
// เก็บคำแปลอังกฤษไว้จริงอยู่แล้ว (แอดมินกรอกได้ในหน้า adminMaster.js) แต่ไม่เคยถูกใช้แสดงผลเลย —
// ทุกจุดที่โชว์ label ให้ผู้ใช้ทั่วไปเห็นเรียก .LabelTh ตรงๆ เสมอ helper นี้แทนที่ pattern
// `(code) => list.find(x => x.Code === code)?.LabelTh ?? code` ที่เคยประกาศซ้ำในหลายไฟล์
export function masterLabel(list, code, lang = getLang()) {
  const row = list?.find((r) => r.Code === code);
  if (!row) return code;
  return (lang === 'en' ? row.LabelEn : row.LabelTh) || row.LabelTh || code;
}

// รายชื่อ 7 เกณฑ์ — ใช้ในหน้า login/register กดแต่ละอันเพื่อเปิด popup ดู rubric 5 ระดับเต็ม
// (ดึงจาก SCORE_LEVELS เดียวกับที่ reviewScore.js ใช้ตอนกรรมการให้คะแนนจริง) ต้องเรียก
// wireCriteriaTags(container) หลัง render เพื่อผูก click ให้ปุ่มเหล่านี้เปิด popup ได้จริง
export function criteriaTags(lang = 'th') {
  return `<div class="criteria-tags">${CRITERIA
    .map((c) => `<button type="button" class="criteria-tag" data-criterion-code="${c.code}">${escapeHtml(lang === 'en' ? c.labelEn : c.labelTh)}</button>`)
    .join('')}</div>`;
}

export function wireCriteriaTags(container) {
  container.querySelectorAll('.criteria-tag[data-criterion-code]').forEach((btn) => {
    btn.addEventListener('click', () => openCriteriaDetail(btn.dataset.criterionCode));
  });
}

// ปุ่มสลับภาษา (TH/EN) สำหรับหน้า auth ทั้ง 4 หน้า (login/register/forgotPassword/resetPassword)
// — ผู้ใช้ยังไม่ล็อกอินตอนนี้จึงไม่เห็นปุ่มสลับภาษาใน sidebar เลย (นั่นอยู่หลังล็อกอินเท่านั้น)
// ตำแหน่งเดียวกันทุกหน้า (position:fixed ผ่าน .auth-lang-switch ใน style.css ไม่ผูกกับ layout
// ของแต่ละหน้า) onSwitch คือ callback ให้ view เรียก render ตัวเองซ้ำ (แต่ละหน้า signature
// ต่างกัน จึงให้ผู้เรียก wrap เป็น closure เอง เช่น `() => render(container)`)
// ★ ปรับตาม design ที่ผู้ใช้ส่งมา (Uiverse.io by Pradeepsaranbishnoi, 2026-09-15) — เดิมมี 3 แท็บ
// ตัดเหลือ 2 (TH/EN) เท่าที่ต้องใช้ — input[type=radio]+label ต้องเรียงคู่กันตามลำดับ (label ใช้
// adjacent-sibling `+` เช็ค :checked, .lang-switch-glider ใช้ general-sibling `~` เลื่อนตำแหน่ง)
// ห้ามสลับลำดับ input/label เป็นอย่างอื่น ไม่งั้น selector พวกนี้จะจับไม่ตรง
export function authLangSwitchHtml() {
  const lang = getLang();
  return `
    <div class="lang-switch auth-lang-switch">
      <input type="radio" id="lang-switch-th" name="lang-switch-toggle" ${lang === 'th' ? 'checked' : ''} />
      <label class="lang-switch-tab" for="lang-switch-th">TH</label>
      <input type="radio" id="lang-switch-en" name="lang-switch-toggle" ${lang === 'en' ? 'checked' : ''} />
      <label class="lang-switch-tab" for="lang-switch-en">EN</label>
      <span class="lang-switch-glider"></span>
    </div>
  `;
}

export function wireAuthLangSwitch(onSwitch) {
  document.getElementById('lang-switch-th')?.addEventListener('change', () => {
    if (getLang() !== 'th') { setLang('th'); onSwitch(); }
  });
  document.getElementById('lang-switch-en')?.addEventListener('change', () => {
    if (getLang() !== 'en') { setLang('en'); onSwitch(); }
  });
}

function onCriteriaModalKeydown(e) {
  if (e.key === 'Escape') closeCriteriaDetail();
}

export function openCriteriaDetail(code) {
  const criterion = CRITERIA.find((c) => c.code === code);
  const levels = SCORE_LEVELS[code];
  if (!criterion || !levels) return;
  closeCriteriaDetail();
  const lang = getLang();
  const label = lang === 'en' ? criterion.labelEn : criterion.labelTh;
  const backdrop = document.createElement('div');
  backdrop.className = 'info-modal-backdrop';
  backdrop.id = 'criteria-modal';
  backdrop.innerHTML = `
    <div class="info-modal" role="dialog" aria-modal="true" aria-label="${escapeHtml(label)}">
      <button type="button" class="info-modal-close" aria-label="ปิด">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>
      </button>
      <h3>${escapeHtml(label)}</h3>
      <div class="info-modal-levels">
        ${levels.map((lv) => `
          <div class="score-option is-static">
            <span class="lv">${lv.level}</span>
            <span>${escapeHtml(lang === 'en' ? lv.textEn : lv.textTh)}</span>
          </div>
        `).join('')}
      </div>
    </div>
  `;
  document.body.appendChild(backdrop);
  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop || e.target.closest('.info-modal-close')) closeCriteriaDetail();
  });
  document.addEventListener('keydown', onCriteriaModalKeydown);
}

export function closeCriteriaDetail() {
  document.getElementById('criteria-modal')?.remove();
  document.removeEventListener('keydown', onCriteriaModalKeydown);
}

// เปิดรูปขนาดใหญ่แบบ lightbox — ใช้ร่วมกันทุกหน้าที่มีรูป (kaizenDetail/reviewScore/kaizenForm)
// สร้าง/ลบ element ทุกครั้งที่เปิด/ปิด แทนการเก็บ singleton ไว้ข้าม view (view ไฟล์ dynamic
// import ใหม่ทุกครั้งที่ navigate ตาม router.js แต่ ui.js เป็น module เดียวคงอยู่ทั้ง session —
// เก็บ singleton ไว้ก็ได้ แต่สร้างใหม่ทุกครั้งเข้าใจง่ายกว่าและกันปัญหา element ค้าง)
function onLightboxKeydown(e) {
  if (e.key === 'Escape') closeLightbox();
}

export function openLightbox(url, alt = '') {
  if (!url) return;
  closeLightbox();
  const el = document.createElement('div');
  el.className = 'lightbox';
  el.id = 'kaizen-lightbox';
  el.innerHTML = `
    <button type="button" class="lightbox-close" aria-label="ปิด">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>
    </button>
    <img alt="${escapeAttr(alt)}" />
  `;
  el.querySelector('img').src = url;
  document.body.appendChild(el);
  el.addEventListener('click', (e) => {
    if (e.target === el || e.target.closest('.lightbox-close')) closeLightbox();
  });
  document.addEventListener('keydown', onLightboxKeydown);
}

export function closeLightbox() {
  document.getElementById('kaizen-lightbox')?.remove();
  document.removeEventListener('keydown', onLightboxKeydown);
}

// ย่อรูป + ลบ EXIF/GPS ก่อนอัปโหลด (วาดลง canvas แล้ว re-encode ทิ้ง metadata ไปในตัว —
// ไม่ต้องมี Edge Function ตามที่ B9 ในเอกสารเดิมคิดไว้) — ใช้ร่วมกัน kaizenForm.js (รูปโครงการ)
// และ register.js (รูปโปรไฟล์)
export async function resizeImage(file, maxDim = 1600, quality = 0.82) {
  if (!file.type?.startsWith('image/')) return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    canvas.getContext('2d').drawImage(bitmap, 0, 0, w, h);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
    if (!blob) return file;
    return new File([blob], file.name.replace(/\.\w+$/, '.jpg'), { type: 'image/jpeg' });
  } catch {
    return file; // ย่อไม่สำเร็จ (browser เก่า ฯลฯ) — อัปโหลดไฟล์เดิมแทนดีกว่าบล็อกผู้ใช้
  }
}

export function initials(fullName) {
  if (!fullName) return '';
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '';
  if (parts.length === 1) return parts[0].slice(0, 2);
  return parts[0].slice(0, 1) + parts[1].slice(0, 1);
}

// รูปจริงแทนตัวย่อชื่อ (progressive: render ตัวย่อก่อนเสมอผ่าน escapeHtml(initials(...)) ปกติ,
// ใส่ data-avatar-path เพิ่มถ้ามีรูป แล้วค่อยเรียกฟังก์ชันนี้หลัง render เพื่อสลับเป็น <img> —
// ตัวย่อชื่อเดิมยังอยู่ใน DOM เป็น fallback ถ้ารูปโหลดไม่สำเร็จ/signed url หมดอายุ)
// getSignedUrl รับมาจากผู้เรียก (เช่น api.js's getAvatarSignedUrl) กัน ui.js ผูกกับ api.js ตรงๆ
export async function hydrateAvatars(root, getSignedUrl) {
  const els = [...root.querySelectorAll('[data-avatar-path]')];
  if (!els.length) return;
  const urlCache = new Map();
  await Promise.all(els.map(async (el) => {
    const path = el.dataset.avatarPath;
    try {
      if (!urlCache.has(path)) urlCache.set(path, getSignedUrl(path));
      const url = await urlCache.get(path);
      await new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = resolve;
        img.onerror = reject;
        img.src = url;
      });
      el.innerHTML = `<img src="${url}" alt="" />`;
    } catch { /* เก็บตัวย่อชื่อเดิมไว้เป็น fallback */ }
  }));
}
