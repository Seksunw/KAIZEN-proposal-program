// js/views/reviewQueue.js — คิวตรวจให้คะแนน (MIGRATION.md ข้อ 7)
import { getOpenPeriod, getReviewQueue, getMyScoresForPeriod, getMasterData, getKaizenByPeriod } from '../api.js?v=20260911z6';
import { t } from '../i18n.js?v=20260911z6';
import { escapeHtml, translateError, pageHeader, skeletonRows, stateCard, emptyState, thaiDate, masterLabel } from '../ui.js?v=20260911z6';

const FILTERS = [
  { key: 'todo', label: 'ยังไม่ให้คะแนน' },
  { key: 'draft', label: 'ร่างค้าง' },
  { key: 'done', label: 'ส่งแล้ว' },
];

// สถานะที่กรรมการ "เห็นได้" ตาม k_read_committee ใน schema.sql — ใช้เป็นตัวหารที่ถูกต้อง
// ของ "ให้คะแนนแล้ว x/y" แทน queue.length เพราะ getReviewQueue คืนเฉพาะ pending_review เท่านั้น
// (โครงการที่กรรมการให้คะแนนไปแล้วแต่เลื่อนสถานะต่อ เช่น scored/approved จะหายจาก queue
// ทำให้ตัวหารเพี้ยนเป็น 0 ทั้งที่เคยให้คะแนนไปแล้ว — เจอจริงตอนทดสอบด้วยบัญชี employee+committee)
const COMMITTEE_VISIBLE_STATUSES = ['pending_review', 'scored', 'approved', 'need_revision', 'published'];

