// js/views/kaizenProgress.js — บันทึกความคืบหน้า + ส่งให้กรรมการ + ทำเครื่องหมายเสร็จ (MIGRATION.md ข้อ 6)
// ★ 2026-09-08: แยก "ส่งให้กรรมการให้คะแนน" กับ "ทำเครื่องหมายว่าเสร็จ" เป็นคนละปุ่มคนละความหมาย
//   (เดิมรวมเป็นปุ่มเดียว ต้องเสร็จงานก่อนถึงจะส่งกรรมการได้) ตอนนี้ส่งให้กรรมการได้ตลอดไม่ว่าจะ
//   เสร็จหรือยัง ถ้ายังไม่เสร็จก็ตามอัปเดตความคืบหน้า/ทำเครื่องหมายเสร็จทีหลังได้ — เซิร์ฟเวอร์บังคับ
//   เรื่องนี้จริงผ่าน can_track_progress()/guard_kaizen_field_lock() ใน schema.sql (ไม่ใช่แค่ UI)
// หมายเหตุ: ไม่มี trigger ฝั่ง DB sync progress_pct/next_follow_up_date/status อัตโนมัติ
// ใน MVP — ต้องอัปเดต kaizen_projects เองที่นี่คู่กับการ insert kaizen_progress_updates
import { getKaizenById, updateKaizen, addProgressUpdate, uploadAttachment } from '../api.js?v=20260911z8';
import { t, tf } from '../i18n.js?v=20260911z8';
import { navigate } from '../router.js?v=20260911z8';
import { escapeHtml, translateError, pageHeader, stateCard, statusBadge, thaiDate, todayInSystemTz } from '../ui.js?v=20260911z8';
import { MAX_UPLOAD_MB } from '../config.js?v=20260911z8';

const COST_BASIS_MIN_LEN = 30;
const TRACKABLE_STATUSES = ['submitted', 'in_progress', 'pending_review', 'scored', 'approved'];
const NOT_YET_SENT_STATUSES = ['submitted', 'in_progress'];

