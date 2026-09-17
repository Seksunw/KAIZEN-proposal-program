// js/views/kaizenList.js — รายการ KAIZEN ของฉัน (MIGRATION.md ข้อ 3)
import { getMyKaizenListPage, getMyKaizenStatusCounts, deleteKaizen } from '../api.js?v=20260911z6';
import { t } from '../i18n.js?v=20260911z6';
import { escapeHtml, translateError, pageHeader, skeletonRows, stateCard, emptyState, statusBadge, thaiDate, todayInSystemTz, daysBetweenDateStrings } from '../ui.js?v=20260911z6';

const PAGE_SIZE = 20;

// ลำดับความสำคัญ: ต้องแก้ไข → กำลังทำ → รอผลตัดสิน → ร่าง → ประกาศผลแล้ว
const SORT_PRIORITY = {
  need_revision: 0,
  in_progress: 1, submitted: 1,
  pending_review: 2, scored: 2, approved: 2,
  draft: 3,
  published: 4,
};

const FILTERS = [
  { key: 'all', label: 'ทั้งหมด', statuses: null },
  { key: 'need_revision', label: 'ต้องแก้ไข', statuses: ['need_revision'] },
  { key: 'in_progress', label: 'กำลังทำ', statuses: ['submitted', 'in_progress'] },
  { key: 'pending', label: 'รอผลตัดสิน', statuses: ['pending_review', 'scored', 'approved'] },
  { key: 'draft', label: 'ร่าง', statuses: ['draft'] },
  { key: 'published', label: 'ประกาศผลแล้ว', statuses: ['published'] },
];

function contextLine(k) {
  if (k.Status === 'need_revision') {
    return k.RevisionNote ? `กรรมการแจ้ง: ${escapeHtml(k.RevisionNote)}` : 'กรรมการขอให้แก้ไขก่อนส่งใหม่';
  }
  if (k.Status === 'in_progress') return 'กำลังดำเนินการ';
  if (k.Status === 'draft') {
    const days = Math.floor((Date.now() - new Date(k.UpdatedAt ?? k.CreatedAt).getTime()) / 86400000);
    return days > 0 ? `ร่างค้าง ${days} วัน` : 'บันทึกร่างวันนี้';
  }
  if (k.Status === 'pending_review') return 'รอกรรมการตรวจให้คะแนน';
  if (k.Status === 'scored') return 'ให้คะแนนครบแล้ว รอ Admin ตัดสิน';
  if (k.Status === 'approved') return 'อนุมัติแล้ว รอประกาศผล';
  return '';
}

