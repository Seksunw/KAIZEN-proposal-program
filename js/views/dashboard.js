// js/views/dashboard.js — ตาม design handoff README.md §3: period banner + task-list + 2 คอลัมน์
// (แทน .stat-grid เดิมทั้งหมด — MIGRATION.md ข้อ 2)
import { getMyKaizenList, getOpenPeriod, getReviewQueue, getMyScoresForPeriod, getPeriods, getResults, getQuarterlyAwards } from '../api.js?v=20260911z7';
import { t } from '../i18n.js?v=20260911z7';
import { thaiDate } from '../ui.js?v=20260911z7';

function escapeHtml(s) {
  const div = document.createElement('div');
  div.textContent = s ?? '';
  return div.innerHTML;
}

function daysBetween(a, b) {
  return Math.floor((a.getTime() - b.getTime()) / 86400000);
}

// ประเมินว่า draft กรอกไปถึงขั้นไหนแล้ว จากฟิลด์ที่มีค่า (ไม่มี column เก็บ step ใน DB
// จึงอนุมานจากข้อมูลที่กรอกจริง)
function estimateFormStep(k) {
  let step = 1;
  if (k.Title && (k.Categories?.length ?? 0) > 0 && k.ProblemDescription) step = 2;
  if (k.ImprovementApproach) step = 3;
  if (k.StartDate || k.CompletionDate || k.NextFollowUpDate) step = 4;
  return step;
}