export async function render(container, params, session) {
  document.title = `${t('kzdetail_log_progress_btn')} · ${t('appName')}`;
  container.innerHTML = `<div class="page-body"><p>${t('common_loading')}</p></div>`;

  let kaizen;
  try {
    kaizen = await getKaizenById(params.id);
  } catch (err) {
    container.innerHTML = `<div class="page-body">${stateCard({
      kind: 'error',
      title: t('error_load_failed'),
      body: escapeHtml(translateError(err.message) || err.message || t('common_error_generic')),
      actions: `<button type="button" onclick="location.reload()">${t('state_retry')}</button>`,
    })}</div>`;
    return;
  }

  if (kaizen.OwnerId !== session.user.id || kaizen.IsCompleted || !TRACKABLE_STATUSES.includes(kaizen.Status)) {
    container.innerHTML = `
      ${pageHeader({ title: t('kzdetail_log_progress_btn') })}
      <div class="page-body">
        <p class="muted">${t('kzprog_cannot_update')}</p>
        <a href="#/kaizen/${kaizen.Id}">${t('kzform_back_to_detail')}</a>
      </div>
    `;
    return;
  }

  const state = {
    saving: false,
    sending: false,
    error: '',
    sendError: '',
    completeError: '',
    note: '',
    obstacles: '',
    nextFollowUpDate: kaizen.NextFollowUpDate ?? '',
    // ★ ค่า default "วันนี้" ต้องอิง SYSTEM_TIMEZONE ไม่ใช่ new Date().toISOString() ที่ตัดวันที่
    // แบบ UTC — ช่วงเที่ยงคืน–7 โมงเช้าไทย UTC ยังเป็นเมื่อวาน จะ default ผิดวัน (Spec.md §4.8 Low #2)
    completionDate: kaizen.CompletionDate ?? todayInSystemTz(),
    costSaving: kaizen.CostSavingPerMonth ?? '',
    costBasis: kaizen.CostSavingBasis ?? '',
    afterFile: null,
  };

  function hasAfterPhoto() {
    return state.afterFile != null || (kaizen.KaizenAttachments ?? []).some((a) => a.Phase === 'after');
  }
  function completeChecklist() {
    const costOk = !(Number(state.costSaving) > 0) || state.costBasis.trim().length >= COST_BASIS_MIN_LEN;
    return [
      { key: 'date', title: t('kzform_completion_date'), ok: Boolean(state.completionDate), sub: state.completionDate ? thaiDate(state.completionDate) : t('kzprog_check_not_specified') },
      { key: 'photo', title: t('kzprog_check_after_photo'), ok: hasAfterPhoto(), sub: hasAfterPhoto() ? t('kzprog_check_has_photo') : t('kzprog_check_need_photo') },
      { key: 'cost', title: t('kzprog_check_cost_evidence'), ok: costOk, sub: Number(state.costSaving) > 0 ? tf('kzprog_check_chars_of', { current: state.costBasis.trim().length, min: COST_BASIS_MIN_LEN }) : t('kzprog_check_no_cost_skip') },
    ];
  }

  renderPage();

  function renderPage() {
    const updates = [...(kaizen.KaizenProgressUpdates ?? [])].sort((a, b) => (a.UpdateDate < b.UpdateDate ? 1 : -1));
    const notYetSent = NOT_YET_SENT_STATUSES.includes(kaizen.Status);

    container.innerHTML = `
      ${pageHeader({
        breadcrumb: [{ label: t('nav_kaizen'), href: '#/kaizen' }, { label: kaizen.Title, href: `#/kaizen/${kaizen.Id}` }, { label: t('kzdetail_log_progress_btn') }],
        title: t('kzdetail_log_progress_btn'),
        sub: escapeHtml(kaizen.Title),
      })}
      <div class="page-body">
        <div class="two-col">
          <div>
            <div class="section-head"><h2>${t('kzprog_new_progress_heading')}</h2></div>
            <label style="margin-top:var(--sp-5)"><span>${t('kzprog_detail_label')} <span class="req">*</span></span>
              <textarea id="f-note" rows="3" placeholder="${t('kzprog_detail_placeholder')}">${escapeHtml(state.note)}</textarea>
            </label>
            <label style="margin-top:var(--sp-5)">${t('kzprog_obstacles_label')}<textarea id="f-obstacles" rows="2">${escapeHtml(state.obstacles)}</textarea></label>
            <label style="margin-top:var(--sp-5)">${t('kzform_next_followup')}<input type="date" id="f-next-followup" value="${state.nextFollowUpDate}" /></label>
            <div id="progress-error"></div>
            <button type="button" id="btn-save-progress" style="margin-top:var(--sp-5)" ${state.saving ? 'disabled' : ''}>${state.saving ? t('common_loading') : t('kzdetail_log_progress_btn')}</button>

            <div class="section-head"><h2>${t('kzprog_send_committee_heading')}</h2></div>
            ${notYetSent ? `
              <p class="field-hint">${t('kzprog_send_hint')}</p>
              <div id="send-error"></div>
              <button type="button" id="btn-send-committee" style="margin-top:var(--sp-5)" ${state.sending ? 'disabled' : ''}>${state.sending ? t('common_loading') : t('kzprog_send_committee_heading')}</button>
            ` : `
              <div class="note">${tf('kzprog_already_sent', { badge: statusBadge(kaizen.Status) })}</div>
            `}

            <div class="section-head"><h2>${t('kzprog_mark_complete_heading')}</h2></div>
            <div class="panel is-flush" style="margin-top:var(--sp-4)">
              <div class="checklist" id="complete-checklist"></div>
            </div>
            <div style="margin-top:var(--sp-5)">
              <label>${t('kzform_completion_date')}<input type="date" id="f-completion-date" value="${state.completionDate}" /></label>
              ${!hasAfterPhoto() ? `
                <label class="dropzone" for="f-after-photo" style="width:118px;margin-top:var(--sp-4)">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 16V4M7 9l5-5 5 5"/><path d="M4 16v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3"/></svg>
                  ${t('kzprog_take_photo_btn')}
                </label>
                <input type="file" accept="image/*" id="f-after-photo" style="display:none" />
              ` : ''}
              <label style="margin-top:var(--sp-5)">${t('kzform_cost_saving_label')}<input type="number" min="0" step="1" id="f-cost-saving" value="${state.costSaving}" /></label>
              <label style="margin-top:var(--sp-5)">${t('kzform_cost_basis_label')}<textarea id="f-cost-basis" rows="3">${escapeHtml(state.costBasis)}</textarea></label>
              <div id="complete-error"></div>
              <button type="button" id="btn-complete" style="margin-top:var(--sp-5)"></button>
            </div>
          </div>

          <div>
            <div class="section-head"><h2>${t('kzprog_history_heading')}</h2></div>
            ${updates.length === 0
              ? `<p class="muted">${t('kzprog_no_history')}</p>`
              : `<div class="row-list">${updates.map((p) => `
                  <div class="row-item" style="align-items:flex-start">
                    <div class="row-main">
                      <span class="tl-date">${thaiDate(p.UpdateDate)}</span>
                      <p class="tl-note">${escapeHtml(p.Note)}</p>
                      ${p.Obstacles ? `<p class="tl-obstacle">${escapeHtml(tf('kzdetail_obstacle_prefix', { text: p.Obstacles }))}</p>` : ''}
                    </div>
                  </div>
                `).join('')}</div>`}
          </div>
        </div>
      </div>
    `;

    if (state.error) {
      document.getElementById('progress-error').innerHTML = `<div class="error">${escapeHtml(state.error)}</div>`;
    }
    if (state.sendError) {
      document.getElementById('send-error').innerHTML = `<div class="error">${escapeHtml(state.sendError)}</div>`;
    }
    if (state.completeError) {
      document.getElementById('complete-error').innerHTML = `<div class="error">${escapeHtml(state.completeError)}</div>`;
    }
    renderCompleteSection();

    document.getElementById('f-note').addEventListener('input', (e) => { state.note = e.target.value; });
    document.getElementById('f-obstacles').addEventListener('input', (e) => { state.obstacles = e.target.value; });
    document.getElementById('f-next-followup').addEventListener('input', (e) => { state.nextFollowUpDate = e.target.value; });
    document.getElementById('f-completion-date').addEventListener('input', (e) => { state.completionDate = e.target.value; renderCompleteSection(); });
    document.getElementById('f-cost-saving').addEventListener('input', (e) => { state.costSaving = e.target.value; renderCompleteSection(); });
    document.getElementById('f-cost-basis').addEventListener('input', (e) => { state.costBasis = e.target.value; renderCompleteSection(); });
    document.getElementById('f-after-photo')?.addEventListener('change', (e) => {
      state.afterFile = e.target.files[0] ?? null;
      renderPage();
    });

    document.getElementById('btn-save-progress').addEventListener('click', onSaveProgress);
    document.getElementById('btn-send-committee')?.addEventListener('click', onSendToCommittee);
    document.getElementById('btn-complete').addEventListener('click', onComplete);
  }

  function renderCompleteSection() {
    const checklist = completeChecklist();
    const remaining = checklist.filter((c) => !c.ok).length;

    document.getElementById('complete-checklist').innerHTML = checklist.map((c) => `
      <div class="checklist-item ${c.ok ? '' : 'is-blocked'}">
        <span class="mark">${c.ok ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12l5 5L20 6"/></svg>' : ''}</span>
        <div>
          <div class="check-title">${c.title}</div>
          <div class="check-sub">${escapeHtml(c.sub)}</div>
        </div>
      </div>
    `).join('');

    const btn = document.getElementById('btn-complete');
    btn.disabled = state.saving || remaining > 0;
    btn.textContent = state.saving ? t('common_loading') : (remaining > 0 ? tf('kzprog_mark_complete_missing', { n: remaining }) : t('kzprog_mark_complete_heading'));
  }

  async function onSaveProgress() {
    if (!state.note.trim()) { state.error = t('kzprog_val_note_required'); renderPage(); return; }

    state.saving = true; state.error = ''; renderPage();
    try {
      // ★ insert progress update + update next_follow_up_date/status (submitted→in_progress)
      // ทำเป็น atomic RPC เดียวแล้ว (ไม่ใช่ 2 คำสั่งแยกจากที่นี่อีกต่อไป) กันสถานะไม่ตรงกันถ้า
      // ขั้นใดขั้นหนึ่งล้มเหลวกลางคัน (Spec.md §4.8 backlog Low #6)
      await addProgressUpdate({
        KaizenId: kaizen.Id,
        Note: state.note.trim(),
        Obstacles: state.obstacles.trim() || null,
        NextFollowUpDate: state.nextFollowUpDate || null,
      });

      kaizen = await getKaizenById(kaizen.Id);
      state.note = '';
      state.obstacles = '';
    } catch (err) {
      state.error = translateError(err.message) || err.message || t('common_error_generic');
    } finally {
      state.saving = false;
      renderPage();
    }
  }

  async function onSendToCommittee() {
    if (!confirm(t('kzprog_confirm_send'))) return;

    state.sending = true; state.sendError = ''; renderPage();
    try {
      await updateKaizen(kaizen.Id, { Status: 'pending_review' });
      kaizen = await getKaizenById(kaizen.Id);
    } catch (err) {
      state.sendError = translateError(err.message) || err.message || t('common_error_generic');
    } finally {
      state.sending = false;
      renderPage();
    }
  }

  async function onComplete() {
    const checklist = completeChecklist();
    if (checklist.some((c) => !c.ok)) return;

    state.saving = true; state.completeError = ''; renderPage();
    try {
      if (state.afterFile) {
        // ★ เช็คว่าเป็นรูปจริงก่อนอัปโหลด — ดู kaizenForm.js finding M6 เดียวกัน (Spec.md §4.8)
        if (!state.afterFile.type.startsWith('image/')) {
          throw new Error(t('kzprog_err_image_only'));
        }
        if (state.afterFile.size > MAX_UPLOAD_MB * 1024 * 1024) {
          throw new Error(tf('kzform_file_too_large', { mb: MAX_UPLOAD_MB }));
        }
        await uploadAttachment({ kaizenId: kaizen.Id, phase: 'after', file: state.afterFile, uploadedBy: session.user.id });
      }

      await updateKaizen(kaizen.Id, {
        IsCompleted: true,
        CompletionDate: state.completionDate,
        CostSavingPerMonth: state.costSaving === '' ? null : Number(state.costSaving),
        CostSavingBasis: state.costBasis.trim() || null,
      });

      navigate(`#/kaizen/${kaizen.Id}`);
    } catch (err) {
      state.completeError = translateError(err.message) || err.message || t('common_error_generic');
      state.saving = false;
      renderPage();
    }
  }
}
