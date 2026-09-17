// js/views/adminPeriods.js — รายการรอบประเมิน + สร้างรอบใหม่ (MIGRATION.md ข้อ 10)
import {
  getPeriodsPage, createPeriod, getKaizenByPeriod, getKaizenCountByPeriod, deletePeriod, getResults, getAllProfiles,
  getQuarterlyAwards, createQuarterlyAward, deleteQuarterlyAward,
} from '../api.js?v=20260911z5';
import { t } from '../i18n.js?v=20260911z5';
import { navigate } from '../router.js?v=20260911z5';
import { escapeHtml, translateError, pageHeader, skeletonRows, stateCard, emptyState, statusBadge, thaiDate, parseDatetimeLocalInSystemTz } from '../ui.js?v=20260911z5';
import { SYSTEM_TIMEZONE_LABEL } from '../constants.js?v=20260911z5';

const PAGE_SIZE = 20;

export async function render(container) {
  document.title = `${t('nav_admin_periods')} · ${t('appName')}`;
  container.innerHTML = `<div class="page-body">${skeletonRows(3)}</div>`;

  let profiles = [];
  let quarterlyAwards = [];
  try {
    [profiles, quarterlyAwards] = await Promise.all([getAllProfiles(), getQuarterlyAwards()]);
  } catch (err) {
    container.innerHTML = `<div class="page-body">${stateCard({
      kind: 'error', title: 'โหลดข้อมูลไม่สำเร็จ', body: escapeHtml(translateError(err.message) || err.message || t('common_error_generic')),
      actions: '<button type="button" onclick="location.reload()">โหลดใหม่</button>',
    })}</div>`;
    return;
  }
  const profileById = new Map(profiles.map((p) => [p.Id, p]));

  // ★ server-side pagination จริงสำหรับตาราง "รอบทั้งหมด" (getPeriodsPage ใช้ .range()) — คอลัมน์
  // "โครงการ" นับแบบ head:true เฉพาะรอบที่กำลังแสดงอยู่หน้าปัจจุบันเท่านั้น ไม่ fetch ลิสต์เต็มของ
  // ทุกรอบล่วงหน้าเหมือนเดิม (Spec.md §4.8 backlog Low #3)
  const state = {
    periods: [], periodsTotal: 0, periodsHasMore: false, periodsPage: 0, loadingMorePeriods: false,
    counts: new Map(),
    // ★ kaizen list เต็มต่อรอบ (ใช้ resolve ชื่อ/เจ้าของโครงการตอนเปรียบเทียบ Top 3 เท่านั้น) โหลด
    // แบบ lazy เฉพาะรอบที่ถูกติ๊กเลือกจริง ไม่ใช่ทุกรอบเหมือนเดิม (cache กันโหลดซ้ำถ้าเลือกซ้ำ)
    kaizenByPeriod: new Map(),
    error: {}, saving: false, deletingId: null,
    selectedForCompare: new Set(), comparing: false, compareError: '', compareTop3: null,
    publishLabel: '', publishing: false, publishError: '', deletingAwardId: null,
  };

  async function loadCountsFor(periodIds) {
    const missing = periodIds.filter((id) => !state.counts.has(id));
    if (missing.length === 0) return;
    const values = await Promise.all(missing.map((id) => getKaizenCountByPeriod(id).catch(() => null)));
    missing.forEach((id, i) => { if (values[i] !== null) state.counts.set(id, values[i]); });
  }

  async function loadPeriodsPage(page, replace) {
    const { rows, total, hasMore } = await getPeriodsPage({ page, pageSize: PAGE_SIZE });
    state.periods = replace ? rows : [...state.periods, ...rows];
    state.periodsTotal = total;
    state.periodsHasMore = hasMore;
    state.periodsPage = page;
    await loadCountsFor(rows.map((p) => p.Id));
  }

  try {
    await loadPeriodsPage(0, true);
  } catch (err) {
    container.innerHTML = `<div class="page-body">${stateCard({
      kind: 'error', title: 'โหลดข้อมูลไม่สำเร็จ', body: escapeHtml(translateError(err.message) || err.message || t('common_error_generic')),
      actions: '<button type="button" onclick="location.reload()">โหลดใหม่</button>',
    })}</div>`;
    return;
  }

  renderPage();

  function renderPage() {
    const rows = state.periods.map((p) => {
      const canCompare = p.Status === 'published' || p.Status === 'closed';
      return `
      <tr>
        <td>${canCompare ? `<input type="checkbox" data-compare-period="${p.Id}" ${state.selectedForCompare.has(p.Id) ? 'checked' : ''} />` : ''}</td>
        <td class="mono">${escapeHtml(p.Code)}</td>
        <td><a href="#/admin/periods/${p.Id}">${escapeHtml(p.NameTh)}</a></td>
        <td>${statusBadge(p.Status)}</td>
        <td>${thaiDate(p.PeriodStart)} – ${thaiDate(p.PeriodEnd)}</td>
        <td class="is-num">${state.counts.has(p.Id) ? state.counts.get(p.Id) : '—'}</td>
        <td>${p.Status === 'draft' ? `<button type="button" class="secondary is-sm" data-delete="${p.Id}" ${state.deletingId === p.Id ? 'disabled' : ''}>${state.deletingId === p.Id ? t('common_loading') : 'ลบ'}</button>` : ''}</td>
      </tr>
    `;
    }).join('');

    const top3Html = state.compareTop3 ? `
      ${state.compareTop3.length === 0 ? `<p class="muted" style="margin-top:var(--sp-4)">ไม่มีโครงการที่มีสิทธิ์ติดอันดับในรอบที่เลือก (โครงการยังไม่เสร็จไม่นับ)</p>` : `
        <div class="panel is-scroll" style="margin-top:var(--sp-4)">
          <table class="data-table">
            <thead><tr><th>อันดับ</th><th>ชื่อ-นามสกุล</th><th>โครงการ</th><th>รอบ</th><th class="is-num">คะแนน / 100</th></tr></thead>
            <tbody>
              ${state.compareTop3.map((r, i) => `
                <tr>
                  <td><span class="rank-num is-top">${i + 1}</span></td>
                  <td>${escapeHtml(r.ownerName ?? '—')}<div class="mono cell-sub">${escapeHtml(r.ownerEmployeeId ?? '—')}</div></td>
                  <td>${escapeHtml(r.kaizenTitle ?? '—')}<div class="mono cell-sub">${escapeHtml(r.kaizenCode ?? '—')}</div></td>
                  <td class="mono">${escapeHtml(r.periodCode ?? '—')}</td>
                  <td class="is-num">${Number(r.WeightedScore).toFixed(2)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
        <div class="hstack" style="margin-top:var(--sp-4)">
          <input type="text" id="f-publish-label" class="field-narrow" placeholder="ชื่อประกาศ เช่น ไตรมาส 4/2569" value="${escapeHtml(state.publishLabel)}" />
          <button type="button" id="btn-publish-award" ${state.publishing ? 'disabled' : ''}>${state.publishing ? t('common_loading') : 'ประกาศผลรางวัลนี้ (ขึ้น banner บน dashboard ทุกคน)'}</button>
        </div>
        <div id="publish-error"></div>
      `}
    ` : '';

    const awardsHtml = quarterlyAwards.length > 0 ? `
      <div class="section-head" style="margin-top:var(--sp-6)"><h2>ประวัติรางวัลที่ประกาศแล้ว</h2></div>
      <div class="row-list">
        ${quarterlyAwards.map((a) => `
          <div class="row-item">
            <div class="row-main">
              <div class="row-title">${escapeHtml(a.Label)}</div>
              <div class="row-sub">ประกาศเมื่อ ${thaiDate(a.PublishedAt)} · ${a.Winners.length} อันดับ</div>
            </div>
            <div class="row-end">
              <button type="button" class="secondary is-sm" data-delete-award="${a.Id}" ${state.deletingAwardId === a.Id ? 'disabled' : ''}>${state.deletingAwardId === a.Id ? t('common_loading') : 'ลบประกาศ'}</button>
            </div>
          </div>
        `).join('')}
      </div>
    ` : '';

    container.innerHTML = `
      ${pageHeader({ title: t('nav_admin_periods') })}
      <div class="page-body">
        <div class="section-head"><h2>รอบทั้งหมด</h2><span class="section-note">${state.periodsTotal} รอบ</span></div>
        ${state.periodsTotal === 0 ? emptyState({ title: t('empty_periods') }) : `
          <div class="panel is-scroll periods-table">
            <table class="data-table">
              <thead><tr><th></th><th>รหัส</th><th>ชื่อรอบ</th><th>สถานะ</th><th>ช่วงเวลา</th><th class="is-num">โครงการ</th><th></th></tr></thead>
              <tbody>${rows}</tbody>
            </table>
          </div>
          ${state.periodsHasMore ? `<div style="text-align:center;margin-top:var(--sp-4)"><button type="button" class="secondary" id="btn-load-more-periods" ${state.loadingMorePeriods ? 'disabled' : ''}>${state.loadingMorePeriods ? t('common_loading') : `โหลดเพิ่ม (เหลืออีก ${state.periodsTotal - state.periods.length})`}</button></div>` : ''}
        `}

        <div class="section-head" style="margin-top:var(--sp-6)"><h2>เปรียบเทียบ Top 3 ข้ามรอบ (รางวัลใหญ่)</h2></div>
        <p class="field-hint">ติ๊กเลือกรอบที่ประกาศผล/ปิดแล้วจากตารางด้านบน (เช่น 3 รอบของไตรมาสเดียวกัน) แล้วกดเปรียบเทียบ — รวมคะแนนทุกโครงการจากรอบที่เลือก เรียงคะแนนสูงสุด 3 อันดับ นับเฉพาะโครงการที่เสร็จแล้วเท่านั้น (รอบเก่าก่อน 2026-09-11 ยังไม่มีการกรองนี้)</p>
        <div id="compare-error"></div>
        <button type="button" id="btn-compare" style="margin-top:var(--sp-4)" ${state.comparing ? 'disabled' : ''}>${state.comparing ? t('common_loading') : `เปรียบเทียบ (${state.selectedForCompare.size} รอบที่เลือก)`}</button>
        ${top3Html}
        ${awardsHtml}

        <div style="max-width:480px;margin-top:var(--sp-6)">
          <div class="section-head"><h2>สร้างรอบใหม่</h2></div>
          <p class="field-hint">รอบใหม่เริ่มที่สถานะร่างเสมอ — ตั้งน้ำหนักกรรมการแล้วค่อยเปิดรอบทีหลังได้</p>
          <label style="margin-top:var(--sp-5)">รหัสรอบ (เช่น 2026-11)
            <input type="text" id="f-code" />
            <span class="field-hint">ใช้ตั้งรหัสโครงการ เช่น KZN-202611-0001</span>
          </label>
          <label style="margin-top:var(--sp-5)">ชื่อรอบ (TH)<input type="text" id="f-name-th" /></label>
          <label style="margin-top:var(--sp-5)">ชื่อรอบ (EN)<input type="text" id="f-name-en" /></label>
          <label style="margin-top:var(--sp-5)">วันเริ่มรอบ<input type="date" id="f-start" /></label>
          <label style="margin-top:var(--sp-5)">วันสิ้นสุดรอบ<input type="date" id="f-end" /></label>
          <label style="margin-top:var(--sp-5)">Deadline ส่งผลงาน (${escapeHtml(SYSTEM_TIMEZONE_LABEL)})<input type="datetime-local" id="f-deadline" /></label>
          <div id="create-error"></div>
          <button type="button" id="btn-create" style="margin-top:var(--sp-5)" ${state.saving ? 'disabled' : ''}>${state.saving ? t('common_loading') : 'สร้างรอบเป็นร่าง'}</button>
        </div>
      </div>
    `;

    if (state.error.msg) document.getElementById('create-error').innerHTML = `<div class="error">${escapeHtml(state.error.msg)}</div>`;
    if (state.compareError) document.getElementById('compare-error').innerHTML = `<div class="error">${escapeHtml(state.compareError)}</div>`;
    if (state.publishError) document.getElementById('publish-error').innerHTML = `<div class="error">${escapeHtml(state.publishError)}</div>`;
    document.getElementById('btn-create').addEventListener('click', onCreate);
    container.querySelectorAll('[data-delete]').forEach((btn) => {
      btn.addEventListener('click', () => onDelete(btn.dataset.delete));
    });
    container.querySelectorAll('[data-compare-period]').forEach((el) => {
      el.addEventListener('change', () => {
        if (el.checked) state.selectedForCompare.add(el.dataset.comparePeriod);
        else state.selectedForCompare.delete(el.dataset.comparePeriod);
        state.compareTop3 = null;
        renderPage();
      });
    });
    document.getElementById('btn-compare').addEventListener('click', onCompare);
    document.getElementById('f-publish-label')?.addEventListener('input', (e) => { state.publishLabel = e.target.value; });
    document.getElementById('btn-publish-award')?.addEventListener('click', onPublishAward);
    container.querySelectorAll('[data-delete-award]').forEach((btn) => {
      btn.addEventListener('click', () => onDeleteAward(btn.dataset.deleteAward));
    });
    document.getElementById('btn-load-more-periods')?.addEventListener('click', onLoadMorePeriods);
  }

  async function onLoadMorePeriods() {
    state.loadingMorePeriods = true; renderPage();
    try {
      await loadPeriodsPage(state.periodsPage + 1, false);
    } catch (err) {
      alert(translateError(err.message) || err.message || t('common_error_generic'));
    } finally {
      state.loadingMorePeriods = false;
      renderPage();
    }
  }

  async function onCompare() {
    const ids = [...state.selectedForCompare];
    if (ids.length === 0) { state.compareError = 'เลือกอย่างน้อย 1 รอบก่อน'; renderPage(); return; }

    state.comparing = true; state.compareError = ''; state.compareTop3 = null; renderPage();
    try {
      // ★ โหลด kaizen list เต็มของรอบที่ถูกเลือกแบบ lazy ตอนกดเปรียบเทียบจริงๆ เท่านั้น (cache
      // กันโหลดซ้ำถ้าเปรียบเทียบซ้ำชุดเดิม) แทนการ fetch ทุกรอบไว้ล่วงหน้าตั้งแต่เปิดหน้า
      // (Spec.md §4.8 backlog Low #3)
      const missingKaizenLists = ids.filter((id) => !state.kaizenByPeriod.has(id));
      const [resultLists, kaizenLists] = await Promise.all([
        Promise.all(ids.map((id) => getResults(id))),
        Promise.all(missingKaizenLists.map((id) => getKaizenByPeriod(id))),
      ]);
      missingKaizenLists.forEach((id, i) => state.kaizenByPeriod.set(id, kaizenLists[i]));

      const combined = resultLists.flat().filter((r) => r.RankOverall !== null);
      combined.sort((a, b) => Number(b.WeightedScore) - Number(a.WeightedScore));
      state.compareTop3 = combined.slice(0, 3).map((r) => {
        const period = state.periods.find((p) => p.Id === r.PeriodId);
        const kaizen = state.kaizenByPeriod.get(r.PeriodId)?.find((k) => k.Id === r.KaizenId);
        const owner = profileById.get(kaizen?.OwnerId);
        return {
          ...r,
          periodCode: period?.Code,
          kaizenTitle: kaizen?.Title,
          kaizenCode: kaizen?.Code,
          ownerName: owner?.FullName,
          ownerEmployeeId: owner?.EmployeeId,
        };
      });
    } catch (err) {
      state.compareError = translateError(err.message) || err.message || t('common_error_generic');
    } finally {
      state.comparing = false;
      renderPage();
    }
  }

  async function onPublishAward() {
    if (!state.publishLabel.trim()) { state.publishError = 'กรุณาตั้งชื่อประกาศ เช่น "ไตรมาส 4/2569"'; renderPage(); return; }
    if (!confirm(`ประกาศผลรางวัลนี้? จะขึ้น banner บน dashboard ให้ทุกคนเห็นทันที`)) return;

    state.publishing = true; state.publishError = ''; renderPage();
    try {
      const created = await createQuarterlyAward({
        Label: state.publishLabel.trim(),
        PeriodIds: [...state.selectedForCompare],
        // เก็บชื่อ/โครงการ ณ ตอนประกาศไปด้วยเลย (ไม่ใช่แค่ KaizenId) — กันประกาศเปลี่ยนย้อนหลัง
        // ถ้ามีคนแก้ชื่อโครงการ/โปรไฟล์ทีหลัง และไม่ต้อง query เพิ่มตอนโชว์ banner ใน dashboard.js
        Winners: state.compareTop3.map((r, i) => ({
          KaizenId: r.KaizenId,
          Rank: i + 1,
          WeightedScore: Number(r.WeightedScore),
          OwnerName: r.ownerName ?? null,
          OwnerEmployeeId: r.ownerEmployeeId ?? null,
          KaizenTitle: r.kaizenTitle ?? null,
          KaizenCode: r.kaizenCode ?? null,
        })),
      });
      quarterlyAwards = [created, ...quarterlyAwards];
      state.publishLabel = '';
      state.compareTop3 = null;
      state.selectedForCompare = new Set();
    } catch (err) {
      state.publishError = translateError(err.message) || err.message || t('common_error_generic');
    } finally {
      state.publishing = false;
      renderPage();
    }
  }

  async function onDeleteAward(id) {
    if (!confirm('ลบประกาศรางวัลนี้ทิ้ง? banner บน dashboard จะหายไปทันที')) return;
    state.deletingAwardId = id; renderPage();
    try {
      await deleteQuarterlyAward(id);
      quarterlyAwards = quarterlyAwards.filter((a) => a.Id !== id);
    } catch (err) {
      alert(translateError(err.message) || err.message || t('common_error_generic'));
    } finally {
      state.deletingAwardId = null;
      renderPage();
    }
  }

  async function onDelete(id) {
    if (!confirm('ลบรอบร่างนี้ทิ้งถาวร? กู้คืนไม่ได้')) return;
    state.deletingId = id; renderPage();
    try {
      await deletePeriod(id);
      state.periods = state.periods.filter((p) => p.Id !== id);
      state.periodsTotal = Math.max(0, state.periodsTotal - 1);
    } catch (err) {
      alert(translateError(err.message) || err.message || t('common_error_generic'));
    } finally {
      state.deletingId = null;
      renderPage();
    }
  }

  async function onCreate() {
    const code = document.getElementById('f-code').value.trim();
    const nameTh = document.getElementById('f-name-th').value.trim();
    const nameEn = document.getElementById('f-name-en').value.trim();
    const periodStart = document.getElementById('f-start').value;
    const periodEnd = document.getElementById('f-end').value;
    const deadline = document.getElementById('f-deadline').value;

    const missing = [];
    if (!code) missing.push('รหัสรอบ');
    if (!nameTh) missing.push('ชื่อรอบ (TH)');
    if (!periodStart) missing.push('วันเริ่มรอบ');
    if (!periodEnd) missing.push('วันสิ้นสุดรอบ');
    if (!deadline) missing.push('Deadline ส่งผลงาน');
    if (missing.length > 0) {
      state.error = { msg: `กรุณากรอกให้ครบ: ${missing.join(', ')}` };
      renderPage();
      return;
    }
    // ★ เดิมไม่เช็คลำดับวันที่เลย (Spec.md §4.8 finding M14) — กันสร้างรอบที่วันสิ้นสุดมาก่อน
    // วันเริ่ม หรือ deadline มาก่อนวันเริ่มรอบ ซึ่งดูผิดปกติแต่ผ่านได้แบบไม่มีคำเตือนใดๆ
    if (periodEnd < periodStart) {
      state.error = { msg: 'วันสิ้นสุดรอบต้องไม่ก่อนวันเริ่มรอบ' };
      renderPage();
      return;
    }
    if (deadline.slice(0, 10) < periodStart) {
      state.error = { msg: 'Deadline ส่งผลงานต้องไม่ก่อนวันเริ่มรอบ' };
      renderPage();
      return;
    }

    state.saving = true; state.error = {}; renderPage();
    try {
      const created = await createPeriod({
        Code: code,
        NameTh: nameTh,
        NameEn: nameEn || null,
        PeriodStart: periodStart,
        PeriodEnd: periodEnd,
        SubmissionDeadline: parseDatetimeLocalInSystemTz(deadline),
      });
      navigate(`#/admin/periods/${created.Id}`);
    } catch (err) {
      state.error = { msg: translateError(err.message) || err.message || t('common_error_generic') };
      state.saving = false;
      renderPage();
    }
  }
}