export async function render(container, params, session) {
  document.title = `${t('nav_kaizen')} · ${t('appName')}`;
  container.innerHTML = pageHeader({ title: t('nav_kaizen') }) + `<div class="page-body">${skeletonRows(4)}</div>`;

  const canCreate = (session.profile?.Roles ?? []).some((r) => r === 'employee' || r === 'committee' || r === 'admin');

  // ★ server-side pagination จริง (getMyKaizenListPage ใช้ .range() ของ Supabase ไม่ใช่ fetch
  // ทั้งหมดมา slice ฝั่ง client) — counts ต่อ filter chip มาจาก query แยกที่นับอย่างเดียว
  // (head:true ไม่ดึงข้อมูลจริง) ไม่ใช่นับจากลิสต์ที่โหลดมาทั้งหมด (Spec.md §4.8 backlog Low #3)
  const state = { filter: 'all', deletingId: null, rows: [], total: 0, hasMore: false, page: 0, loadingMore: false, counts: null };

  try {
    state.counts = await getMyKaizenStatusCounts(session.user.id);
    await loadPage(0, true);
  } catch (err) {
    container.innerHTML = pageHeader({ title: t('nav_kaizen') }) + `<div class="page-body">${stateCard({
      kind: 'error',
      title: 'โหลดข้อมูลไม่สำเร็จ',
      body: escapeHtml(translateError(err.message) || err.message || 'สัญญาณในไลน์ผลิตไม่นิ่งเป็นสาเหตุที่พบบ่อย'),
      actions: '<button type="button" onclick="location.reload()">โหลดใหม่</button>',
    })}</div>`;
    return;
  }

  async function loadPage(page, replace) {
    const filterDef = FILTERS.find((f) => f.key === state.filter) ?? FILTERS[0];
    const { rows, total, hasMore } = await getMyKaizenListPage({
      userId: session.user.id, page, pageSize: PAGE_SIZE, statuses: filterDef.statuses,
    });
    state.rows = replace ? rows : [...state.rows, ...rows];
    // ★ จัดกลุ่มตามความสำคัญเฉพาะภายในชุดที่โหลดมาแล้ว (ไม่ใช่ทั้งฐานข้อมูล) — คงพฤติกรรมเดิม
    // ที่ "ต้องแก้ไข" ลอยขึ้นบนสุดของสิ่งที่เห็นอยู่ โดยไม่ต้องดึงทั้งหมดมาเรียงฝั่ง client
    state.rows.sort((a, b) => (SORT_PRIORITY[a.Status] ?? 9) - (SORT_PRIORITY[b.Status] ?? 9));
    state.total = total;
    state.hasMore = hasMore;
    state.page = page;
  }

  renderPage();

  function renderPage() {
    const chips = FILTERS.map((f) => {
      const count = state.counts?.[f.key] ?? 0;
      return `<button type="button" class="filter-chip ${state.filter === f.key ? 'is-on' : ''}" data-filter="${f.key}">${f.label} ${count}</button>`;
    }).join('');

    const rows = state.rows.map((k) => {
      const today = todayInSystemTz();
      // ★ เทียบ calendar date ล้วนๆ (ไม่ผ่าน new Date() เทียบ now) กัน bug ที่วันครบกำหนดเอง
      // ถูกนับว่า "เลยกำหนด" ไปแล้วตั้งแต่เช้ามืด (Spec.md §4.8 backlog Low #2)
      const overdue = k.NextFollowUpDate && !k.IsCompleted && k.NextFollowUpDate < today;
      const overdueDays = overdue ? daysBetweenDateStrings(today, k.NextFollowUpDate) : 0;
      const followUpCell = !k.NextFollowUpDate
        ? '<span class="muted">—</span>'
        : overdue
          ? `<span style="color:var(--danger);font-weight:600">เลยกำหนด ${overdueDays} วัน</span>`
          : thaiDate(k.NextFollowUpDate);
      const ctx = contextLine(k);
      return `
        <tr ${k.Status === 'need_revision' ? 'class="is-attention"' : ''}>
          <td class="kl-title">
            <a href="#/kaizen/${k.Id}" class="cell-title" style="text-decoration:none;display:block">${escapeHtml(k.Title)}</a>
            <span class="cell-sub">${k.Code ? `<span class="mono">${escapeHtml(k.Code)}</span>` : '<span class="muted">ยังไม่มีรหัสจนกดส่ง</span>'}${ctx ? ` · ${ctx}` : ''}</span>
          </td>
          <td class="kl-badge">${statusBadge(k.Status)}</td>
          <td class="kl-date">${followUpCell}</td>
          <td class="kl-actions">${k.Status === 'draft' ? `<button type="button" class="secondary is-sm" data-delete="${k.Id}" ${state.deletingId === k.Id ? 'disabled' : ''}>${state.deletingId === k.Id ? t('common_loading') : 'ลบร่าง'}</button>` : ''}</td>
        </tr>
      `;
    }).join('');

    container.innerHTML = `
      ${pageHeader({ title: t('nav_kaizen') })}
      <div class="page-body">
        <div class="filter-bar" style="margin-bottom:16px">${chips}</div>
        ${state.total === 0
          ? emptyState({
              title: state.filter === 'all' ? t('empty_my_kaizen') : 'ไม่มีโครงการในตัวกรองนี้',
              // ★ ไม่มีปุ่มสร้างโครงการซ้ำที่นี่ตั้งใจ — จุดเดียวที่ใช้เสนอ KAIZEN ใหม่ได้คือปุ่ม "+"
              // กลาง bottom tab bar (js/app.js) ตามกติกา CLAUDE.md (Spec.md §4.8 finding M2)
              body: state.filter === 'all' && canCreate ? 'กดปุ่ม + ด้านล่างเพื่อเริ่มเสนอโครงการแรกของคุณ' : undefined,
            })
          : `<div class="panel is-scroll">
                <table class="data-table kl-table">
                  <thead><tr><th>โครงการ</th><th>สถานะ</th><th>ติดตามครั้งถัดไป</th><th></th></tr></thead>
                  <tbody>${rows}</tbody>
                </table>
              </div>
              ${state.hasMore ? `<div style="text-align:center;margin-top:var(--sp-5)"><button type="button" class="secondary" id="btn-load-more" ${state.loadingMore ? 'disabled' : ''}>${state.loadingMore ? t('common_loading') : `โหลดเพิ่ม (เหลืออีก ${state.total - state.rows.length})`}</button></div>` : ''}`}
      </div>
    `;

    container.querySelectorAll('[data-filter]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        if (state.filter === btn.dataset.filter) return;
        state.filter = btn.dataset.filter;
        await loadPage(0, true);
        renderPage();
      });
    });
    container.querySelectorAll('[data-delete]').forEach((btn) => {
      btn.addEventListener('click', () => onDelete(btn.dataset.delete));
    });
    document.getElementById('btn-load-more')?.addEventListener('click', onLoadMore);
  }

  async function onLoadMore() {
    state.loadingMore = true; renderPage();
    try {
      await loadPage(state.page + 1, false);
    } catch (err) {
      alert(translateError(err.message) || err.message || t('common_error_generic'));
    } finally {
      state.loadingMore = false;
      renderPage();
    }
  }

  async function onDelete(id) {
    if (!confirm('ลบร่างนี้ทิ้งถาวร? ข้อมูลและรูปที่แนบไว้จะหายไปทั้งหมด กู้คืนไม่ได้')) return;
    state.deletingId = id; renderPage();
    try {
      await deleteKaizen(id);
      state.rows = state.rows.filter((k) => k.Id !== id);
      state.total = Math.max(0, state.total - 1);
      if (state.counts) {
        state.counts.all = Math.max(0, (state.counts.all ?? 1) - 1);
        state.counts.draft = Math.max(0, (state.counts.draft ?? 1) - 1);
      }
    } catch (err) {
      alert(translateError(err.message) || err.message || t('common_error_generic'));
    } finally {
      state.deletingId = null;
      renderPage();
    }
  }
}