export async function render(container, params, session) {
  document.title = `${t('dashboard_title')} · ${t('appName')}`;
  const profile = session?.profile;

  if (profile && !profile.IsActive) {
    container.innerHTML = `
      <header class="page-header">
        <div class="page-header-main"><h1>${t('dashboard_title')}</h1></div>
      </header>
      <div class="page-body">
        <p class="warning">${t('account_inactive')}</p>
      </div>
    `;
    return;
  }

  const roles = profile?.Roles ?? [];
  const isCommittee = roles.includes('committee') || roles.includes('admin');

  let myKaizen = [];
  let openPeriod = null;
  let periods = [];
  try {
    [myKaizen, openPeriod, periods] = await Promise.all([
      getMyKaizenList(session.user.id),
      getOpenPeriod(),
      getPeriods(),
    ]);
  } catch (err) {
    container.innerHTML = `
      <div class="page-body">
        <div class="state-card is-error">
          <div class="state-main">
            <div class="state-title">${t('error_load_failed')}</div>
            <p class="state-body">${escapeHtml(err.message || t('dashboard_load_error_hint'))}</p>
            <div class="state-actions"><button type="button" onclick="location.reload()">${t('state_retry')}</button></div>
          </div>
        </div>
      </div>
    `;
    return;
  }

  // ★ banner รางวัลใหญ่ที่ admin ประกาศไว้ (Spec.md §2.11) — ไม่บล็อกหน้าถ้าโหลดไม่สำเร็จ
  //   เอาแค่รายการล่าสุด (เรียง published_at desc มาจาก getQuarterlyAwards() แล้ว)
  let latestAward = null;
  try {
    const awards = await getQuarterlyAwards();
    latestAward = awards[0] ?? null;
  } catch { /* ไม่มี banner ก็ไม่เป็นไร ไม่บล็อกหน้าหลัก */ }

  // งานที่ต้องให้คะแนน (เฉพาะกรรมการ)
  let reviewQueue = [];
  let myScores = [];
  if (isCommittee && openPeriod) {
    try {
      [reviewQueue, myScores] = await Promise.all([
        getReviewQueue(openPeriod.Id),
        getMyScoresForPeriod(openPeriod.Id, session.user.id),
      ]);
    } catch { /* เพิกเฉย — ไม่บล็อก dashboard */ }
  }
  const scoredIds = new Set(myScores.filter((s) => s.Status === 'submitted').map((s) => s.KaizenId));
  const pendingToScore = reviewQueue.filter((k) => !scoredIds.has(k.Id));

  // ผลรอบล่าสุดที่ประกาศแล้ว ที่มีโครงการของฉันอยู่
  const publishedPeriods = periods.filter((p) => p.Status === 'published')
    .sort((a, b) => (a.PeriodStart < b.PeriodStart ? 1 : -1));
  let myLatestResult = null;
  let myLatestResultPeriod = null;
  let resultCount = 0;
  for (const p of publishedPeriods) {
    const mine = myKaizen.find((k) => k.PeriodId === p.Id);
    if (!mine) continue;
    try {
      const results = await getResults(p.Id);
      const row = results.find((r) => r.KaizenId === mine.Id);
      if (row) {
        myLatestResult = row;
        myLatestResultPeriod = p;
        resultCount = results.length;
        break;
      }
    } catch { /* เพิกเฉย */ }
  }

  // ============ task list "ต้องทำก่อน" ============
  const tasks = [];
  for (const k of myKaizen.filter((x) => x.Status === 'need_revision')) {
    tasks.push({
      variant: 'is-urgent',
      badge: '<span class="badge" data-status="need_revision">ต้องแก้ไข</span>',
      code: k.Code,
      title: k.Title,
      meta: k.RevisionNote ? `กรรมการแจ้ง: ${escapeHtml(k.RevisionNote)}` : 'กรรมการขอให้แก้ไขก่อนส่งใหม่',
      buttonLabel: 'แก้ไขตามที่กรรมการแจ้ง',
      href: `#/kaizen/${k.Id}/edit`,
    });
  }
  for (const k of myKaizen.filter((x) => x.Status === 'draft')) {
    const age = daysBetween(new Date(), new Date(k.UpdatedAt ?? k.CreatedAt));
    const step = estimateFormStep(k);
    tasks.push({
      variant: 'is-warning',
      badge: `<span class="badge" style="color:var(--warning-ink);background:var(--warning-soft);border:1px solid var(--warning-line)">ร่างค้าง${age > 0 ? ` ${age} วัน` : ''}</span>`,
      code: null,
      title: k.Title || '(ยังไม่ได้ตั้งชื่อโครงการ)',
      meta: `กรอกถึงขั้น ${step} จาก 6`,
      buttonLabel: 'กรอกต่อ',
      href: `#/kaizen/${k.Id}/edit`,
    });
  }
  if (isCommittee && openPeriod && pendingToScore.length > 0) {
    const weightPct = openPeriod.CommitteeWeights?.[session.user.id] ?? null;
    tasks.push({
      variant: 'is-committee',
      badge: '<span class="badge" style="color:var(--violet);background:var(--violet-soft);border:1px solid var(--violet-line)">หน้าที่กรรมการ</span>',
      code: null,
      title: `เหลือ ${pendingToScore.length} โครงการที่คุณยังไม่ให้คะแนน`,
      meta: `ให้คะแนนแล้ว ${scoredIds.size} จาก ${reviewQueue.length}${weightPct !== null ? ` · น้ำหนักคะแนนของคุณในรอบนี้ ${weightPct}%` : ''}`,
      buttonLabel: 'เปิดคิวตรวจ',
      href: '#/review',
    });
  }

  function renderPage() {
    // ============ period banner ============
    let bannerHtml;
    if (openPeriod) {
      const now = new Date();
      const deadline = new Date(openPeriod.SubmissionDeadline);
      const start = new Date(openPeriod.PeriodStart);
      const daysLeft = daysBetween(deadline, now);
      const totalSpan = Math.max(1, daysBetween(deadline, start));
      const elapsed = Math.min(100, Math.max(0, (daysBetween(now, start) / totalSpan) * 100));

      // ★ ผู้ใช้ขอเปลี่ยนจาก .page-header (แถบหัวเดิม) เป็น .card (2026-09-15) และเอาปุ่ม tab
      // "ของฉัน/ทั้งโรงงาน/รอบก่อนหน้า" ออก — เดิมปุ่มพวกนี้อยู่ในนี้ด้วย
      bannerHtml = `
        <div class="page-body">
          <div class="card">
            <div class="eyebrow period-eyebrow">รอบการประเมินที่เปิดอยู่</div>
            <h1>${escapeHtml(openPeriod.NameTh)} <span class="mono" style="font-size:15px;font-weight:400;color:var(--muted-2)">${escapeHtml(openPeriod.Code)}</span></h1>
            <div style="display:flex;align-items:baseline;gap:8px;margin-bottom:var(--sp-3)">
              <span class="metric is-lg" style="color:${daysLeft >= 0 ? 'var(--warning)' : 'var(--danger)'}">${daysLeft >= 0 ? daysLeft : 0}</span>
              <span class="muted" style="font-size:13.5px">${daysLeft >= 0 ? `วันก่อนปิดรับ · ${thaiDate(deadline)}` : 'ปิดรับแล้ว'}</span>
            </div>
            <div class="bar"><i class="is-warning" style="width:${elapsed}%"></i></div>
          </div>
        </div>
      `;
    } else {
      bannerHtml = `
        <div class="page-body">
          <div class="card">
            <div class="eyebrow period-eyebrow">รอบการประเมิน</div>
            <h1>${t('dashboard_title')}</h1>
            <div class="note" style="margin-top:var(--sp-3)">${t('empty_no_open_period')}</div>
          </div>
        </div>
      `;
    }

    const awardBannerHtml = latestAward ? `
      <div class="page-body" style="padding-bottom:0">
        <div class="card" style="border-color:var(--primary-line);background:var(--primary-soft)">
          <div class="eyebrow" style="color:var(--primary)">รางวัลใหญ่ · ${escapeHtml(latestAward.Label)}</div>
          <div class="stack is-tight" style="margin-top:var(--sp-3)">
            ${latestAward.Winners.map((w) => `
              <div class="hstack" style="justify-content:space-between;flex-wrap:wrap">
                <span style="font-weight:600">${w.Rank}. ${escapeHtml(w.OwnerName ?? '—')} — ${escapeHtml(w.KaizenTitle ?? '—')}</span>
                <span class="mono muted" style="font-size:12.5px">${Number(w.WeightedScore).toFixed(2)} / 100</span>
              </div>
            `).join('')}
          </div>
        </div>
      </div>
    ` : '';

    container.innerHTML = `
      ${bannerHtml}
      ${awardBannerHtml}
      <div class="page-body">
        <div class="section-head is-borderless">
          <h2>ต้องทำก่อน</h2>
          <span class="section-note">${tasks.length > 0 ? `${tasks.length} เรื่องที่ค้างอยู่ที่คุณ` : ''}</span>
        </div>
        <div class="task-list">
          ${tasks.length === 0
            ? `<div class="empty-state"><div class="empty-title">${t('empty_no_tasks')}</div></div>`
            : tasks.map((task) => `
              <div class="task-row ${task.variant}">
                <span class="task-rail"></span>
                <div class="task-main">
                  <div class="task-tags">
                    ${task.badge}
                    ${task.code ? `<span class="mono" style="font-size:12px;color:var(--muted-2)">${escapeHtml(task.code)}</span>` : ''}
                  </div>
                  <div class="task-title">${escapeHtml(task.title)}</div>
                  <div class="task-meta">${task.meta}</div>
                </div>
                <a href="${task.href}"><button type="button">${task.buttonLabel}</button></a>
              </div>
            `).join('')}
        </div>

        <div style="margin-top:var(--sp-6)">
          <div class="section-head is-borderless"><h2>ผลรอบที่ประกาศแล้ว</h2></div>
          ${myLatestResult ? `
            <div style="padding:var(--sp-4) 0;border-bottom:1px solid var(--line-soft)">
              <div class="muted" style="font-size:13px">${escapeHtml(myLatestResultPeriod.NameTh)}</div>
              <div style="display:flex;align-items:baseline;gap:7px;margin-top:3px">
                <span class="metric is-lg">${Number(myLatestResult.WeightedScore).toFixed(2)}</span>
                <span class="muted" style="font-size:13px">/ 100 · ${myLatestResult.RankOverall !== null ? `อันดับ ${myLatestResult.RankOverall} จาก ${resultCount}` : 'ยังไม่เสร็จ — ไม่นับอันดับ'}</span>
              </div>
              <a href="#/feed?period=${encodeURIComponent(myLatestResultPeriod.Code)}" style="font-size:12.8px;font-weight:600">ดูโครงการทั้งหมดในรอบนี้</a>
            </div>
          ` : `<div class="empty-state"><div class="empty-title">${t('empty_leaderboard')}</div></div>`}
        </div>
      </div>
    `;
  }

  renderPage();
}
