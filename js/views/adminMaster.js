// js/views/adminMaster.js — filter-chip แทน select, ฟิลด์ Extra ตามชนิดแทน JSON ดิบ (MIGRATION.md ข้อ 13)
import { getAllMasterData, createMasterDataRow, updateMasterDataRow } from '../api.js?v=20260911z9';
import { t, tf } from '../i18n.js?v=20260911z9';
import { escapeHtml, translateError, pageHeader, skeletonRows, stateCard } from '../ui.js?v=20260911z9';
import { MASTER_DATA_TYPES } from '../constants.js?v=20260911z9';

function typeLabel(tp) {
  return t(`am_type_${tp}`);
}

// ★ ห้ามใช้ class="field-label" ครอบ label ที่มี input อยู่ข้างใน — field-label ตั้งใจ
//   ใช้เป็นแค่หัวข้อเฉยๆ (display:block) ที่อื่นในแอปทั้งหมด ไม่เคยห่อ input ตรงๆ ถ้าเอามาห่อ
//   input จะเสีย behavior "label อยู่บน input อยู่ล่าง" จาก label{flex-direction:column}
//   ทั่วไป กลายเป็นข้อความ+input เรียงติดกันแนวนอนแทน (เจอจากภาพจริงที่ผู้ใช้ส่งมา — ช่อง
//   Min/Max/Rank ดูเพี้ยน) ใช้ label เฉยๆ + class ใหม่ .extra-fields คุม layout แทน
function extraFieldsHtml(type, extra) {
  if (type === 'committee_role') {
    return `<label style="margin:0;max-width:160px">${t('am_default_weight_label')}<input type="number" min="0" max="100" class="x-weight is-num" value="${extra?.default_weight_pct ?? ''}" /></label>`;
  }
  if (type === 'budget_band' || type === 'cost_saving_band') {
    return `
      <div class="extra-fields">
        <label style="margin:0">Min<input type="number" min="0" class="x-min is-num" value="${extra?.min ?? 0}" /></label>
        <label style="margin:0">${t('am_max_unlimited_label')}<input type="number" min="0" class="x-max is-num" value="${extra?.max ?? ''}" /></label>
        ${type === 'cost_saving_band' ? `<label style="margin:0">Rank<input type="number" min="1" max="5" class="x-rank is-num" value="${extra?.rank ?? ''}" /></label>` : ''}
      </div>
    `;
  }
  return `<span class="muted" style="font-size:12.5px">${t('am_none_label')}</span>`;
}

function readExtraFields(type, scope) {
  if (type === 'committee_role') {
    const v = scope.querySelector('.x-weight')?.value;
    return v === '' || v == null ? {} : { default_weight_pct: Number(v) };
  }
  if (type === 'budget_band' || type === 'cost_saving_band') {
    const min = Number(scope.querySelector('.x-min')?.value || 0);
    const maxRaw = scope.querySelector('.x-max')?.value;
    const extra = { min, max: maxRaw === '' || maxRaw == null ? null : Number(maxRaw) };
    if (type === 'cost_saving_band') {
      const rankRaw = scope.querySelector('.x-rank')?.value;
      extra.rank = rankRaw === '' ? null : Number(rankRaw);
    }
    return extra;
  }
  return {};
}

