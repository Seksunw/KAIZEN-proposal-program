// js/views/adminPeriodNew.js — หน้าสร้างรอบใหม่แบบ "หน้าเดียวจบ" (2026-09-18, ผู้ใช้ขอ)
// เดิมฟอร์มสร้างรอบฝังอยู่ล่างสุดของหน้า list (adminPeriods.js) สร้างเสร็จแล้วเด้งไปหน้า detail
// เพื่อตั้งน้ำหนักกรรมการอีกที — ผู้ใช้ขอให้รวมเป็นหน้าเดียว: กรอกชื่อ/วันที่ + เลือกกรรมการ +
// กดเปิดรอบ จบในหน้านี้ (กล่องน้ำหนักกรรมการใช้โมดูลร่วม js/committeeWeights.js ตัวเดียวกับที่
// adminPeriodDetail.js ใช้ — แก้ที่เดียวมีผลทั้งสองหน้า)
import { createPeriod, updatePeriod, openPeriod, getCommitteeCandidates, getMasterData } from '../api.js?v=20260911z15';
import { t, tf } from '../i18n.js?v=20260911z15';
import { navigate } from '../router.js?v=20260911z15';
import { escapeHtml, escapeAttr, translateError, pageHeader, skeletonRows, stateCard, parseDatetimeLocalInSystemTz } from '../ui.js?v=20260911z15';
import { computeStandardWeights, weightEditorHtml, wireWeightEditor, weightSum } from '../committeeWeights.js?v=20260911z15';

