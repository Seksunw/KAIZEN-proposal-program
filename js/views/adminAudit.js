// js/views/adminAudit.js — เขียนเป็นประโยค จัดกลุ่มตามวัน (MIGRATION.md ข้อ 14)
import { getAuditLog, getAllProfiles, getPeriods, getKaizenByIds, getAvatarSignedUrl } from '../api.js?v=20260911z7';
import { t, tf, getLang } from '../i18n.js?v=20260911z7';
import { escapeHtml, translateError, pageHeader, skeletonRows, stateCard, emptyState, initials, hydrateAvatars } from '../ui.js?v=20260911z7';
import { KAIZEN_STATUS_LABELS } from '../constants.js?v=20260911z7';

function L(labelObj) { return labelObj[getLang() === 'en' ? 'en' : 'th']; }

const ACTION_GROUPS = {
  submit_kaizen: 'submit',
  submit_score: 'score',
  period_open: 'period',
  period_close: 'period',
  period_publish: 'period',
  status_change: 'decision',
};
const GROUP_LABEL_KEYS = {
  submit: 'aa_group_submit',
  score: 'aa_group_score',
  period: 'aa_group_period',
  decision: 'aa_group_decision',
};

function sentenceFor(e) {
  const who = `<strong>${escapeHtml(e.actorName)}</strong>`;
  const what = `<strong>${escapeHtml(e.entityLabel)}</strong>`;
  switch (e.Action) {
    case 'submit_kaizen': return tf('aa_sentence_submit_kaizen', { who, what });
    case 'submit_score': return tf('aa_sentence_submit_score', { who, what });
    case 'period_open': return tf('aa_sentence_period_open', { who, what });
    case 'period_close': return tf('aa_sentence_period_close', { who, what });
    case 'period_publish': return tf('aa_sentence_period_publish', { who, what });
    case 'status_change': {
      const newStatus = e.After?.Status;
      const label = KAIZEN_STATUS_LABELS[newStatus] ? L(KAIZEN_STATUS_LABELS[newStatus]) : newStatus;
      return tf('aa_sentence_status_change', { who, what, label: escapeHtml(label ?? '—') });
    }
    default: return tf('aa_sentence_default', { who, what, action: escapeHtml(e.Action) }); // fallback กัน action ที่ยังไม่ได้เขียนประโยค
  }
}

// ★ locale เดิม hardcode 'th-TH' ตายตัว ไม่เช็คภาษาที่ตั้งไว้เลย (i18n audit Round 12) —
// เพิ่มสลับ locale ตาม getLang() เหมือน thaiDate()/thaiDateTime() ใน ui.js, และ "วันนี้"/"เมื่อวาน"
// ไปเป็นคีย์ i18n แทน literal ตรงๆ
function dayLabel(dateStr) {
  const lang = getLang();
  const locale = lang === 'en' ? 'en-GB' : 'th-TH';
  const fmt = (d) => d.toLocaleDateString(locale, { day: 'numeric', month: 'long', year: 'numeric' });
  const d = new Date(dateStr);
  const today = new Date();
  const yest = new Date(today); yest.setDate(yest.getDate() - 1);
  const sameDay = (a, b) => a.toDateString() === b.toDateString();
  if (sameDay(d, today)) return `${t('audit_today')} · ${fmt(d)}`;
  if (sameDay(d, yest)) return `${t('audit_yesterday')} · ${fmt(d)}`;
  return fmt(d);
}

