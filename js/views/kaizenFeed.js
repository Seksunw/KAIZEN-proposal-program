// js/views/kaizenFeed.js — โครงการ KAIZEN ทั้งหมดที่ส่งแล้ว (submitted ขึ้นไป) ของทุกคน
// (2026-09-15, แทนที่หน้า "ผลการประเมิน"/leaderboard เดิม) — ตั้งใจไม่โชว์คะแนน/อันดับใดๆ เลย
// (ตกลงกับผู้ใช้ไว้ชัดเจน คะแนนยังดูได้ที่ dashboard.js "ผลรอบที่ประกาศแล้ว" ตามเดิม) เปิดด้วย
// RLS ใหม่ k_read_feed/ka_read_feed/profiles_read_feed (ดู migration_2026-09-15_kaizen-feed.sql)
// — ไม่แตะ kaizen_progress_updates/committee_scores เลย (ยังเป็นข้อมูลภายในเหมือนเดิม)
import { getFeedPage, getPeriods, getMasterData, getAttachmentSignedUrl, getAvatarSignedUrl, getLikesForKaizenIds, likeKaizen, unlikeKaizen } from '../api.js?v=20260911z10';
import { t, tf } from '../i18n.js?v=20260911z10';
import { getQuery, navigate } from '../router.js?v=20260911z10';
import { escapeHtml, translateError, pageHeader, skeletonRows, stateCard, emptyState, thaiDate, initials, openLightbox, hydrateAvatars, masterLabel } from '../ui.js?v=20260911z10';

const PAGE_SIZE = 10;