export async function render(container) {
  document.title = `${t('ap_create_heading')} · ${t('appName')}`;
  container.innerHTML = `<div class="page-body">${skeletonRows(3)}</div>`;

  let candidates = [];
  let committeeRoles = [];
  try {
    [candidates, committeeRoles] = await Promise.all([
      getCommitteeCandidates(),
      getMasterData('committee_role'),
    ]);
  } catch (err) {
    container.innerHTML = `<div class="page-body">${stateCard({
      kind: 'error',
      title: t('error_load_failed'),
      body: escapeHtml(translateError(err.message) || err.message || t('common_error_generic')),
      actions: `<button type="button" onclick="location.reload()">${t('state_retry')}</button>`,
    })}</div>`;
    return;
  }

  const state = {
    fields: { code: '', nameTh: '', nameEn: '', start: '', end: '', deadline: '' },
    // เติมน้ำหนักมาตรฐานตามตำแหน่งให้ตั้งแต่เปิดหน้ามาเลย (แอดมินแก้/ลบ/เพิ่มได้ก่อนกดสร้าง)
    weights: computeStandardWeights(candidates, committeeRoles),
    // รอบที่สร้างสำเร็จแล้วแต่ยังเปิดไม่สำเร็จ (เช่น RPC open_period ไม่ผ่านเงื่อนไข) — เก็บไว้ให้
    // กดเปิดซ้ำได้โดยไม่สร้างรอบซ้ำอีกใบ
    created: null,
    saving: false,
    error: '',
  };

  renderPage();

  function renderPage() {
    const sum = weightSum(state.weights);
    const canOpen = sum === 100;
    const f = state.fields;
    const lockFields = Boolean(state.created);

    container.innerHTML = `
      ${pageHeader({
        breadcrumb: [{ label: t('nav_admin_periods'), href: '#/admin/periods' }, { label: t('ap_create_heading') }],
        title: t('ap_create_heading'),
      })}
      <div class="page-body">
        ${state.created ? `<div class="note" style="margin-bottom:var(--sp-4)">${t('apn_created_note')}</div>` : ''}
        <div class="two-col" style="gap:var(--sp-6)">
          <div>
            <div class="section-head"><h2>${t('apn_period_info_heading')}</h2></div>
            <p class="field-hint">${t('ap_create_hint')}</p>
            <label style="margin-top:var(--sp-5)">${t('ap_field_code_label')}
              <input type="text" id="f-code" value="${escapeAttr(f.code)}" ${lockFields ? 'disabled' : ''} />
              <span class="field-hint">${t('ap_field_code_hint')}</span>
            </label>
            <label style="margin-top:var(--sp-5)">${t('ap_field_name_th_label')}<input type="text" id="f-name-th" value="${escapeAttr(f.nameTh)}" ${lockFields ? 'disabled' : ''} /></label>
            <label style="margin-top:var(--sp-5)">${t('ap_field_name_en_label')}<input type="text" id="f-name-en" value="${escapeAttr(f.nameEn)}" ${lockFields ? 'disabled' : ''} /></label>
            <label style="margin-top:var(--sp-5)">${t('ap_field_start_label')}<input type="date" id="f-start" value="${escapeAttr(f.start)}" ${lockFields ? 'disabled' : ''} /></label>
            <label style="margin-top:var(--sp-5)">${t('ap_field_end_label')}<input type="date" id="f-end" value="${escapeAttr(f.end)}" ${lockFields ? 'disabled' : ''} /></label>
            <label style="margin-top:var(--sp-5)">${t('ap_field_deadline_short_label')} (${t('system_timezone_label')})<input type="datetime-local" id="f-deadline" value="${escapeAttr(f.deadline)}" ${lockFields ? 'disabled' : ''} /></label>
          </div>

          <div>
            ${weightEditorHtml({ weights: state.weights, candidates, committeeRoles, editable: true })}
            <p class="field-hint" style="margin-top:var(--sp-3)">${t('apn_weight_hint')}</p>
          </div>
        </div>

        <div id="create-error"></div>
        <div class="stack is-tight" style="margin-top:var(--sp-5);max-width:480px">
          ${state.created ? `
            <button type="button" id="btn-open" ${!canOpen || state.saving ? 'disabled' : ''}>${state.saving ? t('common_loading') : (canOpen ? t('apd_open_period_btn') : t('apd_open_period_btn_blocked'))}</button>
            <a href="#/admin/periods/${state.created.Id}">${t('apn_goto_detail_link')}</a>
          ` : `
            <button type="button" id="btn-create-open" ${!canOpen || state.saving ? 'disabled' : ''}>${state.saving ? t('common_loading') : (canOpen ? t('apn_create_and_open_btn') : t('apd_open_period_btn_blocked'))}</button>
            <button type="button" id="btn-create-draft" class="secondary" ${state.saving ? 'disabled' : ''}>${state.saving ? t('common_loading') : t('ap_create_btn')}</button>
          `}
        </div>
      </div>
    `;

    if (state.error) document.getElementById('create-error').innerHTML = `<div class="error" style="margin-top:var(--sp-3)">${escapeHtml(state.error)}</div>`;

    // ★ ทุกช่องต้องผูกกลับเข้า state — กล่องน้ำหนักด้านขวาสั่ง renderPage() ใหม่ทุกครั้งที่เพิ่ม/ลบ/
    // กดใช้ค่ามาตรฐาน ถ้าไม่เก็บค่าที่พิมพ์ไว้ใน state ค่าที่กรอกไว้จะหายทุกครั้งที่แตะฝั่งขวา
    const bind = (id, key) => document.getElementById(id)?.addEventListener('input', (e) => { state.fields[key] = e.target.value; });
    bind('f-code', 'code');
    bind('f-name-th', 'nameTh');
    bind('f-name-en', 'nameEn');
    bind('f-start', 'start');
    bind('f-end', 'end');
    bind('f-deadline', 'deadline');

    wireWeightEditor({
      getWeights: () => state.weights,
      setWeights: (w) => { state.weights = w; },
      candidates,
      committeeRoles,
      rerender: renderPage,
    });

    document.getElementById('btn-create-open')?.addEventListener('click', () => onCreate(true));
    document.getElementById('btn-create-draft')?.addEventListener('click', () => onCreate(false));
    document.getElementById('btn-open')?.addEventListener('click', onOpenCreated);
  }

  // ตรวจฟอร์มชุดเดียวกับที่ adminPeriods.js เคยใช้ (รวมเช็คลำดับวันที่ตาม Spec.md §4.8 finding M14)
  function validationError() {
    const { code, nameTh, start, end, deadline } = state.fields;
    const missing = [];
    if (!code.trim()) missing.push(t('ap_field_code_label'));
    if (!nameTh.trim()) missing.push(t('ap_field_name_th_label'));
    if (!start) missing.push(t('ap_field_start_label'));
    if (!end) missing.push(t('ap_field_end_label'));
    if (!deadline) missing.push(t('ap_field_deadline_short_label'));
    if (missing.length > 0) return tf('ap_err_fill_required', { fields: missing.join(', ') });
    if (end < start) return t('ap_err_end_before_start');
    if (deadline.slice(0, 10) < start) return t('ap_err_deadline_before_start');
    return '';
  }

  async function onCreate(alsoOpen) {
    if (state.saving) return;
    const err = validationError();
    if (err) { state.error = err; renderPage(); return; }

    state.saving = true; state.error = ''; renderPage();
    try {
      // สร้างพร้อมน้ำหนักในคำขอเดียว (committee_weights เป็น jsonb ธรรมดาบนตารางเดียวกัน)
      const created = await createPeriod({
        Code: state.fields.code.trim(),
        NameTh: state.fields.nameTh.trim(),
        NameEn: state.fields.nameEn.trim() || null,
        PeriodStart: state.fields.start,
        PeriodEnd: state.fields.end,
        SubmissionDeadline: parseDatetimeLocalInSystemTz(state.fields.deadline),
        CommitteeWeights: state.weights,
      });
      state.created = created;
      if (alsoOpen) await openPeriod(created.Id);
      navigate(`#/admin/periods/${created.Id}`);
    } catch (err2) {
      state.error = translateError(err2.message) || err2.message || t('common_error_generic');
      state.saving = false;
      renderPage();
    }
  }

  // กดเปิดซ้ำหลังสร้างสำเร็จแต่เปิดพลาด — บันทึกน้ำหนักล่าสุดก่อนเสมอ (เหมือน onOpen ใน
  // adminPeriodDetail.js — open_period() อ่านน้ำหนักจาก DB ไม่ใช่จากหน้าจอ)
  async function onOpenCreated() {
    if (state.saving) return;
    state.saving = true; state.error = ''; renderPage();
    try {
      await updatePeriod(state.created.Id, { CommitteeWeights: state.weights });
      await openPeriod(state.created.Id);
      navigate(`#/admin/periods/${state.created.Id}`);
    } catch (err) {
      state.error = translateError(err.message) || err.message || t('common_error_generic');
      state.saving = false;
      renderPage();
    }
  }
}