export async function render(container) {
  document.title = `${t('nav_admin_audit')} · ${t('appName')}`;
  container.innerHTML = `<div class="page-body">${skeletonRows(5)}</div>`;

  let logs;
  let profiles;
  let periods;
  try {
    [logs, profiles, periods] = await Promise.all([getAuditLog(), getAllProfiles(), getPeriods()]);
  } catch (err) {
    container.innerHTML = `<div class="page-body">${stateCard({
      kind: 'error', title: t('error_load_failed'), body: escapeHtml(translateError(err.message) || err.message || t('common_error_generic')),
      actions: `<button type="button" onclick="location.reload()">${t('state_retry')}</button>`,
    })}</div>`;
    return;
  }

  const nameOf = (id) => profiles.find((p) => p.Id === id)?.FullName ?? t('aa_deleted_user');
  const avatarPathOf = (id) => profiles.find((p) => p.Id === id)?.AvatarPath ?? null;
  const periodById = new Map(periods.map((p) => [p.Id, p]));

  const kaizenIds = new Set();
  logs.forEach((l) => {
    if (l.EntityType === 'kaizen_projects' && l.EntityId) kaizenIds.add(l.EntityId);
    if (l.EntityType === 'committee_scores' && l.After?.KaizenId) kaizenIds.add(l.After.KaizenId);
  });
  // ★ เดิมวน getKaizenById ทีละ id (N+1 — สูงสุด ~200 คำขอพร้อมกันถ้า log เต็ม) เปลี่ยนเป็น
  // ดึงครั้งเดียวด้วย .in() แทน (Spec.md §4.8 finding M11)
  const kaizenById = new Map();
  try {
    const kaizenRows = await getKaizenByIds([...kaizenIds]);
    kaizenRows.forEach((k) => kaizenById.set(k.Id, k));
  } catch { /* โหลดไม่ได้ก็แค่โชว์ id ดิบแทนชื่อ ไม่บล็อกทั้งหน้า */ }

  const enriched = logs.map((l) => {
    let entityLabel = l.EntityId ?? '—';
    if (l.EntityType === 'kaizen_projects') {
      const k = kaizenById.get(l.EntityId);
      entityLabel = k ? (k.Code ?? k.Title) : t('aa_deleted_project');
    } else if (l.EntityType === 'evaluation_periods') {
      const p = periodById.get(l.EntityId);
      entityLabel = p ? p.NameTh : t('aa_deleted_period');
    } else if (l.EntityType === 'committee_scores') {
      const k = kaizenById.get(l.After?.KaizenId);
      entityLabel = k ? (k.Code ?? k.Title) : t('aa_project_generic');
    }
    return { ...l, actorName: nameOf(l.ActorId), actorAvatarPath: avatarPathOf(l.ActorId), entityLabel };
  });

  const state = { group: 'all' };
  renderPage();

  function renderPage() {
    const filtered = state.group === 'all' ? enriched : enriched.filter((e) => ACTION_GROUPS[e.Action] === state.group);
    const groups = [...new Set(Object.values(ACTION_GROUPS))];

    const byDay = new Map();
    filtered.forEach((e) => {
      const key = dayLabel(e.CreatedAt);
      if (!byDay.has(key)) byDay.set(key, []);
      byDay.get(key).push(e);
    });

    const sections = [...byDay.entries()].map(([day, items]) => `
      <div class="section-head"><h2>${escapeHtml(day)}</h2></div>
      <div class="row-list">
        ${items.map((e) => `
          <div class="row-item" title="entity: ${escapeHtml(e.EntityType)}/${escapeHtml(e.EntityId ?? '')}">
            <div class="avatar is-sm is-quiet"${e.actorAvatarPath ? ` data-avatar-path="${escapeHtml(e.actorAvatarPath)}"` : ''}>${escapeHtml(initials(e.actorName))}</div>
            <div class="row-main">
              <div class="row-title" style="font-weight:400">${sentenceFor(e)}</div>
            </div>
            <div class="row-end mono muted" style="font-size:12.5px">${new Date(e.CreatedAt).toLocaleTimeString(getLang() === 'en' ? 'en-GB' : 'th-TH', { hour: '2-digit', minute: '2-digit' })}</div>
          </div>
        `).join('')}
      </div>
    `).join('');

    container.innerHTML = `
      ${pageHeader({ title: t('nav_admin_audit') })}
      <div class="page-body">
        <div class="filter-bar" style="margin-bottom:16px">
          <button type="button" class="filter-chip ${state.group === 'all' ? 'is-on' : ''}" data-group="all">${t('kzlist_filter_all')} ${enriched.length}</button>
          ${groups.map((g) => `<button type="button" class="filter-chip ${state.group === g ? 'is-on' : ''}" data-group="${g}">${escapeHtml(t(GROUP_LABEL_KEYS[g]))} ${enriched.filter((e) => ACTION_GROUPS[e.Action] === g).length}</button>`).join('')}
        </div>
        ${filtered.length === 0 ? emptyState({ title: t('empty_audit') }) : sections}
      </div>
    `;

    container.querySelectorAll('[data-group]').forEach((btn) => btn.addEventListener('click', () => { state.group = btn.dataset.group; renderPage(); }));

    hydrateAvatars(container, getAvatarSignedUrl);
  }
}
