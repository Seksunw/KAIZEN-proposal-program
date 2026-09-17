// js/views/reviewScore.js — ให้คะแนน KAIZEN 7 เกณฑ์ แบบ accordion (MIGRATION.md ข้อ 8)
// ★ คอลัมน์ซ้าย = รายละเอียดโครงการ (รูป/ปัญหา/แนวทาง/cost saving/ทีมงาน) เอาเนื้อหาแบบเดียวกับ
//   kaizenDetail.js มาใช้ — กรรมการจะได้อ่านพร้อมให้คะแนนได้เลยไม่ต้องสลับหน้า
//   คอลัมน์ขวา (.score-rail, sticky อยู่แล้วใน style.css) = การ์ด "ให้คะแนน 7 เกณฑ์" (accordion)
//   ต่อด้วยการ์ด "ส่งคะแนน" (คะแนนรวม/ความเห็น/ปุ่มส่ง) อยู่ด้านล่าง — ให้คะแนนก่อนเห็นปุ่มส่ง
import {
  getKaizenById, getOrCreateMyScore, saveScoreDraft, submitScore, getPeriodById,
  getAttachmentSignedUrl, getMasterData,
} from '../api.js?v=20260911z6';
import { t, getLang } from '../i18n.js?v=20260911z6';
import { navigate } from '../router.js?v=20260911z6';
import { escapeHtml, translateError, escapeAttr, pageHeader, stateCard, thaiDate, initials, openLightbox, masterLabel } from '../ui.js?v=20260911z6';
import { CRITERIA, SCORE_LEVELS, MAX_TOTAL_SCORE } from '../constants.js?v=20260911z6';

