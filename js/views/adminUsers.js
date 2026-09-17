// js/views/adminUsers.js — รออนุมัติแยกขึ้นบน + ตาราง 5 คอลัมน์ (MIGRATION.md ข้อ 12)
import { getAllProfiles, getProfilesPage, updateProfile, getMasterData, getAvatarSignedUrl } from '../api.js?v=20260911z7';
import { t, tf } from '../i18n.js?v=20260911z7';
import { escapeHtml, translateError, pageHeader, skeletonRows, stateCard, initials, roleLabel, thaiDate, hydrateAvatars, masterLabel } from '../ui.js?v=20260911z7';
import { ROLES } from '../constants.js?v=20260911z7';

const PAGE_SIZE = 20;

function escapeAttr(s) {
  return escapeHtml(s).replace(/"/g, '&quot;');
}

export async function render(container, params, session) {
  document.title = `${t('nav_admin_users')} · ${t('appName')}`;
  container.innerHTML = `<div class="page-body">${skeletonRows(4)}</div>`;

  // ★ "รออนุมัติ" ยังใช้ getAllProfiles() เดิม (ปกติเป็นชุดเล็ก ต้องเห็นครบเพื่ออนุมัติ) ส่วนตาราง
  // "บัญชีที่เปิดใช้งานแล้ว" ซึ่งอาจยาวได้ (ทุกพนักงานที่ active) เปลี่ยนไปใช้ getProfilesPage()
  // ที่ query ด้วย .range()/count จริงจากฝั่ง server ไม่ใช่ fetch ทั้งหมดมา slice ฝั่ง client
  // (Spec.md §4.8 backlog Low #3)
  let allProfiles;
  let departments;
  let plants;
  let committeeRoles;
  try {
    [allProfiles, departments, plants, committeeRoles] = await Promise.all([
      getAllProfiles(),
      getMasterData('department'),
      getMasterData('plant'),
      getMasterData('committee_role'),
    ]);
  } catch (err) {
    container.innerHTML = `<div class="page-body">${stateCard({
      kind: 'error', title: t('error_load_failed'), body: escapeHtml(translateError(err.message) || err.message || t('common_error_generic')),
      actions: `<button type="button" onclick="location.reload()">${t('state_retry')}</button>`,
    })}</div>`;
    return;
  }

  const deptLabel = (code) => masterLabel(departments, code);
  const state = {
    dirtyRows: new Set(), savingId: null, errorById: {}, filter: 'all', search: '',
    rows: [], total: 0, hasMore: false, page: 0, loading: true, loadingMore: false,
    expandedRows: new Set(),
  };

  async function loadPage(page, replace) {
    const { rows, total, hasMore } = await getProfilesPage({
      page, pageSize: PAGE_SIZE, search: state.search, roleFilter: state.filter, activeOnly: true,
    });
    state.rows = replace ? rows : [...state.rows, ...rows];
    state.total = total;
    state.hasMore = hasMore;
    state.page = page;
  }

  try {
    await loadPage(0, true);
  } catch (err) {
    container.innerHTML = `<div class="page-body">${stateCard({
      kind: 'error', title: t('error_load_failed'), body: escapeHtml(translateError(err.message) || err.message || t('common_error_generic')),
      actions: `<button type="button" onclick="location.reload()">${t('state_retry')}</button>`,
    })}</div>`;
    return;
  }
  state.loading = false;

  renderShell();

  function renderShell() {
    const pending = allProfiles.filter((p) => !p.IsActive);

    const pendingCards = pending.map((p) => `
      <div class="task-row is-urgent">
        <div class="task-main" style="display:flex;align-items:center;gap:12px">
          <div class="avatar"${p.AvatarPath ? ` data-avatar-path="${escapeAttr(p.AvatarPath)}"` : ''}>${escapeHtml(initials(p.FullName))}</div>
          <div>
            <div class="task-title">${escapeHtml(p.FullName)}</div>
            <div class="task-meta mono">${escapeHtml(p.EmployeeId)} · ${escapeHtml(p.Email)}</div>
            <div class="task-meta">${escapeHtml(deptLabel(p.Department))} · ${escapeHtml(tf('au_registered_on', { date: thaiDate(p.CreatedAt) }))}</div>
          </div>
        </div>
        <button type="button" data-activate="${p.Id}" ${state.savingId === p.Id ? 'disabled' : ''}>${state.savingId === p.Id ? t('common_loading') : t('au_activate_btn')}</button>
      </div>
    `).join('');

    container.innerHTML = `
      ${pageHeader({ title: t('nav_admin_users') })}
      <div class="page-body">
        ${pending.length > 0 ? `
          <div class="section-head"><h2>${t('au_pending_heading')}</h2><span class="section-note">${escapeHtml(tf('au_people_count', { n: pending.length }))}</span></div>
          <div class="task-list" style="margin-bottom:var(--sp-6)">${pendingCards}</div>
        ` : ''}

        <div class="section-head"><h2>${t('au_active_accounts_heading')}</h2><span class="section-note" id="active-count">${escapeHtml(tf('au_people_count', { n: state.total }))}</span></div>
        <div class="hstack" style="margin-bottom:var(--sp-4)">
          <input type="text" id="f-search" class="field-narrow" placeholder="${escapeAttr(t('au_search_placeholder'))}" value="${escapeAttr(state.search)}" />
          <div class="filter-bar">
            <button type="button" class="filter-chip ${state.filter === 'all' ? 'is-on' : ''}" data-filter="all">${t('kzlist_filter_all')}</button>
            <button type="button" class="filter-chip ${state.filter === 'committee' ? 'is-on' : ''}" data-filter="committee">${escapeHtml(roleLabel('committee'))}</button>
            <button type="button" class="filter-chip ${state.filter === 'admin' ? 'is-on' : ''}" data-filter="admin">${escapeHtml(roleLabel('admin'))}</button>
            <button type="button" class="filter-chip ${state.filter === 'employee' ? 'is-on' : ''}" data-filter="employee">${escapeHtml(roleLabel('employee'))}</button>
          </div>
        </div>
        <div class="panel is-scroll">
          <table class="data-table is-wide is-collapsible">
            <thead><tr><th>${t('au_col_employee')}</th><th>${t('apd_col_department')}</th><th>${t('apd_col_plant')}</th><th>${t('au_col_permissions')}</th><th></th></tr></thead>
            <tbody id="users-tbody"></tbody>
          </table>
        </div>
        ${state.hasMore ? `<div style="text-align:center;margin-top:var(--sp-5)"><button type="button" class="secondary" id="btn-load-more" ${state.loadingMore ? 'disabled' : ''}>${state.loadingMore ? t('common_loading') : escapeHtml(tf('kzlist_load_more', { n: state.total - state.rows.length }))}</button></div>` : ''}
      </div>
    `;

    let searchDebounce = null;
    document.getElementById('f-search').addEventListener('input', (e) => {
      state.search = e.target.value;
      clearTimeout(searchDebounce);
      // ★ debounce กันยิง query ทุกครั้งที่กดปุ่ม — ค้นหาต้องไป server จริงแล้ว (ไม่ใช่กรอง
      // ฝั่ง client จากลิสต์ที่โหลดมาทั้งหมดเหมือนเดิม) จึงต้องรอผู้ใช้พิมพ์นิ่งก่อนค่อยยิง
      searchDebounce = setTimeout(async () => {
        await loadPage(0, true);
        renderRows();
        document.getElementById('active-count').textContent = tf('au_people_count', { n: state.total });
        renderLoadMoreArea();
      }, 300);
    });
    container.querySelectorAll('[data-filter]').forEach((btn) => btn.addEventListener('click', async () => {
      if (state.filter === btn.dataset.filter) return;
      state.filter = btn.dataset.filter;
      await loadPage(0, true);
      renderShell();
    }));
    container.querySelectorAll('[data-activate]').forEach((btn) => btn.addEventListener('click', () => onActivate(btn.dataset.activate)));
    document.getElementById('btn-load-more')?.addEventListener('click', onLoadMore);

    renderRows();
  }

  function renderLoadMoreArea() {
    const body = container.querySelector('.page-body');
    const existing = document.getElementById('btn-load-more')?.parentElement;
    existing?.remove();
    if (state.hasMore) {
      body.insertAdjacentHTML('beforeend', `<div style="text-align:center;margin-top:var(--sp-5)"><button type="button" class="secondary" id="btn-load-more" ${state.loadingMore ? 'disabled' : ''}>${state.loadingMore ? t('common_loading') : escapeHtml(tf('kzlist_load_more', { n: state.total - state.rows.length }))}</button></div>`);
      document.getElementById('btn-load-more')?.addEventListener('click', onLoadMore);
    }
  }

  async function onLoadMore() {
    state.loadingMore = true; renderLoadMoreArea();
    try {
      await loadPage(state.page + 1, false);
      renderRows();
    } catch (err) {
      alert(translateError(err.message) || err.message || t('common_error_generic'));
    } finally {
      state.loadingMore = false;
      renderLoadMoreArea();
    }
  }

  function renderRows() {
    const tbody = document.getElementById('users-tbody');
    tbody.innerHTML = state.rows.map((p) => {
      const dirty = state.dirtyRows.has(p.Id);
      const expanded = state.expandedRows.has(p.Id);
      const rowClass = [dirty && 'is-dirty', expanded && 'is-expanded'].filter(Boolean).join(' ');
      return `
        <tr data-row="${p.Id}" ${rowClass ? `class="${rowClass}"` : ''}>
          <td class="au-row-summary" data-toggle-row="${p.Id}" role="button" tabindex="0" aria-expanded="${expanded ? 'true' : 'false'}">
            <div class="hstack">
              <div class="avatar is-sm is-quiet"${p.AvatarPath ? ` data-avatar-path="${escapeAttr(p.AvatarPath)}"` : ''}>${escapeHtml(initials(p.FullName))}</div>
              <div style="min-width:0">
                <div class="cell-title">${escapeHtml(p.FullName)} <span class="mono" style="font-weight:400;color:var(--muted-2)">${escapeHtml(p.EmployeeId)}</span></div>
                <div class="mono cell-sub au-row-email">${escapeHtml(p.Email)}</div>
              </div>
              <span class="au-row-chevron" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg></span>
            </div>
          </td>
          <td><select class="f-department">${departments.map((d) => `<option value="${d.Code}" ${d.Code === p.Department ? 'selected' : ''}>${escapeHtml(masterLabel(departments, d.Code))}</option>`).join('')}</select></td>
          <td><select class="f-plant">${plants.map((pl) => `<option value="${pl.Code}" ${pl.Code === p.Plant ? 'selected' : ''}>${escapeHtml(masterLabel(plants, pl.Code))}</option>`).join('')}</select></td>
          <td>
            <div class="chip-set" style="gap:var(--sp-2)">
              ${ROLES.map((r) => {
                // ★ กันแอดมินถอด role admin ของตัวเอง — ปุ่ม "ปิดใช้งาน" กันไว้แล้ว (บรรทัดข้างล่าง)
                // แต่ chip นี้ไม่เคยกันเลย ทำให้แก้ role ตัวเองจนไม่เหลือ admin แล้วบันทึกได้ปกติ
                // ล็อกตัวเองออกจาก #/admin/* ทันที ไม่มีทางกู้คืนในแอป (Spec.md §4.8 finding M9)
                const isSelfAdminChip = r === 'admin' && p.Id === session.user.id;
                return `<button type="button" class="chip is-sm ${p.Roles?.includes(r) ? 'is-on' : ''}" data-role-chip="${r}" aria-pressed="${p.Roles?.includes(r)}" ${isSelfAdminChip ? `disabled title="${escapeAttr(t('au_cannot_remove_own_admin'))}"` : ''}>${escapeHtml(roleLabel(r))}</button>`;
              }).join('')}
            </div>
            <select class="f-committee-role" style="margin-top:var(--sp-2)">
              <option value="">${t('au_not_committee_option')}</option>
              ${committeeRoles.map((r) => `<option value="${r.Code}" ${r.Code === p.CommitteeRole ? 'selected' : ''}>${escapeHtml(masterLabel(committeeRoles, r.Code))}</option>`).join('')}
            </select>
            ${state.errorById[p.Id] ? `<div class="error" style="margin-top:var(--sp-2)">${escapeHtml(state.errorById[p.Id])}</div>` : ''}
          </td>
          <td>
            ${dirty
              ? `<button type="button" class="btn-save-user is-sm" data-id="${p.Id}" ${state.savingId === p.Id ? 'disabled' : ''}>${state.savingId === p.Id ? t('common_loading') : t('common_save')}</button>`
              : p.Id === session.user.id
                ? ''
                : `<button type="button" class="secondary is-sm" data-deactivate="${p.Id}" ${state.savingId === p.Id ? 'disabled' : ''}>${state.savingId === p.Id ? t('common_loading') : t('au_deactivate_btn')}</button>`}
          </td>
        </tr>
      `;
    }).join('');

    tbody.querySelectorAll('tr[data-row]').forEach((row) => {
      const id = row.dataset.row;
      // ★ ห้ามเรียก renderRows() เต็มรูปแบบตรงนี้ — มันจะสร้าง select/chip ใหม่จาก
      //   p.Department/p.Plant/p.Roles เดิม (ยังไม่ได้ save) ทำให้ค่าที่เพิ่งแก้ไขหายไปทันที
      //   (revert เอง) แค่ mark dirty + โผล่ปุ่ม Save โดยไม่แตะ DOM ส่วน select/chip
      const markDirty = () => {
        if (state.dirtyRows.has(id)) return;
        state.dirtyRows.add(id);
        row.classList.add('is-dirty');
        const lastCell = row.lastElementChild;
        lastCell.innerHTML = `<button type="button" class="btn-save-user is-sm" data-id="${id}">${t('common_save')}</button>`;
        lastCell.querySelector('.btn-save-user').addEventListener('click', () => onSave(id));
      };
      row.querySelectorAll('select').forEach((el) => el.addEventListener('change', markDirty));
      row.querySelectorAll('[data-role-chip]').forEach((btn) => btn.addEventListener('click', () => {
        btn.classList.toggle('is-on');
        btn.setAttribute('aria-pressed', btn.classList.contains('is-on') ? 'true' : 'false');
        markDirty();
      }));
      // ★ หุบ/กางรายละเอียด (มือถือเท่านั้น — ดู .data-table.is-collapsible ใน style.css) —
      //   toggle class ตรงๆ ไม่เรียก renderRows() ด้วยเหตุผลเดียวกับ markDirty ด้านบน (กันค่าที่
      //   แก้ยังไม่ save หายจาก select/chip ที่ยังไม่ได้กด save)
      const summary = row.querySelector('.au-row-summary');
      const toggleExpand = () => {
        const expanded = state.expandedRows.has(id);
        if (expanded) state.expandedRows.delete(id); else state.expandedRows.add(id);
        row.classList.toggle('is-expanded', !expanded);
        summary.setAttribute('aria-expanded', String(!expanded));
      };
      summary.addEventListener('click', toggleExpand);
      summary.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleExpand(); }
      });
    });
    tbody.querySelectorAll('.btn-save-user').forEach((btn) => btn.addEventListener('click', () => onSave(btn.dataset.id)));
    tbody.querySelectorAll('[data-deactivate]').forEach((btn) => btn.addEventListener('click', () => onDeactivate(btn.dataset.deactivate)));

    hydrateAvatars(container, getAvatarSignedUrl); // ครอบทั้ง container เผื่อการ์ด "รออนุมัติ" ด้วย
  }

  async function onDeactivate(id) {
    const p = state.rows.find((row) => row.Id === id);
    if (!confirm(tf('au_confirm_deactivate', { name: p?.FullName ?? '' }))) return;
    state.savingId = id; renderRows();
    try {
      await updateProfile(id, { IsActive: false });
      // ★ deactivate แล้วแถวนี้ไม่เข้าเงื่อนไข activeOnly:true ของ getProfilesPage() อีกต่อไป —
      // ตัดออกจากลิสต์ที่โหลดไว้ตรงๆ แทนการ refetch ทั้งหน้า (เร็วกว่า, total ปรับตามจริง)
      state.rows = state.rows.filter((row) => row.Id !== id);
      state.total = Math.max(0, state.total - 1);
      state.savingId = null;
      renderShell();
    } catch (err) {
      state.errorById[id] = translateError(err.message) || err.message || t('common_error_generic');
      state.savingId = null;
      renderRows();
    }
  }

  async function onActivate(id) {
    state.savingId = id; renderShell();
    try {
      // ★ ผู้ใช้ที่เคยถูก "ปิดใช้งาน" จะโผล่กลับมาที่ลิสต์นี้เหมือนคนสมัครใหม่ (ทั้งคู่คือ
      //   is_active=false) แต่ต่างจากคนสมัครใหม่ตรงที่มี Roles/CommitteeRole เดิมอยู่แล้ว —
      //   ต้อง fallback เป็น ['employee'] เฉพาะตอนยังไม่มี role เลย ไม่งั้นจะรีเซ็ต role เดิมทิ้ง
      const existing = allProfiles.find((p) => p.Id === id);
      const roles = existing?.Roles?.length ? existing.Roles : ['employee'];
      const updated = await updateProfile(id, { IsActive: true, Roles: roles });
      const idx = allProfiles.findIndex((p) => p.Id === id);
      allProfiles[idx] = updated;
      // ★ เพิ่งเปิดใช้งาน แถวนี้เข้าเงื่อนไขตาราง "เปิดใช้งานแล้ว" ทันที — refetch หน้าปัจจุบัน
      // ใหม่เพื่อให้ total/rows ตรงกับ server จริง (ตำแหน่งใน sort อาจเปลี่ยนได้)
      await loadPage(0, true);
    } catch (err) {
      state.errorById[id] = translateError(err.message) || err.message || t('common_error_generic');
    } finally {
      state.savingId = null;
      renderShell();
    }
  }

  async function onSave(id) {
    const row = document.querySelector(`tr[data-row="${id}"]`);
    const department = row.querySelector('.f-department').value;
    const plant = row.querySelector('.f-plant').value;
    const committeeRole = row.querySelector('.f-committee-role').value || null;
    const roles = [...row.querySelectorAll('[data-role-chip].is-on')].map((c) => c.dataset.roleChip);

    if (roles.length === 0) {
      state.errorById[id] = t('au_err_need_one_role');
      renderRows();
      return;
    }
    // ★ กันซ้ำอีกชั้น (chip ตัวเองถูก disable ไว้แล้วด้านบน แต่กันไว้เผื่อ DOM ถูกแก้ทางอื่น)
    if (id === session.user.id && !roles.includes('admin')) {
      state.errorById[id] = t('au_cannot_remove_own_admin');
      renderRows();
      return;
    }

    state.savingId = id; state.errorById[id] = ''; renderRows();
    try {
      const updated = await updateProfile(id, { Department: department, Plant: plant, CommitteeRole: committeeRole, Roles: roles });
      const idx = state.rows.findIndex((p) => p.Id === id);
      if (idx >= 0) state.rows[idx] = updated;
      state.dirtyRows.delete(id);
    } catch (err) {
      state.errorById[id] = translateError(err.message) || err.message || t('common_error_generic');
    } finally {
      state.savingId = null;
      renderRows();
    }
  }
}