// ★ ไอคอนหัวใจ 2 แบบ (outline/solid) — toggle ด้วย class .liked บนปุ่ม (ดู .like-btn ใน
// style.css) เดิม path มือเขียนเองไม่สมมาตร (ผู้ใช้ทักว่า "แหว่งๆ" 2026-09-15) เปลี่ยนมาใช้
// path มาตรฐาน (Material Design heart) ที่สมมาตรซ้าย-ขวาเป๊ะแทน
const HEART_PATH = 'M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z';
const HEART_OUTLINE = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="${HEART_PATH}"/></svg>`;
const HEART_SOLID = `<svg viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="${HEART_PATH}"/></svg>`;

export async function render(container, params, session) {
  document.title = `${t('nav_feed')} · ${t('appName')}`;
  container.innerHTML = pageHeader({ title: t('nav_feed') }) + `<div class="page-body">${skeletonRows(4)}</div>`;

  let periods = [];
  let departments = [];
  let plants = [];
  try {
    [periods, departments, plants] = await Promise.all([
      getPeriods(),
      getMasterData('department'),
      getMasterData('plant'),
    ]);
  } catch { /* ตัวกรองรอบ/label โรงงานพัง ไม่บล็อกทั้งหน้า — ใช้ code ดิบ/ไม่มีตัวกรองแทน */ }

  const labelOf = (list, code) => masterLabel(list, code);
  const periodByCode = new Map(periods.map((p) => [p.Code, p]));
  const initialPeriod = periodByCode.get(getQuery().get('period'));

  const state = {
    periodId: initialPeriod?.Id ?? null,
    rows: [], total: 0, hasMore: false, page: 0, loadingMore: false, error: null,
    likes: {}, // kaizenId -> { count, likedByMe }
  };

  async function loadPage(page, replace) {
    const { rows, total, hasMore } = await getFeedPage({ periodId: state.periodId, page, pageSize: PAGE_SIZE });
    state.rows = replace ? rows : [...state.rows, ...rows];
    state.total = total;
    state.hasMore = hasMore;
    state.page = page;

    // ★ ดึง like ของทุกโครงการในหน้านี้ครั้งเดียว (ไม่ query ทีละใบ) — เก็บสะสมใน state.likes
    // ไว้เรื่อยๆ ข้าม replace ก็ได้ (แถวเก่าที่ไม่ได้โชว์แล้วแค่ค้างเฉยๆ ไม่กระทบอะไร ไม่คุ้มจะเคลียร์)
    const likeRows = await getLikesForKaizenIds(rows.map((k) => k.Id));
    for (const k of rows) {
      const forThis = likeRows.filter((l) => l.KaizenId === k.Id);
      state.likes[k.Id] = { count: forThis.length, likedByMe: forThis.some((l) => l.UserId === session.user.id) };
    }
  }

  try {
    await loadPage(0, true);
  } catch (err) {
    container.innerHTML = pageHeader({ title: t('nav_feed') }) + `<div class="page-body">${stateCard({
      kind: 'error',
      title: t('error_load_failed'),
      body: escapeHtml(translateError(err.message) || err.message || t('common_error_generic')),
      actions: `<button type="button" onclick="location.reload()">${t('state_retry')}</button>`,
    })}</div>`;
    return;
  }

  // ★ event delegation บน container ตัวนอกสุด (คงที่ ไม่ถูกแทนที่ตอน renderPage() เขียนทับ
  // innerHTML ใหม่ทุกครั้ง — ต่างจากการผูก listener ทีละใบใน renderPage() ที่ต้องผูกใหม่ทุกรอบ)
  // ให้คลิกได้ทั้งการ์ด ยกเว้นตรงรูป (มี lightbox ของตัวเองอยู่แล้ว), ลิงก์ชื่อโครงการ (นำทาง
  // เองอยู่แล้วผ่าน href ปกติ), และปุ่มไลค์ (มี handler แยกด้านล่าง) กันนำทางซ้ำซ้อน
  container.addEventListener('click', (e) => {
    const card = e.target.closest('.feed-card');
    if (!card || e.target.closest('.feed-photo') || e.target.closest('a') || e.target.closest('.like-btn')) return;
    navigate(`#/kaizen/${card.dataset.kaizenId}`);
  });

  // ★ ไลค์แบบ optimistic — อัปเดต UI ทันทีไม่ต้องรอ round-trip แล้วค่อยยิง request จริงตามหลัง
  // (ปุ่มเดียวกันนี้ไม่ผ่าน renderPage() ใหม่ทั้งก้อน กัน animation "pop" สะดุด/เสีย scroll position)
  // ถ้า request พังค่อย revert กลับ
  container.addEventListener('click', async (e) => {
    const likeBtn = e.target.closest('.like-btn');
    if (!likeBtn) return;
    const kaizenId = likeBtn.dataset.likeFor;
    const info = state.likes[kaizenId] ?? { count: 0, likedByMe: false };
    const wasLiked = info.likedByMe;
    info.likedByMe = !wasLiked;
    info.count += wasLiked ? -1 : 1;
    state.likes[kaizenId] = info;
    updateLikeButtonUI(likeBtn, info);
    try {
      if (wasLiked) await unlikeKaizen(kaizenId, session.user.id);
      else await likeKaizen(kaizenId, session.user.id);
    } catch {
      info.likedByMe = wasLiked;
      info.count += wasLiked ? 1 : -1;
      state.likes[kaizenId] = info;
      updateLikeButtonUI(likeBtn, info);
    }
  });

  function updateLikeButtonUI(btn, info) {
    btn.classList.toggle('liked', info.likedByMe);
    btn.setAttribute('aria-pressed', String(info.likedByMe));
    const countEl = btn.querySelector('.like-count');
    if (info.count > 0) {
      if (countEl) countEl.textContent = info.count;
      else btn.insertAdjacentHTML('beforeend', `<span class="like-count">${info.count}</span>`);
    } else {
      countEl?.remove();
    }
  }

  await renderPage();

  async function renderPage() {
    const chips = periods.length > 0 ? [
      `<button type="button" class="filter-chip ${state.periodId === null ? 'is-on' : ''}" data-period="">${t('kf_all_periods')}</button>`,
      ...periods.map((p) => `<button type="button" class="filter-chip ${state.periodId === p.Id ? 'is-on' : ''}" data-period="${p.Id}">${escapeHtml(p.Code)}</button>`),
    ].join('') : '';

    const cards = state.rows.map((k) => {
      const photo = (k.KaizenAttachments ?? []).find((a) => a.Phase === 'before') ?? (k.KaizenAttachments ?? [])[0] ?? null;
      const contextParts = [labelOf(departments, k.Department), labelOf(plants, k.Plant)].map(escapeHtml).join(' · ');
      const like = state.likes[k.Id] ?? { count: 0, likedByMe: false };
      return `
        <div class="card feed-card" data-kaizen-id="${k.Id}">
          <div class="hstack feed-header">
            <div class="avatar is-sm"${k.Owner?.AvatarPath ? ` data-avatar-path="${escapeHtml(k.Owner.AvatarPath)}"` : ''}>${escapeHtml(initials(k.Owner?.FullName))}</div>
            <div style="min-width:0">
              <div class="feed-owner-name">${escapeHtml(k.Owner?.FullName ?? '—')}</div>
              <div class="feed-owner-meta">${contextParts}</div>
            </div>
          </div>
          <div class="feed-photo" data-photo-for="${k.Id}">
            ${photo ? '<img alt="" />' : ''}
            <button type="button" class="like-btn${like.likedByMe ? ' liked' : ''}" data-like-for="${k.Id}" aria-label="${escapeHtml(t('kf_like_aria'))}" aria-pressed="${like.likedByMe}">
              <span class="regular-heart">${HEART_OUTLINE}</span>
              <span class="solid-heart">${HEART_SOLID}</span>
              ${like.count > 0 ? `<span class="like-count">${like.count}</span>` : ''}
            </button>
          </div>
          <div class="feed-body">
            <h3 class="feed-title"><a href="#/kaizen/${k.Id}" style="color:inherit;text-decoration:none">${escapeHtml(k.Title)}</a></h3>
            <p class="feed-text"><b>${t('kf_problem_prefix')}</b> ${escapeHtml(k.ProblemDescription || '—')}</p>
            <div class="feed-date">${thaiDate(k.SubmittedAt ?? k.CreatedAt)}</div>
          </div>
        </div>
      `;
    }).join('');

    container.innerHTML = `
      ${pageHeader({ title: t('nav_feed') })}
      <div class="page-body">
        ${chips ? `<div class="filter-bar" style="margin-bottom:16px">${chips}</div>` : ''}
        ${state.total === 0
          ? emptyState({ title: t('empty_feed') })
          : `<div class="feed-list">${cards}</div>
             ${state.hasMore ? `<div style="text-align:center;margin-top:var(--sp-5)"><button type="button" class="secondary" id="btn-load-more" ${state.loadingMore ? 'disabled' : ''}>${state.loadingMore ? t('common_loading') : escapeHtml(tf('kzlist_load_more', { n: state.total - state.rows.length }))}</button></div>` : ''}`}
      </div>
    `;

    container.querySelectorAll('[data-period]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.period || null;
        if (state.periodId === id) return;
        state.periodId = id;
        await loadPage(0, true);
        await renderPage();
      });
    });
    document.getElementById('btn-load-more')?.addEventListener('click', onLoadMore);

    for (const k of state.rows) {
      const photo = (k.KaizenAttachments ?? []).find((a) => a.Phase === 'before') ?? (k.KaizenAttachments ?? [])[0] ?? null;
      if (!photo) continue;
      try {
        const url = await getAttachmentSignedUrl(photo.StoragePath);
        const img = container.querySelector(`[data-photo-for="${k.Id}"] img`);
        if (img) {
          img.src = url;
          img.addEventListener('click', () => openLightbox(url, photo.FileName));
        }
      } catch { /* thumbnail โหลดไม่ขึ้น ไม่บล็อกทั้งการ์ด */ }
    }
    hydrateAvatars(container, getAvatarSignedUrl);
  }

  async function onLoadMore() {
    state.loadingMore = true; await renderPage();
    try {
      await loadPage(state.page + 1, false);
    } catch (err) {
      alert(translateError(err.message) || err.message || t('common_error_generic'));
    } finally {
      state.loadingMore = false;
      await renderPage();
    }
  }
}