export async function render(container, params, session) {
  document.title = `ให้คะแนน KAIZEN · ${t('appName')}`;
  container.innerHTML = `<div class="page-body"><p>${t('common_loading')}</p></div>`;

  let kaizen;
  let period;
  try {
    kaizen = await getKaizenById(params.kaizenId);
    period = kaizen.PeriodId ? await getPeriodById(kaizen.PeriodId) : null;
  } catch (err) {
    container.innerHTML = `<div class="page-body">${stateCard({
      kind: 'error', title: 'โหลดข้อมูลไม่สำเร็จ', body: escapeHtml(translateError(err.message) || err.message || t('common_error_generic')),
      actions: '<button type="button" onclick="location.reload()">โหลดใหม่</button>',
    })}</div>`;
    return;
  }

  // กันกรรมการให้คะแนนโครงการของตัวเอง — ตั้งใจกันแค่ระดับ UI ไม่ใช่ RLS (ผู้ใช้ตัดสินใจไว้เมื่อ
  // เปิดให้กรรมการสร้างโครงการได้เหมือนพนักงาน 2026-09-11 — ดู Spec.md §2.8) เช็คก่อนเรียก
  // getOrCreateMyScore() เพื่อไม่ให้สร้างแถว committee_scores ค้างไว้เปล่าๆ สำหรับโครงการตัวเอง
  if (kaizen.OwnerId === session.user.id) {
    container.innerHTML = `
      ${pageHeader({ title: 'ให้คะแนน KAIZEN' })}
      <div class="page-body">${stateCard({
        kind: 'warning',
        title: 'ให้คะแนนโครงการของตัวเองไม่ได้',
        body: `"${escapeHtml(kaizen.Title)}" เป็นโครงการที่คุณเป็นเจ้าของ — กรรมการให้คะแนนโครงการของตัวเองไม่ได้ เพื่อความยุติธรรมในการตัดสิน`,
        actions: '<a href="#/review"><button type="button" class="secondary">กลับไปคิวตรวจ</button></a>',
      })}</div>
    `;
    return;
  }

  // ★ เจอบั๊กจริงจากการทดสอบ deploy (2026-09-17): กรรมการที่ "ไม่ได้" ถูกผูกเข้ารอบนี้ (ไม่มี key
  // ตัวเองใน period.committee_weights) ยังกด deep-link มาหน้านี้ตรงๆ ได้ (route คุมแค่ role
  // 'committee' ไม่ได้เช็ครายรอบ) แล้วไปพังตอน getOrCreateMyScore() insert ชน RLS ของ
  // committee_scores ดิบๆ ("new row violates row-level security policy...") — reviewQueue.js
  // กันไว้แล้วที่หน้าคิว (เช็คเดียวกันนี้) แต่หน้านี้เข้าถึงตรงได้โดยไม่ผ่านคิว จึงต้องกันซ้ำอีกชั้น
  // ด้วยข้อความที่อ่านออกแทน error ดิบจาก DB
  if (!period || period.CommitteeWeights?.[session.user.id] == null) {
    container.innerHTML = `
      ${pageHeader({ title: 'ให้คะแนน KAIZEN' })}
      <div class="page-body">${stateCard({
        kind: 'warning',
        title: 'คุณไม่ได้เป็นกรรมการของรอบนี้',
        body: 'Admin ยังไม่ได้กำหนดให้คุณเป็นกรรมการของรอบประเมินนี้ — ติดต่อ Admin ถ้าควรได้รับสิทธิ์ให้คะแนนในรอบนี้',
        actions: '<a href="#/review"><button type="button" class="secondary">กลับไปคิวตรวจ</button></a>',
      })}</div>
    `;
    return;
  }

  let score;
  try {
    score = await getOrCreateMyScore({ periodId: kaizen.PeriodId, kaizenId: kaizen.Id, committeeUserId: session.user.id });
  } catch (err) {
    container.innerHTML = `<div class="page-body">${stateCard({
      kind: 'error', title: 'โหลดข้อมูลไม่สำเร็จ', body: escapeHtml(translateError(err.message) || err.message || t('common_error_generic')),
    })}</div>`;
    return;
  }

  // ★ โหลด label แผนก/โรงงาน/งบประมาณ + signed url รูปทั้งหมด "ครั้งเดียว" ก่อน render ครั้งแรก —
  //   renderForm() ถูกเรียกซ้ำทุกครั้งที่กรรมการคลิกให้คะแนนแต่ละเกณฑ์ ถ้า fetch พวกนี้ไว้ข้างในจะ
  //   ยิง request ซ้ำทุกคลิกโดยไม่จำเป็น (รูปกระพริบเพราะโหลดใหม่ทุกครั้งด้วย)
  let departments = [];
  let plants = [];
  let budgetBands = [];
  try {
    [departments, plants, budgetBands] = await Promise.all([
      getMasterData('department'),
      getMasterData('plant'),
      getMasterData('budget_band'),
    ]);
  } catch { /* master_data โหลดไม่ได้ — ใช้ code ดิบแทน ไม่บล็อกหน้า */ }
  const labelOf = (list, code) => masterLabel(list, code);

  const attachments = kaizen.KaizenAttachments ?? [];
  const beforePhoto = attachments.find((a) => a.Phase === 'before') ?? null;
  const afterPhoto = attachments.find((a) => a.Phase === 'after') ?? null;
  const otherPhotos = attachments.filter((a) => a !== beforePhoto && a !== afterPhoto);

  const photoUrls = new Map();
  await Promise.all(attachments.map(async (a) => {
    try { photoUrls.set(a.Id, await getAttachmentSignedUrl(a.StoragePath)); } catch { /* thumbnail โหลดไม่ขึ้นไม่บล็อกหน้า */ }
  }));

  const weightPct = period?.CommitteeWeights?.[session.user.id] ?? null;

  const state = {
    items: { ...(score.Items ?? {}) },
    overallComment: score.OverallComment ?? '',
    saving: false,
    error: '',
    isSubmitted: score.Status === 'submitted',
    // ★ 2026-09-12 (Spec.md §4.8 finding H2, ตามที่ผู้ใช้ยืนยัน): ให้กรรมการแก้ไขคะแนนที่ส่งไป
    // แล้วได้ต่อจนกว่ารอบจะปิด (is_locked เป็น true ตอน close_period() เท่านั้น) — isSubmitted
    // ยังใช้แยก "ส่งครั้งแรก" (ต้องกดปุ่มส่ง) กับ "แก้ไขคะแนนที่ส่งไปแล้ว" (บันทึกตรงได้เลย
    // ไม่ต้องกดส่งซ้ำ เพราะ submit_score() RPC ไม่ยอมให้เรียกซ้ำถ้า status เป็น submitted แล้ว)
    isLocked: score.IsLocked === true,
    openCriterion: CRITERIA.findIndex((c) => state_itemsMissing(c.code)),
  };
  function state_itemsMissing(code) { return score.Items?.[code] == null; }
  if (state.openCriterion === -1) state.openCriterion = 0;

  renderForm();

  function firstIncompleteAfter(idx) {
    for (let i = 0; i < CRITERIA.length; i++) {
      const j = (idx + 1 + i) % CRITERIA.length;
      if (state.items[CRITERIA[j].code] == null) return j;
    }
    return idx;
  }

  function photoSlotHtml(attachment, label, isAfter) {
    const phase = isAfter ? 'after' : 'before';
    return `
      <div>
        <div class="photo-slot" data-photo-slot="${phase}">
          ${attachment ? '<img alt="" />' : 'ยังไม่มีรูป'}
        </div>
        <div class="photo-caption">
          <span class="phase ${isAfter ? 'is-after' : ''}">${label}</span>
          ${attachment?.Caption ? `<span class="fact">${escapeHtml(attachment.Caption)}</span>` : ''}
        </div>
      </div>
    `;
  }

  function renderProjectDetail() {
    return `
      ${!kaizen.IsCompleted ? `<div class="warning" style="margin-bottom:16px">โครงการนี้ยังไม่เสร็จ (อยู่ระหว่างดำเนินการ) — ให้คะแนนจากข้อมูล ณ ตอนนี้ได้เลย เจ้าของโครงการจะยังตามอัปเดตความคืบหน้าต่อได้</div>` : ''}
      <div class="photo-pair">
        ${photoSlotHtml(beforePhoto, 'ก่อนทำ', false)}
        ${photoSlotHtml(afterPhoto, 'หลังทำ', true)}
      </div>
      ${otherPhotos.length > 0 ? `<div class="attach-grid" style="margin-top:var(--sp-2)" id="other-photos"></div>` : ''}

      <h3 style="margin-top:var(--sp-6)">ปัญหา</h3>
      <p style="font-size:15px;line-height:1.65">${escapeHtml(kaizen.ProblemDescription || '—')}</p>
      <h3>แนวทางการปรับปรุง</h3>
      <p style="font-size:15px;line-height:1.65">${escapeHtml(kaizen.ImprovementApproach || '—')}</p>

      <div class="two-col" style="gap:var(--sp-5);margin-top:var(--sp-6)">
        <div class="card">
          <h2 style="margin-bottom:var(--sp-2)">ผลที่วัดได้</h2>
          ${Number(kaizen.CostSavingPerMonth) > 0 ? `
            <div class="metric is-lg">${Number(kaizen.CostSavingPerMonth).toLocaleString('th-TH')}</div>
            <p class="muted" style="margin:2px 0 0">บาท/เดือน${kaizen.CostSavingRank ? ` · Cost-saving rank ${kaizen.CostSavingRank}` : ''}</p>
          ` : '<p class="muted" style="margin:0">ยังไม่มีข้อมูล Cost saving</p>'}
        </div>
        <div class="card">
          <dl class="def-grid">
            <dt>งบประมาณ</dt><dd>${kaizen.BudgetBand ? escapeHtml(labelOf(budgetBands, kaizen.BudgetBand)) : '—'}</dd>
            <dt>วันเริ่ม</dt><dd>${kaizen.StartDate ? thaiDate(kaizen.StartDate) : '—'}</dd>
            <dt>วันเสร็จ</dt><dd>${kaizen.CompletionDate ? thaiDate(kaizen.CompletionDate) : '—'}</dd>
          </dl>
        </div>
      </div>

      ${kaizen.ProjectType === 'group' && (kaizen.TeamMembers ?? []).length > 0 ? `
        <div class="card" style="margin-top:var(--sp-6)">
          <h2 style="margin-bottom:var(--sp-2)">ทีมงาน</h2>
          <div class="stack is-tight">
            ${kaizen.TeamMembers.map((m) => `
              <div class="hstack">
                <div class="avatar is-sm is-quiet">${escapeHtml(initials(m.FullName))}</div>
                <div>
                  <div style="font-size:13.5px;font-weight:600">${escapeHtml(m.FullName)}</div>
                  <div class="muted mono" style="font-size:11.5px">${escapeHtml(m.EmployeeId)}</div>
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      ` : ''}
    `;
  }

  function hydratePhotos() {
    if (beforePhoto) {
      const img = document.querySelector('[data-photo-slot="before"] img');
      const url = photoUrls.get(beforePhoto.Id) ?? '';
      if (img) { img.src = url; img.addEventListener('click', () => openLightbox(url, beforePhoto.FileName)); }
    }
    if (afterPhoto) {
      const img = document.querySelector('[data-photo-slot="after"] img');
      const url = photoUrls.get(afterPhoto.Id) ?? '';
      if (img) { img.src = url; img.addEventListener('click', () => openLightbox(url, afterPhoto.FileName)); }
    }
    if (otherPhotos.length > 0) {
      const grid = document.getElementById('other-photos');
      grid.innerHTML = otherPhotos.map((a) => `<div class="attach-item" data-id="${a.Id}"><img alt="${escapeAttr(a.FileName)}" /></div>`).join('');
      for (const a of otherPhotos) {
        const img = grid.querySelector(`[data-id="${a.Id}"] img`);
        const url = photoUrls.get(a.Id) ?? '';
        if (img) { img.src = url; img.addEventListener('click', () => openLightbox(url, a.FileName)); }
      }
    }
  }

  function renderForm() {
    const lang = getLang();
    const doneCount = CRITERIA.filter((c) => state.items[c.code] != null).length;
    const rawSum = Object.values(state.items).reduce((a, b) => a + Number(b || 0), 0);
    const allDone = doneCount === CRITERIA.length;

    container.innerHTML = `
      ${pageHeader({
        breadcrumb: [{ label: t('nav_review'), href: '#/review' }, { label: kaizen.Title }],
        title: escapeHtml(kaizen.Title),
        sub: `${escapeHtml(kaizen.Code ?? '')} · ${escapeHtml(labelOf(departments, kaizen.Department))} / ${escapeHtml(labelOf(plants, kaizen.Plant))}`,
      })}
      <div class="page-body">
        ${state.isLocked
          ? '<div class="warning" style="margin-bottom:16px">รอบนี้ปิดแล้ว — คะแนนที่ส่งไว้ถูกล็อก แก้ไขไม่ได้อีก</div>'
          : (state.isSubmitted ? '<div class="note" style="margin-bottom:16px">คุณส่งคะแนนนี้ไปแล้ว — ยังแก้ไขต่อได้จนกว่ารอบนี้จะปิด</div>' : '')}
        <div class="detail-cols">
          <div>
            ${renderProjectDetail()}
          </div>

          <div class="score-rail">
            <h3 style="margin-top:0">ให้คะแนน 7 เกณฑ์</h3>
            <div class="panel is-flush">
              <div class="criteria-list" id="criteria-list"></div>
            </div>

            <div class="card" style="margin-top:var(--sp-5)">
              <div class="metric is-xl">${rawSum}<span class="muted" style="font-size:15px;font-weight:400"> / ${MAX_TOTAL_SCORE}</span></div>
              <div class="bar" style="margin-top:var(--sp-2)"><i style="width:${(rawSum / MAX_TOTAL_SCORE) * 100}%"></i></div>
              <p class="muted" style="font-size:13px;margin:8px 0 0">${allDone ? 'ให้คะแนนครบ 7 เกณฑ์แล้ว' : `ให้ครบ ${doneCount} จาก 7 เกณฑ์ · เหลืออีก ${CRITERIA.length - doneCount} เกณฑ์จึงส่งได้`}</p>
              ${weightPct !== null ? `<p class="muted" style="font-size:13px;margin:4px 0 0">น้ำหนักคะแนนของคุณ ${weightPct}%</p>` : ''}
              <label style="margin-top:var(--sp-4)">ความเห็นโดยรวม
                <textarea id="f-overall-comment" rows="3" ${state.isLocked ? 'disabled' : ''}>${escapeHtml(state.overallComment)}</textarea>
              </label>
              <div id="score-error"></div>
              ${!state.isLocked ? `
                <div class="stack is-tight" style="margin-top:var(--sp-5)">
                  ${!state.isSubmitted ? `
                    <button type="button" id="btn-submit-score" ${state.saving || !allDone ? 'disabled' : ''}>${state.saving ? t('common_loading') : (allDone ? 'ส่งคะแนน' : `ส่งคะแนน — ยังขาด ${CRITERIA.length - doneCount} เกณฑ์`)}</button>
                    <button type="button" id="btn-save-draft" class="ghost" ${state.saving ? 'disabled' : ''}>เก็บร่างไว้ก่อน</button>
                    <p class="muted" style="font-size:12px;margin:4px 0 0">ส่งแล้วยังแก้ไขต่อได้จนกว่ารอบนี้จะปิด</p>
                  ` : `
                    <button type="button" id="btn-save-draft" ${state.saving || !allDone ? 'disabled' : ''}>${state.saving ? t('common_loading') : 'บันทึกการแก้ไขคะแนน'}</button>
                    <a href="#/review" style="display:block;margin-top:var(--sp-2)">กลับไปคิวตรวจให้คะแนน</a>
                  `}
                </div>
              ` : `<a href="#/review" style="display:block;margin-top:var(--sp-4)">กลับไปคิวตรวจให้คะแนน</a>`}
            </div>
          </div>
        </div>
      </div>
    `;

    if (state.error) document.getElementById('score-error').innerHTML = `<div class="error" style="margin-top:var(--sp-2)">${escapeHtml(state.error)}</div>`;

    hydratePhotos();
    renderCriteriaList();

    document.getElementById('f-overall-comment')?.addEventListener('input', (e) => { state.overallComment = e.target.value; });
    document.getElementById('btn-save-draft')?.addEventListener('click', onSaveDraft);
    document.getElementById('btn-submit-score')?.addEventListener('click', onSubmitScore);
  }

  function renderCriteriaList() {
    const lang = getLang();
    const list = document.getElementById('criteria-list');
    list.innerHTML = CRITERIA.map((c, idx) => {
      const val = state.items[c.code];
      const isDone = val != null;
      const isOpen = idx === state.openCriterion;
      const label = escapeHtml(lang === 'en' ? c.labelEn : c.labelTh);

      if (isOpen) {
        const levels = SCORE_LEVELS[c.code];
        const options = levels
          ? levels.map((lv) => `
              <label class="score-option ${Number(val) === lv.level ? 'is-on' : ''}">
                <input type="radio" name="crit-${c.code}" value="${lv.level}" ${Number(val) === lv.level ? 'checked' : ''} ${state.isLocked ? 'disabled' : ''} />
                <span class="lv">${lv.level}</span>
                <span>${escapeHtml(lang === 'en' ? lv.textEn : lv.textTh)}</span>
              </label>
            `).join('')
          : [5, 4, 3, 2, 1].map((lv) => `
              <label class="score-option inline ${Number(val) === lv ? 'is-on' : ''}">
                <input type="radio" name="crit-${c.code}" value="${lv}" ${Number(val) === lv ? 'checked' : ''} ${state.isLocked ? 'disabled' : ''} />
                <span class="lv">${lv}</span>
              </label>
            `).join('');
        return `
          <div class="criterion-open">
            <div class="crit-index">เกณฑ์ที่ ${idx + 1} จาก ${CRITERIA.length}</div>
            <div class="crit-name">${label}</div>
            <div style="margin-top:12px">${options}</div>
          </div>
        `;
      }
      if (isDone) {
        return `
          <div class="criterion-done" data-open="${idx}" style="cursor:pointer">
            <span class="mark"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12l5 5L20 6"/></svg></span>
            <span class="crit-name">${label}</span>
            <span class="crit-score">${val} / 5</span>
          </div>
        `;
      }
      return `
        <div class="criterion-todo" data-open="${idx}" style="cursor:pointer">
          <span class="mark"></span>
          <span class="crit-name">${label}</span>
          <span class="crit-hint">ยังไม่ได้ให้คะแนน</span>
        </div>
      `;
    }).join('');

    list.querySelectorAll('[data-open]').forEach((row) => {
      row.addEventListener('click', () => { state.openCriterion = Number(row.dataset.open); renderForm(); });
    });
    if (!state.isLocked) {
      list.querySelectorAll('input[type="radio"]').forEach((r) => {
        r.addEventListener('change', (e) => {
          const code = e.target.name.replace('crit-', '');
          state.items[code] = Number(e.target.value);
          state.openCriterion = firstIncompleteAfter(state.openCriterion);
          renderForm();
        });
      });
    }
  }

  async function onSaveDraft() {
    state.saving = true; state.error = ''; renderForm();
    try {
      await saveScoreDraft(score.Id, { Items: state.items, OverallComment: state.overallComment });
    } catch (err) {
      state.error = translateError(err.message) || err.message || t('common_error_generic');
    } finally {
      state.saving = false; renderForm();
    }
  }

  async function onSubmitScore() {
    if (CRITERIA.some((c) => state.items[c.code] == null)) return;
    state.saving = true; state.error = ''; renderForm();
    try {
      await saveScoreDraft(score.Id, { Items: state.items, OverallComment: state.overallComment });
      await submitScore(score.Id);
      navigate('#/review');
    } catch (err) {
      state.error = translateError(err.message) || err.message || t('common_error_generic');
      state.saving = false; renderForm();
    }
  }
}
