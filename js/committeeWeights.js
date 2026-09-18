// js/committeeWeights.js — กล่อง "น้ำหนักกรรมการ" ที่ใช้ร่วมกัน 2 หน้า (2026-09-18)
//   1. adminPeriodNew.js     — ตอนสร้างรอบใหม่ (เลือกกรรมการในหน้าเดียวกับฟอร์มสร้างรอบ)
//   2. adminPeriodDetail.js  — ตอนแก้ไขน้ำหนักของรอบที่สร้างไว้แล้ว
// เดิมโค้ดชุดนี้อยู่ใน adminPeriodDetail.js ไฟล์เดียว — แยกออกมาตอนทำหน้าสร้างรอบแบบหน้าเดียว
// เพื่อไม่ให้มีโค้ดคำนวณ/แสดงผลน้ำหนัก 2 ชุดที่หลุดไม่ตรงกันทีหลัง
import { t, tf } from './i18n.js?v=20260911z15';
import { escapeHtml, masterLabel } from './ui.js?v=20260911z15';

// รายชื่อ + ตำแหน่งของกรรมการ 1 คน สำหรับโชว์ในแถวน้ำหนัก
export function candidateInfo(id, candidates, committeeRoles) {
  const c = candidates.find((x) => x.Id === id);
  if (!c) return { name: id, role: '' };
  const roleLabel = c.CommitteeRole ? masterLabel(committeeRoles, c.CommitteeRole) : '';
  return { name: `${c.FullName} (${c.EmployeeId})`, role: roleLabel };
}

// ★ ผู้ใช้ขอ (2026-09-18) — เดิมแอดมินต้องพิมพ์ % เองทีละคนให้ครบ 100 พอดี ทั้งที่แต่ละ
// committee_role มี default_weight_pct ตั้งไว้แล้วใน master_data (ดู seed.sql) ฟังก์ชันนี้คืนชุด
// น้ำหนักที่คำนวณจาก role ของกรรมการที่ active ทุกคน — role เดียวกันหลายคน (เช่น Plant manager
// 3 คน) หารสัดส่วน default_weight_pct ของ role นั้นเท่าๆ กัน คนที่ไม่มี committee_role ถูกข้าม
// (ไม่มีฐานให้คำนวณ ต้องเพิ่ม/ตั้งน้ำหนักเองต่อ)
export function computeStandardWeights(candidates, committeeRoles) {
  const byRole = new Map();
  for (const c of candidates) {
    if (!c.CommitteeRole) continue;
    if (!byRole.has(c.CommitteeRole)) byRole.set(c.CommitteeRole, []);
    byRole.get(c.CommitteeRole).push(c.Id);
  }
  const next = {};
  for (const [roleCode, uids] of byRole) {
    const roleDef = committeeRoles.find((r) => r.Code === roleCode);
    const totalPct = Number(roleDef?.Extra?.default_weight_pct ?? 0);
    if (totalPct <= 0) continue;
    const each = Math.round((totalPct / uids.length) * 100) / 100;
    for (const uid of uids) next[uid] = each;
  }
  return next;
}

export function weightSum(weights) {
  return Object.values(weights).reduce((a, b) => a + Number(b || 0), 0);
}

// หัวข้อ + badge รวม% (+ ช่องใส่ปุ่มท้ายแถว เช่น ปุ่มย่อ/ขยายในหน้า detail)
export function weightHeaderHtml({ weights, actionsHtml = '' }) {
  const sum = weightSum(weights);
  return `
    <div class="section-head">
      <h2>${t('apd_weights_heading')}</h2>
      <span class="badge" data-status="${sum === 100 ? 'approved' : 'need_revision'}">${sum === 100 ? t('apd_weight_complete_badge') : escapeHtml(tf('apd_weight_sum_badge', { pct: sum }))}</span>
      ${actionsHtml ? `<span class="spacer"></span>${actionsHtml}` : ''}
    </div>
  `;
}