export async function render(container, params, session) {
  document.title = `${t('nav_review')} · ${t('appName')}`;
  container.innerHTML = `<div class="page-body">${skeletonRows(3)}</div>`;

  let openPeriod;
  try {
    openPeriod = await getOpenPeriod();
  } catch (err) {
    container.innerHTML = `<div class="page-body">${stateCard({
      kind: 'error', title: 'โหลดข้อมูลไม่สำเร็จ', body: escapeHtml(translateError(err.message) || err.message || t('common_error_generic')),
      actions: '<button type="button" onclick="location.reload()">โหลดใหม่</button>',
    })}</div>`;
    return;
  }

  if (!openPeriod) {
    container.innerHTML = `
      ${pageHeader({ title: t('nav_review') })}
      <div class="page-body">${emptyState({ title: t('empty_no_open_period') })}</div>
    `;
    return;
  }

  // ★ เจอบั๊กจริงจากการทดสอบ deploy (2026-09-17): ผู้ใช้ role "committee" ที่ "ไม่ได้" ถูกผูกเป็น
  // กรรมการของรอบนี้ (ไม่มี key ตัวเองใน committee_weights) ยังเห็นโครงการโผล่ในคิว "ยังไม่ให้คะแนน"
  // อยู่ดี เพราะ query นี้พึ่ง RLS อย่างเดียวเพื่อกรอง แต่ policy k_read_feed (status<>'draft', เพิ่ม
  // ไว้ให้หน้า "โครงการทั้งหมด" เห็นได้ 2026-09-15) ดันอนุญาตให้ทุกคน select แถว pending_review ได้
  // ด้วยเหมือนกัน ทำให้ query ที่ตั้งใจจะเห็นเฉพาะกรรมการของรอบนั้นกลับเห็นหมดทุกคน — กดให้คะแนนแล้ว
  // มาพังทีหลังตอน insert ชน RLS ของ committee_scores (ซึ่งเช็ค committee_weights จริง) ข้อมูล
  // (weightPct) สำหรับเช็คนี้มีอยู่แล้วในไฟล์นี้ (ใช้แสดงผลอย่างเดียวเดิม) แค่ยังไม่เคยใช้กันเข้าคิว
  const weightPct = openPeriod.CommitteeWeights?.[session.user.id] ?? null;
  if (weightPct === null) {
    container.innerHTML = `
      ${pageHeader({ eyebrow: `รอบ ${openPeriod.Code}`, title: escapeHtml(openPeriod.NameTh) })}
      <div class="page-body">${stateCard({
        kind: 'warning',
        title: 'คุณไม่ได้เป็นกรรมการของรอบนี้',
        body: 'Admin ยังไม่ได้กำหนดให้คุณเป็นกรรมการของรอบประเมินนี้ — ติดต่อ Admin ถ้าควรได้รับสิทธิ์ให้คะแนนในรอบนี้',
      })}</div>
    `;
    return;
  }

  let queue = [];
  let myScores = [];
  let committeeRoles = [];
  let periodKaizen = [];
  let departments = [];
  try {
    [queue, myScores, committeeRoles, periodKaizen, departments] = await Promise.all([
      getReviewQueue(openPeriod.Id),
      getMyScoresForPeriod(openPeriod.Id, session.user.id),
      getMasterData('committee_role'),
      getKaizenByPeriod(openPeriod.Id),
      getMasterData('department'),
    ]);
  } catch (err) {
    container.innerHTML = `<div class="page-body">${stateCard({
      kind: 'error', title: 'โหลดข้อมูลไม่สำเร็จ', body: escapeHtml(translateError(err.message) || err.message || t('common_error_generic')),
      actions: '<button type="button" onclick="location.reload()">โหลดใหม่</button>',
    })}</div>`;
    return;
  }

  const scoreByKaizen = new Map(myScores.map((s) => [s.KaizenId, s]));
  const submittedCount = myScores.filter((s) => s.Status === 'submitted').length;
  // periodKaizen อาจมีโครงการของตัวเอง (ถ้า account นี้เป็น employee ด้วย) ปนมาด้วยผ่าน
  // k_read_own — กรองด้วยสถานะที่กรรมการให้คะแนนได้เท่านั้น ไม่ใช่กรองด้วยเจ้าของ
  const totalScorable = periodKaizen.filter((k) => COMMITTEE_VISIBLE_STATUSES.includes(k.Status)).length;
  const committeeRoleLabel = session.profile?.CommitteeRole ? masterLabel(committeeRoles, session.profile.CommitteeRole) : null;

  function scoreState(kaizenId) {
    const score = scoreByKaizen.get(kaizenId);
    if (!score) return 'todo';
    if (score.Status === 'submitted') return 'done';
    return 'draft';
  }

  const rowsWithState = queue.map((k) => ({ k, state: scoreState(k.Id) }));

  const state = { filter: 'all' };
  renderPage();

  function renderPage() {
    const counts = { todo: 0, draft: 0, done: 0 };
    rowsWithState.forEach((r) => { counts[r.state] += 1; });

    const filtered = state.filter === 'all' ? rowsWithState : rowsWithState.filter((r) => r.state === state.filter);
    const priority = { todo: 0, draft: 1, done: 2 };
    filtered.sort((a, b) => priority[a.state] - priority[b.state]);

    const chips = [
      `<button type="button" class="filter-chip ${state.filter === 'all' ? 'is-on' : ''}" data-filter="all">ทั้งหมด ${rowsWithState.length}</button>`,
      ...FILTERS.map((f) => `<button type="button" class="filter-chip ${state.filter === f.key ? 'is-on' : ''}" data-filter="${f.key}">${f.label} ${counts[f.key]}</button>`),
    ].join('');

    const cards = filtered.map(({ k, state: st }) => {
      const photoCount = (k.KaizenAttachments ?? []).length;
      const metaBits = [`${photoCount} รูป`];
      if (!k.IsCompleted) metaBits.push('ยังไม่เสร็จ — อยู่ระหว่างดำเนินการ');
      if (k.CostSavingRank) metaBits.push(`Cost-saving rank ${k.CostSavingRank}`);

      const isOwn = k.OwnerId === session.user.id;

      let actionHtml;
      if (isOwn) {
        actionHtml = `
          <div style="text-align:right">
            <div class="muted" style="font-size:12.5px;margin-bottom:var(--sp-2)">โครงการของคุณเอง</div>
            <button type="button" class="secondary" disabled title="ให้คะแนนโครงการของตัวเองไม่ได้">ให้คะแนนไม่ได้</button>
          </div>
        `;
      } else if (st === 'todo') {
        actionHtml = `<a href="#/review/${k.Id}"><button type="button">ให้คะแนน 7 เกณฑ์</button></a>`;
      } else if (st === 'draft') {
        const score = scoreByKaizen.get(k.Id);
        const doneCount = Object.keys(score?.Items ?? {}).length;
        actionHtml = `
          <div style="text-align:right">
            <div class="muted" style="font-size:12.5px;margin-bottom:var(--sp-2)">ร่างคะแนนค้างไว้ ${doneCount} จาก 7 เกณฑ์</div>
            <a href="#/review/${k.Id}"><button type="button" class="secondary" style="background:var(--primary-soft);border-color:var(--primary-line);color:var(--primary)">ให้คะแนนต่อ</button></a>
          </div>
        `;
      } else {
        const score = scoreByKaizen.get(k.Id);
        actionHtml = `
          <div style="text-align:right">
            <div class="muted" style="font-size:12.5px;margin-bottom:var(--sp-2)">ให้ไว้ ${score?.RawSum ?? 0}/35</div>
            <a href="#/review/${k.Id}"><button type="button" class="secondary">ดูคะแนนที่ให้ไว้</button></a>
          </div>
        `;
      }

      return `
        <div class="task-row" style="${st === 'done' ? 'opacity:.7' : ''}">
          <div class="task-main">
            <div class="task-tags">
              <span class="code">${escapeHtml(k.Code ?? '—')}</span>
              <span class="muted" style="font-size:12.5px">${escapeHtml(masterLabel(departments, k.Department))} · ส่ง ${k.SubmittedAt ? thaiDate(k.SubmittedAt) : '—'}</span>
            </div>
            <div class="task-title">${escapeHtml(k.Title)}</div>
            <div class="task-meta">${metaBits.join(' · ')}</div>
          </div>
          ${actionHtml}
        </div>
      `;
    }).join('');

    container.innerHTML = `
      ${pageHeader({
        eyebrow: `รอบ ${openPeriod.Code}`,
        title: escapeHtml(openPeriod.NameTh),
        sub: [
          weightPct !== null ? `${committeeRoleLabel ? escapeHtml(committeeRoleLabel) + ' · ' : ''}น้ำหนักคะแนนของคุณ ${weightPct}%` : '',
          `ให้คะแนนแล้ว ${submittedCount}/${totalScorable}`,
          `ปิดรับ ${thaiDate(openPeriod.SubmissionDeadline)}`,
        ].filter(Boolean).join(' · '),
      })}
      <div class="page-body">
        <div class="bar" style="margin-bottom:16px"><i style="width:${totalScorable ? (submittedCount / totalScorable) * 100 : 0}%"></i></div>
        <div class="filter-bar" style="margin-bottom:16px">${chips}</div>
        ${rowsWithState.length === 0
          ? emptyState({ title: t('empty_review_queue') })
          : filtered.length === 0
            ? emptyState({ title: 'ไม่มีโครงการในตัวกรองนี้' })
            : `<div class="task-list">${cards}</div>`}
      </div>
    `;

    container.querySelectorAll('[data-filter]').forEach((btn) => {
      btn.addEventListener('click', () => { state.filter = btn.dataset.filter; renderPage(); });
    });
  }
}