export async function render(container) {
  document.title = `${t('nav_admin_master')} · ${t('appName')}`;
  container.innerHTML = `<div class="page-body">${skeletonRows(3)}</div>`;

  const rowsByType = {};
  try {
    const lists = await Promise.all(MASTER_DATA_TYPES.map((tp) => getAllMasterData(tp)));
    MASTER_DATA_TYPES.forEach((tp, i) => { rowsByType[tp] = lists[i]; });
  } catch (err) {
    container.innerHTML = `<div class="page-body">${stateCard({
      kind: 'error', title: t('error_load_failed'), body: escapeHtml(translateError(err.message) || err.message || t('common_error_generic')),
      actions: `<button type="button" onclick="location.reload()">${t('state_retry')}</button>`,
    })}</div>`;
    return;
  }

  const state = { type: MASTER_DATA_TYPES[0], dirtyRows: new Set(), saving: false, error: '' };

  renderPage();

  function renderPage() {
    const rows = rowsByType[state.type];
    const chips = MASTER_DATA_TYPES.map((tp) => `<button type="button" class="filter-chip ${state.type === tp ? 'is-on' : ''}" data-type="${tp}">${escapeHtml(typeLabel(tp))} ${rowsByType[tp].length}</button>`).join('');

    const rowsHtml = rows.map((r) => `
      <tr data-row="${r.Id}" ${state.dirtyRows.has(r.Id) ? 'class="is-dirty"' : ''}>
        <td class="mono">${escapeHtml(r.Code)}</td>
        <td><input type="text" class="f-label-th" value="${escapeHtml(r.LabelTh)}" /></td>
        <td><input type="text" class="f-label-en" value="${escapeHtml(r.LabelEn)}" /></td>
        <td><input type="number" class="f-sort is-num" value="${r.SortOrder ?? 0}" /></td>
        <td>${extraFieldsHtml(state.type, r.Extra)}</td>
        <td><input type="checkbox" class="f-active" ${r.IsActive ? 'checked' : ''} /></td>
      </tr>
    `).join('');

    container.innerHTML = `
      ${pageHeader({ title: t('nav_admin_master') })}
      <div class="page-body">
        <div class="filter-bar" style="margin-bottom:16px">${chips}</div>
        ${state.type === 'committee_role' ? `<div class="note" style="margin-bottom:var(--sp-4)">${tf('am_committee_weight_note', { link: `<a href="#/admin/periods">${escapeHtml(t('am_periods_page_link'))}</a>` })}</div>` : ''}
        <div id="master-error"></div>
        <div class="panel is-scroll">
          <table class="data-table">
            <thead><tr><th>Code</th><th>${t('am_col_label_th')}</th><th>${t('am_col_label_en')}</th><th>${t('am_col_sort_order')}</th><th>${t('am_col_extra')}</th><th>Active</th></tr></thead>
            <tbody>${rowsHtml}</tbody>
          </table>
        </div>
        <div class="hstack" style="margin-top:var(--sp-5)">
          <button type="button" id="btn-save-all" ${state.dirtyRows.size === 0 || state.saving ? 'disabled' : ''}>${state.saving ? t('common_loading') : t('am_save_changes_btn')}</button>
          <span class="muted" id="dirty-count" style="font-size:12.8px" ${state.dirtyRows.size === 0 ? 'hidden' : ''}>${escapeHtml(tf('am_dirty_count', { n: state.dirtyRows.size }))}</span>
        </div>

        <div class="section-head"><h2>${escapeHtml(tf('am_add_new_heading', { type: typeLabel(state.type) }))}</h2></div>
        <div class="field-row">
          <label>Code<input type="text" id="new-code" /></label>
          <label>${t('am_col_label_th')}<input type="text" id="new-label-th" /></label>
          <label>${t('am_col_label_en')}<input type="text" id="new-label-en" /></label>
          <label>${t('am_col_sort_order')}<input type="number" id="new-sort" value="0" class="is-num" /></label>
        </div>
        ${state.type !== 'department' && state.type !== 'plant' ? `<label class="field-label" style="margin-top:var(--sp-4)">${t('am_col_extra')}</label>` : ''}
        <div id="new-extra-wrap">${extraFieldsHtml(state.type, {})}</div>
        <div id="new-error" style="margin-top:var(--sp-2)"></div>
        <button type="button" id="btn-add-row" style="margin-top:var(--sp-5)">${t('apd_add_btn')}</button>
      </div>
    `;

    if (state.error) document.getElementById('master-error').innerHTML = `<div class="error">${escapeHtml(state.error)}</div>`;

    container.querySelectorAll('[data-type]').forEach((btn) => btn.addEventListener('click', () => { state.type = btn.dataset.type; state.dirtyRows.clear(); renderPage(); }));
    container.querySelectorAll('tr[data-row] input').forEach((inp) => {
      inp.addEventListener('input', () => markRowDirty(inp.closest('tr')));
      if (inp.type === 'checkbox') inp.addEventListener('change', () => markRowDirty(inp.closest('tr')));
    });
    document.getElementById('btn-save-all').addEventListener('click', onSaveAll);
    document.getElementById('btn-add-row').addEventListener('click', onAddRow);
  }

  // ★ เดิม input handler แก้แค่ state.dirtyRows โดยไม่แตะ DOM เลย ทำให้ปุ่ม "บันทึกการ
  //   เปลี่ยนแปลง" ที่ disabled มาจากตอน render ครั้งแรก (dirtyRows ว่าง) ไม่มีทางถูกเปิดใช้งาน
  //   ได้อีกเลย — แก้ไขในตารางแล้วกดบันทึกไม่ได้จริง ๆ ต้อง sync DOM ตรงนี้แทนการ renderPage()
  //   เต็มรูปแบบ (ซึ่งจะรีเซ็ต input ที่ผู้ใช้เพิ่งพิมพ์อยู่ ตัด focus/cursor หาย)
  function markRowDirty(row) {
    const id = row.dataset.row;
    const isNew = !state.dirtyRows.has(id);
    state.dirtyRows.add(id);
    if (isNew) row.classList.add('is-dirty');
    const btn = document.getElementById('btn-save-all');
    btn.disabled = state.saving;
    const countEl = document.getElementById('dirty-count');
    countEl.hidden = false;
    countEl.textContent = tf('am_dirty_count', { n: state.dirtyRows.size });
  }

  async function onSaveAll() {
    // ★ ต้องอ่านค่าจาก input ทุกแถวที่แก้ไว้ "ก่อน" เรียก renderPage() เสมอ — renderPage()
    // สร้าง <tr> ใหม่ทั้งหมดจาก rowsByType (ค่าที่เพิ่งเซฟ ยังไม่ใช่ค่าที่พิมพ์ล่าสุด) ทำให้ค่า
    // ที่ผู้ใช้เพิ่งพิมพ์ในช่อง input หายไปทันทีถ้า renderPage() มาก่อนอ่านค่า (บั๊กจริงที่เจอ —
    // แก้ไขชื่อแล้วกด "บันทึกการเปลี่ยนแปลง" กลับไปเป็นค่าเดิมเสมอ เพราะ state.saving=true ข้างล่าง
    // เรียก renderPage() ล้าง input ก่อนที่ for-loop จะทันได้อ่านค่าที่พิมพ์ไว้)
    const pending = [...state.dirtyRows].map((id) => {
      const row = document.querySelector(`tr[data-row="${id}"]`);
      return row ? {
        id,
        patch: {
          LabelTh: row.querySelector('.f-label-th').value,
          LabelEn: row.querySelector('.f-label-en').value,
          SortOrder: Number(row.querySelector('.f-sort').value || 0),
          IsActive: row.querySelector('.f-active').checked,
          Extra: readExtraFields(state.type, row),
        },
      } : null;
    }).filter(Boolean);

    state.saving = true; state.error = ''; renderPage();
    try {
      for (const { id, patch } of pending) {
        const updated = await updateMasterDataRow(id, patch);
        const idx = rowsByType[state.type].findIndex((r) => r.Id === id);
        rowsByType[state.type][idx] = updated;
      }
      state.dirtyRows.clear();
    } catch (err) {
      state.error = translateError(err.message) || err.message || t('common_error_generic');
    } finally {
      state.saving = false;
      renderPage();
    }
  }

  async function onAddRow() {
    const code = document.getElementById('new-code').value.trim();
    const labelTh = document.getElementById('new-label-th').value.trim();
    const labelEn = document.getElementById('new-label-en').value.trim();
    const sortOrder = Number(document.getElementById('new-sort').value || 0);
    const errorEl = document.getElementById('new-error');
    errorEl.innerHTML = '';

    if (!code || !labelTh || !labelEn) {
      errorEl.innerHTML = `<div class="error">${escapeHtml(t('am_err_fill_required'))}</div>`;
      return;
    }

    try {
      const extra = readExtraFields(state.type, document.getElementById('new-extra-wrap'));
      const created = await createMasterDataRow({ Type: state.type, Code: code, LabelTh: labelTh, LabelEn: labelEn, SortOrder: sortOrder, Extra: extra });
      rowsByType[state.type].push(created);
      renderPage();
    } catch (err) {
      errorEl.innerHTML = `<div class="error">${escapeHtml(translateError(err.message) || err.message || t('common_error_generic'))}</div>`;
    }
  }
}