// เนื้อในกล่อง: แถวรายคน + คำเตือนถ้ารวมไม่ครบ + ปุ่มใช้ค่ามาตรฐาน + แถวเพิ่มกรรมการ
// ผู้เรียกเป็นคนต่อปุ่มบันทึก/สร้าง/เปิดรอบ + กล่อง error เองข้างล่าง (แต่ละหน้าไม่เหมือนกัน)
export function weightBodyHtml({ weights, candidates, committeeRoles, editable = true, showIncompleteWarning = false }) {
  const sum = weightSum(weights);
  const rows = Object.entries(weights).map(([uid, pct]) => {
    const info = candidateInfo(uid, candidates, committeeRoles);
    return `
      <div class="member-row">
        <div style="flex:1;min-width:160px">
          <div style="font-size:13.5px;font-weight:600">${escapeHtml(info.name)}</div>
          ${info.role ? `<div class="muted" style="font-size:11.5px">${escapeHtml(info.role)}</div>` : ''}
        </div>
        <input type="number" min="0" max="100" data-uid="${uid}" class="weight-input" value="${pct}" style="width:90px" ${editable ? '' : 'disabled'} />
        ${editable ? `
          <button type="button" class="icon-btn" data-remove-weight="${uid}" aria-label="${escapeHtml(t('kzform_aria_delete'))}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M4 6h16M8 6V4h8v2M6 6l1 14h10l1-14"/></svg>
          </button>
        ` : ''}
      </div>
    `;
  }).join('');

  const candidateOptions = candidates
    .filter((c) => !(c.Id in weights))
    .map((c) => `<option value="${c.Id}">${escapeHtml(c.FullName)} (${escapeHtml(c.EmployeeId)})</option>`)
    .join('');

  return `
    <div id="weight-list">${rows || `<p class="muted">${t('apd_no_committee_yet')}</p>`}</div>
    ${showIncompleteWarning && sum !== 100 ? `
      <div class="warning" style="margin-top:var(--sp-3)">${t('apd_weight_warning')}</div>
    ` : ''}
    ${editable ? `
      <button type="button" class="secondary is-sm" id="btn-apply-standard-weights" style="margin-top:var(--sp-3)">${t('apd_apply_standard_weights_btn')}</button>
      <div class="member-row" style="margin-top:var(--sp-4)">
        <select id="f-add-committee" style="flex:1">
          <option value="">${t('apd_select_committee_placeholder')}</option>
          ${candidateOptions}
        </select>
        <input type="number" id="f-add-weight" min="0" max="100" placeholder="%" style="width:90px" />
        <button type="button" id="btn-add-weight" class="secondary">${t('apd_add_btn')}</button>
      </div>
    ` : ''}
  `;
}

// หัว+เนื้อรวมกัน (หน้าสร้างรอบใหม่ใช้ตัวนี้ — ไม่ต้องย่อ/ขยาย)
export function weightEditorHtml(opts) {
  return weightHeaderHtml({ weights: opts.weights }) + weightBodyHtml(opts);
}

// ผูก event ให้กล่องข้างบน — แก้ค่าในอ็อบเจกต์ weights ที่ผู้เรียกถือไว้โดยตรง (getWeights) และ
// เรียก setWeights ตอนแทนที่ทั้งชุด (ปุ่มใช้ค่ามาตรฐาน) แล้ว rerender ให้หน้าวาดใหม่เอง
export function wireWeightEditor({ getWeights, setWeights, candidates, committeeRoles, rerender }) {
  document.querySelectorAll('.weight-input').forEach((inp) => {
    // input = เก็บค่าอย่างเดียว (ไม่ rerender ระหว่างพิมพ์ ไม่งั้น focus/cursor หลุดทุกตัวอักษร)
    inp.addEventListener('input', (e) => { getWeights()[e.target.dataset.uid] = Number(e.target.value); });
    // ★ change (ตอนออกจากช่อง/กด Enter) ค่อย rerender — เดิมไม่มีบรรทัดนี้ ทำให้ badge "รวม x%"
    // /checklist/ปุ่มเปิดรอบ ค้างค่าเก่าจนกว่าจะกดบันทึกหรือเพิ่ม-ลบคน (บนหน้าสร้างรอบใหม่จะยิ่ง
    // งงหนักเพราะปุ่ม "สร้างและเปิดรอบ" ค้าง disabled ทั้งที่แก้ให้ครบ 100 แล้ว)
    inp.addEventListener('change', () => rerender());
  });
  document.querySelectorAll('[data-remove-weight]').forEach((btn) => {
    btn.addEventListener('click', () => { delete getWeights()[btn.dataset.removeWeight]; rerender(); });
  });
  document.getElementById('btn-apply-standard-weights')?.addEventListener('click', () => {
    setWeights(computeStandardWeights(candidates, committeeRoles));
    rerender();
  });
  document.getElementById('btn-add-weight')?.addEventListener('click', () => {
    const uid = document.getElementById('f-add-committee').value;
    const pct = Number(document.getElementById('f-add-weight').value || 0);
    if (!uid) return;
    getWeights()[uid] = pct;
    rerender();
  });
}
