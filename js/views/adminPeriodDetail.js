// js/views/adminPeriodDetail.js — น้ำหนักกรรมการ, stepper สถานะ, checklist ปิด/ประกาศผล,
// อนุมัติ/ตีกลับ KAIZEN (MIGRATION.md ข้อ 11 — ไม่มี route /admin/kaizen แยกใน Spec.md)
import {
  getPeriodById, updatePeriod, openPeriod, closePeriod, publishPeriod,
  getCommitteeCandidates, getKaizenByPeriod, getKaizenByPeriodPage, updateKaizen, getMasterData, getAllProfiles, supabase,
  getKaizenEditGrants, grantKaizenEditWindow, revokeKaizenEditGrant,
} from '../api.js?v=20260911z10';
import { t, tf, getLang } from '../i18n.js?v=20260911z10';
import { escapeHtml, translateError, pageHeader, skeletonRows, stateCard, statusBadge, thaiDate, thaiDateTime, masterLabel } from '../ui.js?v=20260911z10';
import { PERIOD_STATUSES, PERIOD_STATUS_LABELS } from '../constants.js?v=20260911z10';

function L(labelObj) { return labelObj[getLang() === 'en' ? 'en' : 'th']; }

export async function render(container, params) {
  document.title = `${t('apd_page_title')} · ${t('appName')}`;
  container.innerHTML = `<div class="page-body">${skeletonRows(3)}</div>`;

  let period;
  let candidates;
  let kaizenList;
  let committeeRoles = [];
  let plants = [];
  let departments = [];
  let profiles = [];
  try {
    [period, candidates, kaizenList, committeeRoles, plants, departments, profiles] = await Promise.all([
      getPeriodById(params.id),
      getCommitteeCandidates(),
      getKaizenByPeriod(params.id),
      getMasterData('committee_role'),
      getMasterData('plant'),
      getMasterData('department'),
      getAllProfiles(),
    ]);
  } catch (err) {
    container.innerHTML = `<div class="page-body">${stateCard({
      kind: 'error', title: t('error_load_failed'), body: escapeHtml(translateError(err.message) || err.message || t('common_error_generic')),
      actions: `<button type="button" onclick="location.reload()">${t('state_retry')}</button>`,
    })}</div>`;
    return;
  }

  // นับใบคะแนนที่ส่งแล้วในรอบนี้ — ใช้ raw client ที่ api.js export ไว้อยู่แล้ว (ไม่ได้แก้ api.js)
  // admin อ่าน committee_scores ได้ทุกแถวผ่าน cs_read_admin policy
  let submittedScoresCount = 0;
  try {
    const { data } = await supabase.from('committee_scores').select('status').eq('period_id', period.Id);
    submittedScoresCount = (data ?? []).filter((s) => s.status === 'submitted').length;
  } catch { /* ไม่บล็อกหน้า ถ้านับไม่ได้ก็ถือว่า 0 (checklist จะเตือนเกินจริงเล็กน้อย ปลอดภัยกว่าพลาด) */ }

  // ★ actionSaving กันกดซ้ำที่ปุ่มเปิด/ปิด/ประกาศผลรอบ — DB (row lock + state-machine) ป้องกัน
  // ข้อมูลพังอยู่แล้วถ้ากดซ้ำเร็วๆ แต่ผู้แพ้ race จะได้ error โผล่ทับหน้าที่เพิ่งเปลี่ยนสถานะไปแล้ว
  // อย่างงงๆ — ปุ่มนี้กันแค่ระดับ UX ไม่ให้กดซ้ำได้ตั้งแต่แรก (Spec.md §4.8 finding M12)
  const state = { weights: { ...(period.CommitteeWeights ?? {}) }, error: '', actionError: '', saving: false, actionSaving: false };

  // ★ สิทธิ์แก้ไขชั่วคราว (kaizen_edit_grants) — เฉพาะโครงการ need_revision ในรอบที่ปิด/ประกาศผล
  // ไปแล้วเท่านั้นที่เจ้าของแก้ไขต่อไม่ได้ตามปกติ (Spec.md §4.8 backlog Low #7) grantForm ถือ state
  // ของฟอร์มที่กำลังเปิดอยู่แถวเดียว (openForKaizenId) ไม่ให้เปิดพร้อมกันหลายแถวกันสับสน/กดผิดโครงการ
  const periodLocked = !['draft', 'open', 'scoring'].includes(period.Status);
  const grantState = {
    byKaizenId: new Map(), // kaizenId -> grants[]
    openForKaizenId: null, reason: '', hours: 24, saving: false, error: '',
  };

  async function loadGrantsFor(kaizenIds) {
    const missing = kaizenIds.filter((id) => !grantState.byKaizenId.has(id));
    if (missing.length === 0) return;
    const lists = await Promise.all(missing.map((id) => getKaizenEditGrants(id).catch(() => [])));
    missing.forEach((id, i) => grantState.byKaizenId.set(id, lists[i]));
  }
  function activeGrantFor(kaizenId) {
    const grants = grantState.byKaizenId.get(kaizenId) ?? [];
    const now = new Date();
    return grants.find((g) => !g.RevokedAt && new Date(g.GrantedAt) <= now && now < new Date(g.ExpiresAt)) ?? null;
  }

  // ★ ตาราง "โครงการที่ต้องตัดสิน" ด้านล่างสุด paginate จริงฝั่ง server แยกจาก kaizenList เต็ม
  // ด้านบน (ที่ยังต้องโหลดทั้งหมดเพื่อคำนวณสรุปยอด/แยกตามโรงงาน/รายชื่อผู้มีสิทธิ์รับเงินรางวัล —
  // ตัวเลขสรุปพวกนี้ผิดถ้าคำนวณจากแค่หน้าที่โหลดมาบางส่วน) — ตารางรายการด้านล่างมีแต่การ์ดรายแถว
  // ไม่ต้องรอครบทุกแถวถึงจะแสดงได้ จึงแยก query จริงด้วย .range() ต่างหาก (Spec.md §4.8 backlog Low #3)
  const DECISION_PAGE_SIZE = 20;
  const decisionState = { rows: [], total: 0, hasMore: false, page: 0, loadingMore: false };

  async function loadDecisionPage(page, replace) {
    const { rows, total, hasMore } = await getKaizenByPeriodPage({ periodId: period.Id, page, pageSize: DECISION_PAGE_SIZE });
    decisionState.rows = replace ? rows : [...decisionState.rows, ...rows];
    decisionState.total = total;
    decisionState.hasMore = hasMore;
    decisionState.page = page;
    if (periodLocked) {
      await loadGrantsFor(rows.filter((k) => k.Status === 'need_revision').map((k) => k.Id));
    }
  }
  try {
    await loadDecisionPage(0, true);
  } catch { /* ไม่บล็อกหน้า — ตารางล่างจะโชว์ "ยังไม่มีโครงการ" ถ้าโหลดไม่สำเร็จ ผู้ใช้กด reload ได้ */ }

  function candidateInfo(id) {
    const c = candidates.find((x) => x.Id === id);
    if (!c) return { name: id, role: '' };
    const roleLabel = c.CommitteeRole ? masterLabel(committeeRoles, c.CommitteeRole) : '';
    return { name: `${c.FullName} (${c.EmployeeId})`, role: roleLabel };
  }

  renderPage();

  function renderPage() {
    const weightSum = Object.values(state.weights).reduce((a, b) => a + Number(b || 0), 0);
    const committeeCount = Object.keys(state.weights).length;
    const now = new Date();
    const deadlinePassed = now > new Date(period.SubmissionDeadline);
    const scorableKaizen = kaizenList.filter((k) => ['pending_review', 'scored', 'approved', 'need_revision', 'published'].includes(k.Status));
    const neededScores = scorableKaizen.length * committeeCount;
    const missingScores = Math.max(0, neededScores - submittedScoresCount);
    const pendingDecisions = kaizenList.filter((k) => k.Status === 'scored').length;

    // ★ สรุปการส่งโครงการต่อรอบ (2026-09-08) — "ส่งแล้ว" คือทุกสถานะยกเว้น draft (ร่างที่ยังไม่กดส่ง)
    const submitted = kaizenList.filter((k) => k.Status !== 'draft');
    const plantLabel = (code) => masterLabel(plants, code);
    const deptLabel = (code) => (code ? masterLabel(departments, code) : '—');
    // ★ รายชื่อผู้มีสิทธิ์รับเงินรางวัลส่งโครงการ (2026-09-11 — Spec.md §3 B15) — ทุกคนที่ส่งแล้ว
    //   ในรอบนี้ ไม่ต้องรอคะแนน จ่ายเงินจริงทำนอกระบบ (HR/บัญชี) หน้านี้แค่โชว์รายชื่อให้ดูเฉยๆ
    const profileById = new Map(profiles.map((p) => [p.Id, p]));
    const submittersRows = submitted
      .slice()
      .sort((a, b) => new Date(a.SubmittedAt ?? a.CreatedAt) - new Date(b.SubmittedAt ?? b.CreatedAt))
      .map((k) => {
        const owner = profileById.get(k.OwnerId);
        return `
          <tr>
            <td>${escapeHtml(owner?.FullName ?? '—')}</td>
            <td class="mono">${escapeHtml(owner?.EmployeeId ?? '—')}</td>
            <td>${escapeHtml(deptLabel(owner?.Department ?? k.Department))}</td>
            <td class="mono">${escapeHtml(k.Code ?? '—')}</td>
            <td>${k.SubmittedAt ? thaiDate(k.SubmittedAt) : '—'}</td>
          </tr>
        `;
      }).join('');
    const byPlant = [...new Set(submitted.map((k) => k.Plant))].sort().map((code) => {
      const rows = submitted.filter((k) => k.Plant === code);
      return {
        label: plantLabel(code),
        individual: rows.filter((k) => k.ProjectType === 'individual').length,
        group: rows.filter((k) => k.ProjectType === 'group').length,
        completed: rows.filter((k) => k.IsCompleted).length,
        inProgress: rows.filter((k) => !k.IsCompleted).length,
        total: rows.length,
      };
    });

    const closeChecklist = [
      { ok: weightSum === 100, title: t('apd_check_weight_100_title'), sub: tf('apd_check_weight_100_sub', { pct: weightSum }), blocking: true },
      { ok: deadlinePassed, title: t('apd_deadline_check_title'), sub: `${deadlinePassed ? t('apd_deadline_passed_label') : t('apd_deadline_upcoming_label')} ${thaiDateTime(period.SubmissionDeadline)} (${t('system_timezone_label')})`, blocking: false },
      { ok: missingScores === 0, title: t('apd_check_scores_title'), sub: missingScores === 0 ? tf('apd_check_scores_done_sub', { n: submittedScoresCount }) : tf('apd_check_scores_missing_sub', { n: missingScores }), blocking: true },
    ];
    const canClose = closeChecklist.every((c) => !c.blocking || c.ok);

    const publishChecklist = [
      { ok: pendingDecisions === 0, title: t('apd_check_decide_title'), sub: pendingDecisions === 0 ? t('apd_check_decide_done_sub') : tf('apd_check_decide_pending_sub', { n: pendingDecisions }), blocking: true },
    ];
    const canPublish = publishChecklist.every((c) => c.ok);

    const weightRows = Object.entries(state.weights).map(([uid, pct]) => {
      const info = candidateInfo(uid);
      return `
        <div class="member-row">
          <div style="flex:1;min-width:160px">
            <div style="font-size:13.5px;font-weight:600">${escapeHtml(info.name)}</div>
            ${info.role ? `<div class="muted" style="font-size:11.5px">${escapeHtml(info.role)}</div>` : ''}
          </div>
          <input type="number" min="0" max="100" data-uid="${uid}" class="weight-input" value="${pct}" style="width:90px" />
          <button type="button" class="icon-btn" data-remove-weight="${uid}" aria-label="${escapeHtml(t('kzform_aria_delete'))}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M4 6h16M8 6V4h8v2M6 6l1 14h10l1-14"/></svg>
          </button>
        </div>
      `;
    }).join('');

    const availableCandidates = candidates.filter((c) => !(c.Id in state.weights));
    const candidateOptions = availableCandidates
      .map((c) => `<option value="${c.Id}">${escapeHtml(c.FullName)} (${escapeHtml(c.EmployeeId)})</option>`)
      .join('');

    // ★ สิทธิ์แก้ไขชั่วคราว — โผล่เฉพาะ need_revision ในรอบที่ปิด/ประกาศผลไปแล้ว (periodLocked)
    // เท่านั้น (Spec.md §4.8 backlog Low #7) ต้องกดปุ่มเปิดฟอร์ม + กรอกเหตุผล + เลือกระยะเวลา +
    // กดยืนยันอีกครั้ง ไม่ใช่ปุ่มเดียวจบ กันเผลอให้สิทธิ์ผิดโครงการ
    function grantCellHtml(k) {
      if (!periodLocked || k.Status !== 'need_revision') return '';
      const active = activeGrantFor(k.Id);
      if (active) {
        return `
          <div class="muted" style="font-size:12px;margin-top:4px">
            ${escapeHtml(tf('apd_grant_active_until', { date: thaiDateTime(active.ExpiresAt) }))}
            <button type="button" class="secondary is-sm" data-revoke-grant="${active.Id}" data-revoke-kaizen="${k.Id}" style="margin-left:6px">${t('apd_revoke_btn')}</button>
          </div>
        `;
      }
      return `<button type="button" class="secondary is-sm" data-open-grant="${k.Id}" style="margin-top:4px">${t('apd_grant_open_btn')}</button>`;
    }

    function grantFormRowHtml(k) {
      if (grantState.openForKaizenId !== k.Id) return '';
      return `
        <tr class="is-attention">
          <td colspan="4">
            <div class="card" style="padding:12px">
              <div style="font-weight:600;margin-bottom:6px">${escapeHtml(tf('apd_grant_form_heading', { title: k.Title }))}</div>
              <p class="field-hint">${t('apd_grant_hint')}</p>
              <label><span>${t('apd_grant_reason_label')} <span class="req">*</span></span><textarea id="grant-reason" rows="2" placeholder="${escapeHtml(t('apd_grant_reason_placeholder'))}">${escapeHtml(grantState.reason)}</textarea></label>
              <label style="margin-top:8px">${t('apd_grant_duration_label')}
                <select id="grant-hours">
                  <option value="1" ${grantState.hours === 1 ? 'selected' : ''}>${t('apd_grant_hours_1')}</option>
                  <option value="6" ${grantState.hours === 6 ? 'selected' : ''}>${t('apd_grant_hours_6')}</option>
                  <option value="24" ${grantState.hours === 24 ? 'selected' : ''}>${t('apd_grant_hours_24')}</option>
                  <option value="72" ${grantState.hours === 72 ? 'selected' : ''}>${t('apd_grant_hours_72')}</option>
                  <option value="168" ${grantState.hours === 168 ? 'selected' : ''}>${t('apd_grant_hours_168')}</option>
                </select>
              </label>
              <div id="grant-error"></div>
              <div class="hstack" style="margin-top:10px">
                <button type="button" data-confirm-grant="${k.Id}" ${grantState.saving ? 'disabled' : ''}>${grantState.saving ? t('common_loading') : t('apd_grant_confirm_btn')}</button>
                <button type="button" class="secondary" id="btn-cancel-grant">${t('common_cancel')}</button>
              </div>
            </div>
          </td>
        </tr>
      `;
    }

    const kaizenRows = decisionState.rows.map((k) => `
      <tr>
        <td class="mono">${escapeHtml(k.Code ?? '—')}</td>
        <td>${escapeHtml(k.Title)}</td>
        <td>${statusBadge(k.Status)}</td>
        <td>
          ${k.Status === 'scored' ? `
            <button type="button" data-approve="${k.Id}" class="is-sm">${t('apd_approve_btn')}</button>
            <button type="button" class="secondary is-sm" data-revise="${k.Id}">${t('apd_revise_btn')}</button>
          ` : ''}
          ${k.Status === 'approved' ? `
            <button type="button" class="secondary is-sm" data-revise="${k.Id}">${t('apd_revise_btn')}</button>
            ${period.Status === 'published' ? `<button type="button" class="is-sm" data-publish-single="${k.Id}">${t('apd_publish_single_btn')}</button>` : ''}
          ` : ''}
          ${k.Status === 'need_revision' && k.DecidedAt ? `<span class="muted" style="font-size:12px">${escapeHtml(tf('apd_revised_at', { date: thaiDateTime(k.DecidedAt) }))}</span>` : ''}
          ${grantCellHtml(k)}
        </td>
      </tr>
      ${grantFormRowHtml(k)}
    `).join('');

    container.innerHTML = `
      ${pageHeader({
        eyebrow: escapeHtml(period.Code),
        title: escapeHtml(period.NameTh),
        sub: `${thaiDate(period.PeriodStart)} – ${thaiDate(period.PeriodEnd)} · deadline ${thaiDateTime(period.SubmissionDeadline)} (${t('system_timezone_label')})`,
      })}
      <div class="page-body">
        <div class="stepper">
          ${PERIOD_STATUSES.map((s, i) => {
            const curIdx = PERIOD_STATUSES.indexOf(period.Status);
            const cls = s === period.Status ? 'is-current' : (i < curIdx ? 'is-done' : '');
            return `${i > 0 ? '<span class="stp-line"></span>' : ''}<div class="stp ${cls}"><span class="n">${i + 1}</span>${escapeHtml(PERIOD_STATUS_LABELS[s] ? L(PERIOD_STATUS_LABELS[s]) : s)}</div>`;
          }).join('')}
        </div>

        <div class="section-head"><h2>${t('apd_summary_heading')}</h2></div>
        <div class="card">
          <div class="hstack" style="justify-content:space-between;flex-wrap:wrap;gap:24px">
            <div><div class="metric is-xl">${submitted.length}</div><p class="muted" style="margin:2px 0 0">${t('apd_summary_total_submitted')}</p></div>
            <div><div class="metric is-lg">${submitted.filter((k) => k.ProjectType === 'individual').length}</div><p class="muted" style="margin:2px 0 0;font-size:12.8px">${t('kzform_individual')}</p></div>
            <div><div class="metric is-lg">${submitted.filter((k) => k.ProjectType === 'group').length}</div><p class="muted" style="margin:2px 0 0;font-size:12.8px">${t('kzform_group')}</p></div>
            <div><div class="metric is-lg" style="color:var(--primary)">${submitted.filter((k) => k.IsCompleted).length}</div><p class="muted" style="margin:2px 0 0;font-size:12.8px">${t('apd_completed_label')}</p></div>
            <div><div class="metric is-lg" style="color:#B45309">${submitted.filter((k) => !k.IsCompleted).length}</div><p class="muted" style="margin:2px 0 0;font-size:12.8px">${t('apd_in_progress_label')}</p></div>
          </div>
        </div>
        ${byPlant.length > 0 ? `
          <div class="panel is-scroll" style="margin-top:var(--sp-4)">
            <table class="data-table">
              <thead><tr><th>${t('apd_col_plant')}</th><th class="is-num">${t('kzform_individual')}</th><th class="is-num">${t('kzform_group')}</th><th class="is-num">${t('apd_completed_label')}</th><th class="is-num">${t('apd_in_progress_label')}</th><th class="is-num">${t('apd_col_total')}</th></tr></thead>
              <tbody>
                ${byPlant.map((p) => `
                  <tr>
                    <td>${escapeHtml(p.label)}</td>
                    <td class="is-num">${p.individual}</td>
                    <td class="is-num">${p.group}</td>
                    <td class="is-num">${p.completed}</td>
                    <td class="is-num">${p.inProgress}</td>
                    <td class="is-num mono">${p.total}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        ` : ''}

        <div class="section-head" style="margin-top:var(--sp-6)">
          <h2>${t('apd_reward_heading')}</h2>
          <span class="section-note">${escapeHtml(tf('apd_reward_summary', { n: submitted.length }))}</span>
        </div>
        <p class="field-hint">${t('apd_reward_hint')}</p>
        ${submitted.length > 0 ? `
          <div class="panel is-scroll" style="margin-top:var(--sp-4)">
            <table class="data-table">
              <thead><tr><th>${t('apd_col_fullname')}</th><th>${t('apd_col_employee_id')}</th><th>${t('apd_col_department')}</th><th>${t('apd_col_kaizen_code')}</th><th>${t('apd_col_submitted_date')}</th></tr></thead>
              <tbody>${submittersRows}</tbody>
            </table>
          </div>
        ` : ''}

        <div class="two-col" style="margin-top:var(--sp-6)">
          <div>
            <div class="section-head">
              <h2>${t('apd_weights_heading')}</h2>
              <span class="badge" data-status="${weightSum === 100 ? 'approved' : 'need_revision'}">${weightSum === 100 ? t('apd_weight_complete_badge') : escapeHtml(tf('apd_weight_sum_badge', { pct: weightSum }))}</span>
            </div>
            <div id="weight-list">${weightRows || `<p class="muted">${t('apd_no_committee_yet')}</p>`}</div>
            ${weightSum !== 100 && period.Status !== 'draft' ? `
              <div class="warning" style="margin-top:var(--sp-3)">${t('apd_weight_warning')}</div>
            ` : ''}
            ${['draft', 'open', 'scoring'].includes(period.Status) ? `
              <div class="member-row" style="margin-top:var(--sp-4)">
                <select id="f-add-committee" style="flex:1">
                  <option value="">${t('apd_select_committee_placeholder')}</option>
                  ${candidateOptions}
                </select>
                <input type="number" id="f-add-weight" min="0" max="100" placeholder="%" style="width:90px" />
                <button type="button" id="btn-add-weight" class="secondary">${t('apd_add_btn')}</button>
              </div>
              <button type="button" id="btn-save-weights" style="margin-top:var(--sp-5)" ${state.saving ? 'disabled' : ''}>${state.saving ? t('common_loading') : t('apd_save_weights_btn')}</button>
            ` : ''}
            <div id="weight-error"></div>
          </div>

          <div>
            <div class="section-head"><h2>${t('apd_manage_period_heading')}</h2></div>
            ${period.Status === 'draft' ? `
              <div class="panel is-flush">
                <div class="checklist">
                  <div class="checklist-item ${weightSum === 100 ? '' : 'is-blocked'}">
                    <span class="mark">${weightSum === 100 ? checkIcon() : ''}</span>
                    <div><div class="check-title">${t('apd_check_weight_100_title')}</div><div class="check-sub">${escapeHtml(tf('apd_check_weight_100_sub', { pct: weightSum }))}</div></div>
                  </div>
                </div>
              </div>
              <button type="button" id="btn-open" style="margin-top:12px" ${weightSum === 100 && !state.actionSaving ? '' : 'disabled'}>${state.actionSaving ? t('common_loading') : (weightSum === 100 ? t('apd_open_period_btn') : t('apd_open_period_btn_blocked'))}</button>
            ` : ''}
            ${['open', 'scoring'].includes(period.Status) ? `
              <div class="panel is-flush">
                <div class="checklist">
                  ${closeChecklist.map((c) => `
                    <div class="checklist-item ${c.ok ? '' : (c.blocking ? 'is-blocked' : 'is-warning')}">
                      <span class="mark">${c.ok ? checkIcon() : ''}</span>
                      <div><div class="check-title">${c.title}</div><div class="check-sub">${escapeHtml(c.sub)}</div></div>
                    </div>
                  `).join('')}
                </div>
              </div>
              <button type="button" id="btn-close" style="margin-top:12px" ${canClose && !state.actionSaving ? '' : 'disabled'}>${state.actionSaving ? t('common_loading') : (canClose ? t('apd_close_period_btn') : t('apd_close_period_btn_blocked'))}</button>
            ` : ''}
            ${period.Status === 'closed' ? `
              <div class="panel is-flush">
                <div class="checklist">
                  ${publishChecklist.map((c) => `
                    <div class="checklist-item ${c.ok ? '' : 'is-blocked'}">
                      <span class="mark">${c.ok ? checkIcon() : ''}</span>
                      <div><div class="check-title">${c.title}</div><div class="check-sub">${escapeHtml(c.sub)}</div></div>
                    </div>
                  `).join('')}
                </div>
              </div>
              <button type="button" id="btn-publish" style="margin-top:12px" ${canPublish && !state.actionSaving ? '' : 'disabled'}>${state.actionSaving ? t('common_loading') : (canPublish ? t('apd_publish_period_btn') : t('apd_publish_period_btn_blocked'))}</button>
            ` : ''}
            ${period.Status === 'published' ? `<p class="muted">${t('apd_period_published_note')}</p>` : ''}
            <div id="action-error"></div>
          </div>
        </div>

        <div class="section-head"><h2>${escapeHtml(tf('apd_decisions_heading', { n: decisionState.total }))}</h2></div>
        ${decisionState.total === 0 ? `<p class="muted">${t('apd_no_projects')}</p>` : `
          <div class="panel is-scroll">
            <table class="data-table">
              <thead><tr><th>${t('apd_col_code')}</th><th>${t('apd_col_title')}</th><th>${t('apd_col_status')}</th><th>${t('apd_col_decision')}</th></tr></thead>
              <tbody>${kaizenRows}</tbody>
            </table>
          </div>
          ${decisionState.hasMore ? `<div style="text-align:center;margin-top:var(--sp-4)"><button type="button" class="secondary" id="btn-load-more-decisions" ${decisionState.loadingMore ? 'disabled' : ''}>${decisionState.loadingMore ? t('common_loading') : escapeHtml(tf('kzlist_load_more', { n: decisionState.total - decisionState.rows.length }))}</button></div>` : ''}
        `}
      </div>
    `;

    if (state.error) document.getElementById('weight-error').innerHTML = `<div class="error" style="margin-top:var(--sp-2)">${escapeHtml(state.error)}</div>`;
    if (state.actionError) document.getElementById('action-error').innerHTML = `<div class="error" style="margin-top:var(--sp-2)">${escapeHtml(state.actionError)}</div>`;
    if (grantState.error) { const el = document.getElementById('grant-error'); if (el) el.innerHTML = `<div class="error" style="margin-top:var(--sp-2)">${escapeHtml(grantState.error)}</div>`; }

    document.querySelectorAll('.weight-input').forEach((inp) => {
      inp.addEventListener('input', (e) => { state.weights[e.target.dataset.uid] = Number(e.target.value); });
    });
    document.querySelectorAll('[data-remove-weight]').forEach((btn) => {
      btn.addEventListener('click', () => { delete state.weights[btn.dataset.removeWeight]; renderPage(); });
    });
    document.getElementById('btn-add-weight')?.addEventListener('click', () => {
      const uid = document.getElementById('f-add-committee').value;
      const pct = Number(document.getElementById('f-add-weight').value || 0);
      if (!uid) return;
      state.weights[uid] = pct;
      renderPage();
    });
    document.getElementById('btn-save-weights')?.addEventListener('click', onSaveWeights);
    document.getElementById('btn-open')?.addEventListener('click', onOpen);
    document.getElementById('btn-close')?.addEventListener('click', onClose);
    document.getElementById('btn-publish')?.addEventListener('click', onPublish);
    document.querySelectorAll('[data-approve]').forEach((btn) => btn.addEventListener('click', () => onDecide(btn.dataset.approve, 'approved')));
    document.querySelectorAll('[data-revise]').forEach((btn) => btn.addEventListener('click', () => onDecide(btn.dataset.revise, 'need_revision')));
    document.querySelectorAll('[data-publish-single]').forEach((btn) => btn.addEventListener('click', () => onPublishSingle(btn.dataset.publishSingle)));
    document.getElementById('btn-load-more-decisions')?.addEventListener('click', onLoadMoreDecisions);

    document.querySelectorAll('[data-open-grant]').forEach((btn) => btn.addEventListener('click', () => {
      grantState.openForKaizenId = btn.dataset.openGrant;
      grantState.reason = ''; grantState.hours = 24; grantState.error = '';
      renderPage();
    }));
    document.getElementById('btn-cancel-grant')?.addEventListener('click', () => {
      grantState.openForKaizenId = null;
      renderPage();
    });
    document.getElementById('grant-reason')?.addEventListener('input', (e) => { grantState.reason = e.target.value; });
    document.getElementById('grant-hours')?.addEventListener('change', (e) => { grantState.hours = Number(e.target.value); });
    document.querySelectorAll('[data-confirm-grant]').forEach((btn) => btn.addEventListener('click', () => onConfirmGrant(btn.dataset.confirmGrant)));
    document.querySelectorAll('[data-revoke-grant]').forEach((btn) => btn.addEventListener('click', () => onRevokeGrant(btn.dataset.revokeGrant, btn.dataset.revokeKaizen)));
  }

  async function onConfirmGrant(kaizenId) {
    if (!grantState.reason.trim()) {
      grantState.error = t('apd_reason_required');
      renderPage();
      return;
    }
    grantState.saving = true; grantState.error = ''; renderPage();
    try {
      await grantKaizenEditWindow({ kaizenId, reason: grantState.reason.trim(), hours: grantState.hours });
      grantState.byKaizenId.delete(kaizenId); // บังคับโหลดใหม่ให้เห็น grant ที่เพิ่งสร้าง
      await loadGrantsFor([kaizenId]);
      grantState.openForKaizenId = null;
    } catch (err) {
      grantState.error = translateError(err.message) || err.message || t('common_error_generic');
    } finally {
      grantState.saving = false;
      renderPage();
    }
  }

  async function onRevokeGrant(grantId, kaizenId) {
    if (!confirm(t('apd_confirm_revoke_grant'))) return;
    try {
      await revokeKaizenEditGrant(grantId);
      grantState.byKaizenId.delete(kaizenId);
      await loadGrantsFor([kaizenId]);
    } catch (err) {
      alert(translateError(err.message) || err.message || t('common_error_generic'));
    } finally {
      renderPage();
    }
  }

  async function onLoadMoreDecisions() {
    decisionState.loadingMore = true; renderPage();
    try {
      await loadDecisionPage(decisionState.page + 1, false);
    } catch (err) {
      alert(translateError(err.message) || err.message || t('common_error_generic'));
    } finally {
      decisionState.loadingMore = false;
      renderPage();
    }
  }

  function checkIcon() {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12l5 5L20 6"/></svg>';
  }

  async function onSaveWeights() {
    state.saving = true; state.error = ''; renderPage();
    try {
      period = await updatePeriod(period.Id, { CommitteeWeights: state.weights });
    } catch (err) {
      state.error = translateError(err.message) || err.message || t('common_error_generic');
    } finally {
      state.saving = false; renderPage();
    }
  }

  async function onOpen() {
    if (state.actionSaving) return;
    state.actionSaving = true; state.actionError = ''; renderPage();
    try {
      // ★ บันทึกน้ำหนักที่แก้ในฟอร์ม (state.weights) ก่อนเปิดรอบเสมอ — ไม่งั้น open_period()
      // จะอ่านค่าที่บันทึกไว้ "ก่อนหน้านี้" จาก DB ตรงๆ ซึ่งอาจไม่ตรงกับที่ admin เห็นบนจอถ้ายัง
      // ไม่ได้กด "บันทึกน้ำหนัก" มาก่อน (ดู Spec.md §4.8 finding H3)
      period = await updatePeriod(period.Id, { CommitteeWeights: state.weights });
      await openPeriod(period.Id);
      period = await getPeriodById(period.Id);
    } catch (err) {
      state.actionError = translateError(err.message) || err.message || t('common_error_generic');
    }
    state.actionSaving = false; renderPage();
  }

  async function onClose() {
    if (state.actionSaving) return;
    state.actionSaving = true; state.actionError = ''; renderPage();
    try {
      await closePeriod(period.Id);
      period = await getPeriodById(period.Id);
    } catch (err) {
      state.actionError = translateError(err.message) || err.message || t('common_error_generic');
    }
    state.actionSaving = false; renderPage();
  }

  async function onPublish() {
    if (state.actionSaving) return;
    state.actionSaving = true; state.actionError = ''; renderPage();
    try {
      await publishPeriod(period.Id);
      period = await getPeriodById(period.Id);
      kaizenList = await getKaizenByPeriod(period.Id);
      await loadDecisionPage(0, true);
    } catch (err) {
      state.actionError = translateError(err.message) || err.message || t('common_error_generic');
    }
    state.actionSaving = false; renderPage();
  }

  // ★ สำหรับโครงการที่ตัดสิน "อนุมัติ" ไม่ทันก่อน admin กดประกาศผลรอบไปแล้ว (publish_period()
  // ย้ายเฉพาะโครงการที่เป็น 'approved' ณ ตอนนั้นไปเป็น 'published' — ทำได้ครั้งเดียว รอบจะย้อน
  // กลับมา publish ซ้ำไม่ได้อีก) โครงการตกค้างแบบนี้ค้างที่ approved ตลอดกาลถ้าไม่มีปุ่มนี้ —
  // ดู Spec.md §4.8 finding H4 (admin ตั้งสถานะ published ตรงๆ ได้อยู่แล้วผ่าน k_update_admin
  // ไม่มี gate เรื่อง period status เลย ปุ่มนี้แค่เปิดทางให้ทำทีละโครงการ)
  async function onPublishSingle(kaizenId) {
    if (!confirm(t('apd_confirm_publish_single'))) return;
    state.actionError = ''; renderPage();
    try {
      await updateKaizen(kaizenId, { Status: 'published' });
      kaizenList = await getKaizenByPeriod(period.Id);
      await loadDecisionPage(0, true);
    } catch (err) {
      state.actionError = translateError(err.message) || err.message || t('common_error_generic');
    }
    renderPage();
  }

  async function onDecide(kaizenId, status) {
    let revisionNote = null;
    if (status === 'need_revision') {
      revisionNote = prompt(t('apd_prompt_revision_note'));
      if (revisionNote === null) return; // กด Cancel — ยกเลิกการตีกลับทั้งหมด ไม่ใช่ตีกลับด้วยโน้ตว่าง
    }
    state.actionError = ''; renderPage();
    try {
      await updateKaizen(kaizenId, { Status: status, RevisionNote: revisionNote });
      kaizenList = await getKaizenByPeriod(period.Id);
      // ★ รีเซ็ตกลับหน้า 0 หลังตัดสิน — ตำแหน่งของโครงการที่เพิ่งเปลี่ยนสถานะอาจขยับใน sort เดิม
      // (created_at) แต่หลักๆ กันไม่ให้ state ค้างชี้ไปหน้าที่ index ไม่ตรงกับ total ใหม่แล้ว
      await loadDecisionPage(0, true);
    } catch (err) {
      state.actionError = translateError(err.message) || err.message || t('common_error_generic');
    }
    renderPage();
  }
}
