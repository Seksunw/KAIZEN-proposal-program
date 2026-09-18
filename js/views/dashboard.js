// js/views/dashboard.js — ตาม design handoff README.md §3: period banner + task-list + 2 คอลัมน์
// (แทน .stat-grid เดิมทั้งหมด — MIGRATION.md ข้อ 2)
import { getMyKaizenList, getOpenPeriod, getReviewQueue, getMyScoresForPeriod, getPeriods, getResults, getQuarterlyAwards, getMasterData, getAttachmentSignedUrl, getAvatarSignedUrl } from '../api.js?v=20260911z15';
import { t, tf } from '../i18n.js?v=20260911z15';
import { thaiDate, masterLabel, initials, hydrateAvatars } from '../ui.js?v=20260911z15';

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

  // การ์ดตัวอย่างในการ์ดหมุน "หน้าที่กรรมการ" (2026-09-18, ผู้ใช้ขอ) — โชว์สูงสุด 3 โครงการ
  // ล่าสุดที่รอให้คะแนน (ถ้ามีน้อยกว่า/เกิน 3 ปรับ layout ให้พอดีจำนวนจริงใน renderPage())
  let deckProjects = [];
  if (pendingToScore.length > 0) {
    let departments = [];
    let plants = [];
    try {
      [departments, plants] = await Promise.all([getMasterData('department'), getMasterData('plant')]);
    } catch { /* master_data โหลดไม่ได้ — ใช้ code ดิบแทน ไม่บล็อกหน้า */ }
    const deckSource = [...pendingToScore]
      .sort((a, b) => new Date(b.SubmittedAt ?? 0) - new Date(a.SubmittedAt ?? 0))
      .slice(0, 3);
    deckProjects = await Promise.all(deckSource.map(async (k) => {
      const firstPhoto = [...(k.KaizenAttachments ?? [])].sort((a, b) => (a.SortOrder ?? 0) - (b.SortOrder ?? 0))[0] ?? null;
      let photoUrl = null;
      if (firstPhoto) {
        try { photoUrl = await getAttachmentSignedUrl(firstPhoto.StoragePath); } catch { /* ไม่มีรูปก็ใช้ placeholder แทน ไม่บล็อกหน้า */ }
      }
      return {
        ownerName: k.Owner?.FullName ?? '—',
        department: masterLabel(departments, k.Department),
        plant: masterLabel(plants, k.Plant),
        photoUrl,
      };
    }));
  }

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
      badge: `<span class="badge" data-status="need_revision">${t('dashboard_task_need_revision_badge')}</span>`,
      code: k.Code,
      title: k.Title,
      meta: k.RevisionNote ? escapeHtml(tf('dashboard_task_revision_note', { note: k.RevisionNote })) : t('dashboard_task_revision_generic'),
      buttonLabel: t('dashboard_task_revision_btn'),
      href: `#/kaizen/${k.Id}/edit`,
    });
  }
  for (const k of myKaizen.filter((x) => x.Status === 'draft')) {
    const age = daysBetween(new Date(), new Date(k.UpdatedAt ?? k.CreatedAt));
    const step = estimateFormStep(k);
    tasks.push({
      variant: 'is-warning',
      badge: `<span class="badge" style="color:var(--warning-ink);background:var(--warning-soft);border:1px solid var(--warning-line)">${age > 0 ? escapeHtml(tf('dashboard_task_draft_badge_days', { n: age })) : t('dashboard_task_draft_badge')}</span>`,
      code: null,
      title: k.Title || t('dashboard_untitled_project'),
      meta: tf('dashboard_task_draft_meta', { step }),
      buttonLabel: t('dashboard_continue_btn'),
      href: `#/kaizen/${k.Id}/edit`,
    });
  }
  if (isCommittee && openPeriod && pendingToScore.length > 0) {
    const weightPct = openPeriod.CommitteeWeights?.[session.user.id] ?? null;
    tasks.push({
      variant: 'is-committee',
      badge: `<span class="badge" style="color:var(--violet);background:var(--violet-soft);border:1px solid var(--violet-line)">${t('dashboard_committee_badge')}</span>`,
      code: null,
      title: tf('dashboard_committee_task_title', { n: pendingToScore.length }),
      meta: weightPct !== null
        ? tf('dashboard_committee_task_meta_weight', { done: scoredIds.size, total: reviewQueue.length, pct: weightPct })
        : tf('dashboard_committee_task_meta_no_weight', { done: scoredIds.size, total: reviewQueue.length }),
      buttonLabel: t('dashboard_open_review_btn'),
      href: '#/review',
      isCommitteeDeck: true,
      deckProjects,
    });
  }

  // ★ ผู้ใช้ขอ (2026-09-18) — เดิม render tasks.length ทั้งหมดไม่มี cap เลย ถ้าค้างเยอะ (เช่น 20
  // เรื่อง) หน้าจะยาวมาก โดยเฉพาะมือถือต้องเลื่อนผ่านหมดก่อนถึงส่วน "ผลรอบที่ประกาศแล้ว" ด้านล่าง
  // โชว์แค่ preview ก่อน (5 อันแรกตามลำดับ urgent > warning > committee ที่ push เข้า tasks ไว้
  // อยู่แล้ว) มีปุ่มกดดูที่เหลือ — ไม่ทำ pagination จริงเพราะ tasks โหลดมาในหน่วยความจำครบอยู่แล้ว
  const TASK_PREVIEW_LIMIT = 5;
  let tasksExpanded = false;

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
            <div class="eyebrow period-eyebrow">${t('dashboard_open_period_eyebrow')}</div>
            <h1>${escapeHtml(openPeriod.NameTh)} <span class="mono" style="font-size:15px;font-weight:400;color:var(--muted-2)">${escapeHtml(openPeriod.Code)}</span></h1>
            <div style="display:flex;align-items:baseline;gap:8px;margin-bottom:var(--sp-3)">
              <span class="metric is-lg" style="color:${daysLeft >= 0 ? 'var(--warning)' : 'var(--danger)'}">${daysLeft >= 0 ? daysLeft : 0}</span>
              <span class="muted" style="font-size:13.5px">${daysLeft >= 0 ? escapeHtml(tf('dashboard_days_left_caption', { date: thaiDate(deadline) })) : t('dashboard_deadline_passed')}</span>
            </div>
            <div class="bar"><i class="is-warning" style="width:${elapsed}%"></i></div>
          </div>
        </div>
      `;
    } else {
      bannerHtml = `
        <div class="page-body">
          <div class="card">
            <div class="eyebrow period-eyebrow">${t('dashboard_period_eyebrow_generic')}</div>
            <h1>${t('dashboard_title')}</h1>
            <div class="note" style="margin-top:var(--sp-3)">${t('empty_no_open_period')}</div>
          </div>
        </div>
      `;
    }

    const awardBannerHtml = latestAward ? `
      <div class="page-body" style="padding-bottom:0">
        <div class="card" style="border-color:var(--primary-line);background:var(--primary-soft)">
          <div class="eyebrow" style="color:var(--primary)">${escapeHtml(tf('dashboard_award_banner_eyebrow', { label: latestAward.Label }))}</div>
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

    // ★ ผู้ใช้ขอ (2026-09-18) — การ์ดทักทายแยกจากการ์ดรอบประเมิน วางไว้เหนือกัน รูปก่อนข้อความ
    // ชิดซ้าย (แรงบันดาลใจจาก reference "Hello, Vanessa" ของแอปอื่น) reuse i18n key
    // dashboard_welcome ที่มีอยู่แล้วแต่ไม่เคยถูกเรียกใช้จริงมาก่อน (เจอจาก i18n coverage audit)
    const greetingHtml = `
      <div class="page-body" style="padding-bottom:0">
        <div class="card" style="display:flex;align-items:center;gap:var(--sp-3)">
          <div class="avatar" style="width:48px;height:48px;font-size:16px"${profile?.AvatarPath ? ` data-avatar-path="${escapeHtml(profile.AvatarPath)}"` : ''}>${escapeHtml(initials(profile?.FullName))}</div>
          <div>
            <div style="font-size:13px;color:var(--muted)">${t('dashboard_welcome')}</div>
            <div style="font-weight:700;font-size:19px">${escapeHtml(profile?.FullName ?? '')}</div>
          </div>
        </div>
      </div>
    `;

    container.innerHTML = `
      ${greetingHtml}
      ${bannerHtml}
      ${awardBannerHtml}
      <div class="page-body">
        <div class="section-head is-borderless">
          <h2>${t('dashboard_todo_heading')}</h2>
          <span class="section-note">${tasks.length > 0 ? escapeHtml(tf('dashboard_todo_count', { n: tasks.length })) : ''}</span>
        </div>
        <div class="task-list">
          ${tasks.length === 0
            ? `<div class="empty-state"><div class="empty-title">${t('empty_no_tasks')}</div></div>`
            : (tasksExpanded ? tasks : tasks.slice(0, TASK_PREVIEW_LIMIT)).map((task) => task.isCommitteeDeck ? `
              <div class="task-row ${task.variant} is-deck">
                <div class="task-tags">${task.badge}</div>
                <div class="task-title">${escapeHtml(task.title)}</div>
                <div class="task-meta">${task.meta}</div>
                <div class="deck-wrap is-count-${task.deckProjects.length}">
                  ${task.deckProjects.map((p) => `
                    <div class="deck-card">
                      <div class="deck-content">
                        ${p.photoUrl
                          ? `<img src="${escapeHtml(p.photoUrl)}" alt="" loading="lazy" />`
                          : `<div class="deck-photo-placeholder" aria-hidden="true"></div>`}
                        <div class="deck-scrim"></div>
                        <div class="deck-info">
                          <div class="deck-submitter">${escapeHtml(p.ownerName)}</div>
                          <div class="deck-place">${escapeHtml(p.department)} &middot; ${escapeHtml(p.plant)}</div>
                        </div>
                      </div>
                    </div>
                  `).join('')}
                  <div class="deck-lines" aria-hidden="true"><div class="deck-line"></div><div class="deck-line"></div></div>
                </div>
                <a href="${task.href}"><button type="button" class="deck-cta">${task.buttonLabel}</button></a>
              </div>
            ` : `
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
        ${!tasksExpanded && tasks.length > TASK_PREVIEW_LIMIT ? `
          <div style="text-align:center;margin-top:var(--sp-4)">
            <button type="button" class="secondary" id="btn-show-more-tasks">${escapeHtml(tf('kzlist_load_more', { n: tasks.length - TASK_PREVIEW_LIMIT }))}</button>
          </div>
        ` : ''}

        <div style="margin-top:var(--sp-6)">
          <div class="section-head is-borderless"><h2>${t('dashboard_results_heading')}</h2></div>
          ${myLatestResult ? `
            <div style="padding:var(--sp-4) 0;border-bottom:1px solid var(--line-soft)">
              <div class="muted" style="font-size:13px">${escapeHtml(myLatestResultPeriod.NameTh)}</div>
              <div style="display:flex;align-items:baseline;gap:7px;margin-top:3px">
                <span class="metric is-lg">${Number(myLatestResult.WeightedScore).toFixed(2)}</span>
                <span class="muted" style="font-size:13px">/ 100 · ${myLatestResult.RankOverall !== null ? escapeHtml(tf('dashboard_rank_of', { rank: myLatestResult.RankOverall, total: resultCount })) : t('dashboard_not_ranked')}</span>
              </div>
              <a href="#/feed?period=${encodeURIComponent(myLatestResultPeriod.Code)}" style="font-size:12.8px;font-weight:600">${t('dashboard_view_all_projects')}</a>
            </div>
          ` : `<div class="empty-state"><div class="empty-title">${t('empty_leaderboard')}</div></div>`}
        </div>
      </div>
    `;

    document.getElementById('btn-show-more-tasks')?.addEventListener('click', () => {
      tasksExpanded = true;
      renderPage();
    });

    hydrateAvatars(container, getAvatarSignedUrl);
  }

  renderPage();
}
