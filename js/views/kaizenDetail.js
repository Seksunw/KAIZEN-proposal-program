// js/views/kaizenDetail.js — รายละเอียด KAIZEN (MIGRATION.md ข้อ 5)
import { getKaizenById, getAttachmentSignedUrl, getResults, getMasterData } from '../api.js?v=20260911z6';
import { t, getLang } from '../i18n.js?v=20260911z6';
import { escapeHtml, escapeAttr, pageHeader, skeletonRows, stateCard, statusBadge, thaiDate, initials, openLightbox, masterLabel } from '../ui.js?v=20260911z6';
import { CATEGORY_LABELS } from '../constants.js?v=20260911z6';

export async function render(container, params, session) {
  document.title = `KAIZEN · ${t('appName')}`;
  container.innerHTML = `<div class="page-body">${skeletonRows(4)}</div>`;

  let kaizen;
  try {
    kaizen = await getKaizenById(params.id);
  } catch (err) {
    container.innerHTML = `<div class="page-body">${stateCard({
      kind: 'error',
      title: 'โหลดข้อมูลไม่สำเร็จ',
      body: escapeHtml(err.message || 'สัญญาณในไลน์ผลิตไม่นิ่งเป็นสาเหตุที่พบบ่อย'),
      actions: '<button type="button" onclick="location.reload()">โหลดใหม่</button>',
    })}</div>`;
    return;
  }

  const lang = getLang();
  const roles = session.profile?.Roles ?? [];
  const isOwner = kaizen.OwnerId === session.user.id;
  const isAdmin = roles.includes('admin');
  // ★ k_read_feed (2026-09-15) เปิดให้ "ทุกคน" อ่านโครงการที่ส่งแล้วของคนอื่นได้แล้ว (หน้า
  // kaizenFeed.js) แต่ผู้ใช้ยืนยันชัดเจนว่าเข้าหน้ารายละเอียดผ่านทางนี้ต้อง "ไม่เห็นสถานะการ
  // ให้คะแนน หรือคะแนนที่ได้" เลย แม้รอบนั้นจะประกาศผลแล้วก็ตาม (การประกาศผลจริงทำผ่านช่องทาง
  // อื่น — รอบรายเดือน Top 5 / รอบไตรมาส Top 3 รางวัลใหญ่ ไม่ใช่การไล่ดูทีละโครงการจากหน้านี้) —
  // "สถานะ" ของ kaizen_projects เป็นคอลัมน์ธรรมดาที่ k_read_feed เปิดให้เห็นเต็มๆ ไม่มี RLS กัน
  // ต้องซ่อนเองที่ชั้น UI ส่วนคะแนนจริง (resultRow ด้านล่าง) แม้ v_kaizen_results จะเปิดให้อ่าน
  // ได้ตามกฎเดิม (published=ทุกคน) ก็ต้อง "ไม่ query เลย" ถ้าไม่ใช่เจ้าของ/admin ตามที่ตกลงไว้ —
  // เฉพาะเจ้าของ/admin เท่านั้นที่เห็นทั้งสถานะและคะแนน (กรรมการที่ต้องให้คะแนนจริงๆ ใช้หน้า
  // reviewScore.js ต่างหาก ไม่ใช่หน้านี้)
  const canSeeStatus = isOwner || isAdmin;

  let departments = [];
  let plants = [];
  let budgetBands = [];
  try {
    [departments, plants, budgetBands] = await Promise.all([
      getMasterData('department'),
      getMasterData('plant'),
      getMasterData('budget_band'),
    ]);
  } catch { /* ใช้ code ดิบแทนถ้าโหลด master_data ไม่ได้ */ }
  const labelOf = (list, code) => masterLabel(list, code);

  // ★ ผู้ใช้ยืนยันชัดเจน (2026-09-15): แม้รอบจะประกาศผลแล้ว (v_kaizen_results เปิดให้ทุกคนอ่านได้
  // ตามกฎเดิมของระบบ) ก็ไม่ให้คนที่ไม่ใช่เจ้าของ/admin เห็นคะแนนผ่านหน้านี้อยู่ดี — การประกาศผล
  // จริงจะทำผ่านช่องทางอื่นแทน (รอบรายเดือน Top 5, รอบไตรมาส Top 3 รางวัลใหญ่ — ดู
  // quarterly_awards ที่มีอยู่แล้ว) ไม่ใช่การเปิดให้ไล่ดูคะแนนทีละโครงการจากหน้า Feed — เช็ค
  // canSeeStatus ก่อนแม้แต่จะ query เลย (ไม่ใช่แค่ซ่อนตอน render) กันไว้ตั้งแต่ต้น
  let resultRow = null;
  if (kaizen.PeriodId && canSeeStatus) {
    try {
      const results = await getResults(kaizen.PeriodId);
      resultRow = results.find((r) => r.KaizenId === kaizen.Id) ?? null;
    } catch { /* ยังไม่ published/closed หรือไม่มีสิทธิ์ — ไม่แสดง section นี้ */ }
  }

  const attachments = kaizen.KaizenAttachments ?? [];
  const beforePhotos = attachments.filter((a) => a.Phase === 'before');
  const afterPhotos = attachments.filter((a) => a.Phase === 'after');
  const otherPhotos = attachments.filter((a) => a !== beforePhotos[0] && a !== afterPhotos[0]);

  const statusLabel = canSeeStatus ? statusBadge(kaizen.Status, lang) : '';
  const contextParts = [labelOf(departments, kaizen.Department), labelOf(plants, kaizen.Plant)];
  if (kaizen.ProjectType === 'group') contextParts.push(`โครงการกลุ่ม ${(kaizen.TeamMembers ?? []).length + 1} คน`);

  const actions = [];
  if (isOwner && kaizen.Status === 'need_revision') {
    actions.push(`<a href="#/kaizen/${kaizen.Id}/edit"><button type="button">แก้ไขตามที่กรรมการแจ้ง</button></a>`);
  } else if (isOwner && kaizen.Status === 'draft') {
    actions.push(`<a href="#/kaizen/${kaizen.Id}/edit"><button type="button">กรอกต่อ</button></a>`);
  }
  // ★ 2026-09-08: เข้าคิวกรรมการได้แม้ยังไม่เสร็จงาน (ดู schema.sql can_track_progress()) —
  //   ปุ่มนี้เลยต้องโชว์ต่อแม้ status ไปถึง pending_review/scored/approved แล้ว ตราบใดที่ยังไม่เสร็จ
  if (isOwner && !kaizen.IsCompleted && ['submitted', 'in_progress', 'pending_review', 'scored', 'approved'].includes(kaizen.Status)) {
    actions.push(`<a href="#/kaizen/${kaizen.Id}/progress"><button type="button" class="secondary">บันทึกความคืบหน้า</button></a>`);
  }

  container.innerHTML = `
    ${pageHeader({
      breadcrumb: [{ label: t('nav_kaizen'), href: '#/kaizen' }, { label: kaizen.Title }],
      title: escapeHtml(kaizen.Title),
      sub: [statusLabel, ...contextParts.map(escapeHtml)].filter(Boolean).join(' · '),
      actions: actions.join(''),
    })}
    <div class="page-body">
      <div class="detail-cols">
        <div>
          <div class="photo-pair">
            ${photoSlotHtml(beforePhotos[0], 'ก่อนทำ', false)}
            ${photoSlotHtml(afterPhotos[0], 'หลังทำ', true)}
          </div>
          ${otherPhotos.length > 0 ? `
            <div class="attach-grid" style="margin-top:var(--sp-2)" id="other-photos"></div>
          ` : ''}

          <h3 style="margin-top:var(--sp-6)">ปัญหา</h3>
          <p style="font-size:15px;line-height:1.65">${escapeHtml(kaizen.ProblemDescription || '—')}</p>
          <h3>แนวทางการปรับปรุง</h3>
          <p style="font-size:15px;line-height:1.65">${escapeHtml(kaizen.ImprovementApproach || '—')}</p>

          <h3>ความคืบหน้า</h3>
          ${renderTimeline(kaizen.KaizenProgressUpdates ?? [])}
        </div>

        <div>
          <div class="card">
            <h2>ผลที่วัดได้</h2>
            ${Number(kaizen.CostSavingPerMonth) > 0 ? `
              <div class="metric is-xl">${Number(kaizen.CostSavingPerMonth).toLocaleString('th-TH')}</div>
              <p class="muted" style="margin:2px 0 0">บาท/เดือน${kaizen.CostSavingRank ? ` · Cost-saving rank ${kaizen.CostSavingRank}` : ''}</p>
            ` : '<p class="muted" style="margin:0">ยังไม่มีข้อมูล Cost saving</p>'}
            ${resultRow ? `
              <hr />
              <div class="metric is-lg">${Number(resultRow.WeightedScore).toFixed(2)}</div>
              <p class="muted" style="margin:2px 0 0">/ 100 · ${resultRow.RankOverall !== null ? `อันดับ ${resultRow.RankOverall}` : 'ยังไม่เสร็จ — ไม่นับอันดับ'}</p>
            ` : ''}
          </div>

          <div class="card" style="margin-top:var(--sp-4)">
            <dl class="def-grid">
              <dt>งบประมาณ</dt><dd>${kaizen.BudgetBand ? escapeHtml(labelOf(budgetBands, kaizen.BudgetBand)) : '—'}</dd>
              <dt>วันเริ่ม</dt><dd>${kaizen.StartDate ? thaiDate(kaizen.StartDate) : '—'}</dd>
              <dt>วันเสร็จ</dt><dd>${kaizen.CompletionDate ? thaiDate(kaizen.CompletionDate) : '—'}</dd>
              <dt>ติดตามครั้งถัดไป</dt><dd>${kaizen.NextFollowUpDate ? thaiDate(kaizen.NextFollowUpDate) : '—'}</dd>
              <dt>ผู้รับผิดชอบ</dt><dd>${kaizen.ResponsibleUserId === session.user.id ? escapeHtml(session.profile.FullName) : 'เจ้าของโครงการ'}</dd>
            </dl>
          </div>

          ${kaizen.ProjectType === 'group' && (kaizen.TeamMembers ?? []).length > 0 ? `
            <div class="card" style="margin-top:var(--sp-4)">
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
        </div>
      </div>
    </div>
  `;

  if (otherPhotos.length > 0) {
    const grid = document.getElementById('other-photos');
    grid.innerHTML = otherPhotos.map((a) => `<div class="attach-item" data-id="${a.Id}"><img alt="${escapeAttr(a.FileName)}" /></div>`).join('');
    for (const a of otherPhotos) {
      try {
        const url = await getAttachmentSignedUrl(a.StoragePath);
        const img = grid.querySelector(`[data-id="${a.Id}"] img`);
        img.src = url;
        img.addEventListener('click', () => openLightbox(url, a.FileName));
      } catch { /* thumbnail โหลดไม่ขึ้น ไม่บล็อกทั้งหน้า */ }
    }
  }
  await hydratePhotoPair(beforePhotos[0], 'before');
  await hydratePhotoPair(afterPhotos[0], 'after');

  async function hydratePhotoPair(attachment, phase) {
    if (!attachment) return;
    try {
      const url = await getAttachmentSignedUrl(attachment.StoragePath);
      const img = document.querySelector(`[data-photo-slot="${phase}"] img`);
      if (img) {
        img.src = url;
        img.addEventListener('click', () => openLightbox(url, attachment.FileName));
      }
    } catch { /* ไม่บล็อกทั้งหน้า */ }
  }
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

function renderTimeline(updates) {
  if (updates.length === 0) return '<p class="muted">ยังไม่มีการอัปเดตความคืบหน้า</p>';
  const sorted = [...updates].sort((a, b) => (a.UpdateDate < b.UpdateDate ? 1 : -1));
  return `
    <ul class="timeline">
      ${sorted.map((p) => `
        <li>
          <div class="tl-rail"><span class="tl-dot"></span><span class="tl-line"></span></div>
          <div style="flex:1;min-width:0">
            <span class="tl-date">${thaiDate(p.UpdateDate)}</span>
            <p class="tl-note">${escapeHtml(p.Note)}</p>
            ${p.Obstacles ? `<p class="tl-obstacle">ติดขัด: ${escapeHtml(p.Obstacles)}</p>` : ''}
          </div>
        </li>
      `).join('')}
    </ul>
  `;
}
