// js/app.js — bootstrap: session, mount router, render sidebar chrome (MIGRATION.md ข้อ 1)
// ★ cache-bust ทุก static import ในไฟล์นี้ (2026-09-10) — ไม่ใช่แค่ index.html ที่แคชได้
//   api.js/router.js/i18n.js/ui.js ก็ถูก browser แคชแยกตาม URL เดิมได้เหมือนกัน ถ้าเคยโหลด
//   หน้านี้มาก่อนแล้วมาแก้ทีหลัง — bump เลขนี้เมื่อแก้ไฟล์เหล่านี้แล้วผู้ใช้ยังเห็นของเก่า
import {
  getSession, onAuthStateChange, getMyProfile, signOut,
  getMyKaizenList, getOpenPeriod, getReviewQueue, getMyScoresForPeriod, getAllProfiles,
  getAvatarSignedUrl,
} from './api.js?v=20260911z8';
import { initRouter, navigate } from './router.js?v=20260911z8';
import { initLang, t } from './i18n.js?v=20260911z8';
import { escapeHtml, initials, roleLabel, hydrateAvatars } from './ui.js?v=20260911z8';

const ICONS = {
  dashboard: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/></svg>',
  kaizen: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 3h6a1 1 0 0 1 1 1v1H8V4a1 1 0 0 1 1-1Z"/><rect x="5" y="5" width="14" height="16" rx="2"/><path d="M9 12h6M9 16h6M9 8h2"/></svg>',
  review: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="m8.5 12.5 2.5 2.5 5-5"/></svg>',
  feed: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="4" width="16" height="16" rx="2.5"/><path d="M8 9h8M8 13h8M8 17h5"/></svg>',
  periods: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4.5" width="18" height="16" rx="2"/><path d="M3 9.5h18M8 3v3M16 3v3"/></svg>',
  master: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v6c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 11v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6"/></svg>',
  users: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="8" r="3.2"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6"/><circle cx="17.5" cy="9" r="2.5"/><path d="M15.5 14.2c2.6.3 4.5 2.6 4.5 5.3"/></svg>',
  audit: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 3h9l3 3v15H6V3Z"/><path d="M9 9h6M9 13h6M9 17h4"/></svg>',
  logout: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5M21 12H9"/></svg>',
  more: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 6h16M4 12h16M4 18h16"/></svg>',
  plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
};

let cachedSession = null;

// นับ badge ครั้งเดียวตอน session โหลด/เปลี่ยนบัญชี — ไม่ผูกกับทุก hashchange
// (กัน query ยิงรัวทุกครั้งที่เปลี่ยนหน้า ดูเหตุผลใน Spec.md §4.1)
async function computeBadges(profile, userId) {
  const roles = profile?.Roles ?? [];
  const badges = { needRevision: 0, pendingToScore: 0, pendingActivation: 0 };

  try {
    if (roles.includes('employee') || roles.includes('committee') || roles.includes('admin')) {
      const myKaizen = await getMyKaizenList(userId);
      badges.needRevision = myKaizen.filter((k) => k.Status === 'need_revision').length;
    }
  } catch { /* เพิกเฉย — ไม่บล็อก chrome */ }

  try {
    if (roles.includes('committee') || roles.includes('admin')) {
      const openPeriod = await getOpenPeriod();
      if (openPeriod) {
        const [queue, myScores] = await Promise.all([
          getReviewQueue(openPeriod.Id),
          getMyScoresForPeriod(openPeriod.Id, userId),
        ]);
        const scoredIds = new Set(myScores.filter((s) => s.Status === 'submitted').map((s) => s.KaizenId));
        badges.pendingToScore = queue.filter((k) => !scoredIds.has(k.Id)).length;
      }
    }
  } catch { /* เพิกเฉย */ }

  try {
    if (roles.includes('admin')) {
      const allProfiles = await getAllProfiles();
      badges.pendingActivation = allProfiles.filter((p) => !p.IsActive).length;
    }
  } catch { /* เพิกเฉย */ }

  return badges;
}

async function buildSession(authSession) {
  if (!authSession) return null;
  const profile = await getMyProfile(authSession.user.id);
  const badges = await computeBadges(profile, authSession.user.id);
  return { user: authSession.user, profile, badges };
}

// ★ ห้ามคืน cachedSession เฉยๆ ทั้งที่ยังไม่เคยถูก set — login.js/register.js เรียก signIn()
// แล้ว navigate('#/dashboard') ทันที แต่ cachedSession ถูกเติมโดย onAuthStateChange listener
// (bootstrap() ด้านล่าง) ซึ่งเป็น callback แยกที่ทำงานแบบ async ไม่ผูกกับ promise ของ signIn()
// เลย — เกิด race จริง: router (onRouteChange) เรียก getSessionFn() นี้ก่อน listener จะ
// refreshSession() เสร็จ ได้ cachedSession เป็น null ทั้งที่ auth session จริงมีอยู่แล้ว
// route guard เห็น !session เลยเด้งกลับไป #/login ทันที (ต้องกรอกซ้ำรอบสองถึงจะเข้าได้ เพราะ
// รอบสอง cachedSession ถูก listener เติมเสร็จแล้วจากรอบแรก) — แก้โดยเช็ค auth sessionจริงสด
// ทุกครั้งที่ cache ยังว่าง แทนที่จะเชื่อ cache เฉยๆ (2026-09-15)
async function getCurrentSession() {
  if (cachedSession) return cachedSession;
  const authSession = await getSession();
  if (!authSession) return null;
  return refreshSession(authSession);
}

function navLink(hash, icon, label, count) {
  const current = location.hash.split('?')[0];
  const active = current === hash || current.startsWith(`${hash}/`);
  const countHtml = count ? `<span class="nav-count">${count}</span>` : '';
  return `<a href="${hash}" class="${active ? 'active' : ''}"><span class="nav-icon">${ICONS[icon]}</span><span>${label}</span>${countHtml}</a>`;
}

// เหมือน navLink() แต่ไอคอนบน/ป้ายล่าง (ป้ายซ่อนด้วย CSS เหลือแค่ไอคอน อ่านได้ผ่าน screen reader) —
// ใช้กับ bottom tab bar บนมือถือเท่านั้น (≤760px)
function tabLink(hash, icon, label, count, extraClass = '') {
  const current = location.hash.split('?')[0];
  const active = current === hash || current.startsWith(`${hash}/`);
  const badgeHtml = count ? `<span class="tabbar-badge">${count}</span>` : '';
  return `<a href="${hash}" class="tabbar-link${active ? ' active' : ''}${extraClass ? ` ${extraClass}` : ''}"><span class="tabbar-icon">${ICONS[icon]}${badgeHtml}</span><span class="tabbar-label">${label}</span></a>`;
}

// ใช้ทั้ง #sidebar-user (desktop) และ #mobile-drawer-user (มือถือ) — idSuffix กัน id ชนกัน
function userBoxHtml(session, roles, idSuffix = '') {
  const roleText = roles.map((r) => roleLabel(r)).join(', ');
  return `
    <a href="#/profile" class="sidebar-user-link">
      <div class="avatar is-sm"${session.profile?.AvatarPath ? ` data-avatar-path="${escapeHtml(session.profile.AvatarPath)}"` : ''}>${escapeHtml(initials(session.profile?.FullName))}</div>
      <div class="sidebar-user-info">
        <div class="sidebar-user-name">${escapeHtml(session.profile?.FullName ?? '')}</div>
        <div class="sidebar-user-role">${escapeHtml(roleText)}</div>
      </div>
    </a>
    <div class="sidebar-user-actions">
      <button type="button" id="btn-logout${idSuffix}" class="secondary" aria-label="${t('nav_logout')}">${ICONS.logout}</button>
    </div>
  `;
}

// ★ เลือกภาษาได้ครั้งเดียวที่หน้า welcome (ก่อนล็อกอิน) เท่านั้น — เดิมมีปุ่มสลับภาษาที่นี่ด้วย
// (sidebar/mobile-drawer) แต่การสลับภาษาทำงานโดย navigate(location.hash) ซ้ำหน้าเดิมทั้งหน้า
// ซึ่งรีเซ็ต state ในหน่วยความจำของ view ปัจจุบันทิ้งหมด (ฟอร์มที่กรอกค้าง, ช่องค้นหา ฯลฯ หาย
// เงียบๆ โดยไม่มีคำเตือน) เอาออกจากทุกหน้าหลังล็อกอินตามคำขอ ให้เลือกได้ทีเดียวจบที่ welcome
function wireUserBoxActions(session, idSuffix = '') {
  document.getElementById(`btn-logout${idSuffix}`).addEventListener('click', async () => {
    await signOut();
  });
}

function renderChrome(session) {
  const sidebar = document.getElementById('sidebar');
  const tabbar = document.getElementById('mobile-tabbar');
  const drawer = document.getElementById('mobile-drawer');
  const drawerBackdrop = document.getElementById('mobile-drawer-backdrop');

  // ★ #mobile-drawer และลูกๆ เป็น markup คงที่ใน index.html (ไม่ได้ถูกสร้างใหม่ทุกครั้งเหมือน
  // sidebar-nav/tabbar/drawer-nav) เลยไม่เคยผ่าน t() เลยจนกว่าจะตั้งค่าที่นี่ — ต้องอัปเดตทุกครั้งที่
  // renderChrome() ทำงาน (รวมถึงตอนสลับภาษาจาก profile.js ซึ่งยิง renderChrome() ซ้ำผ่าน
  // kaizen:profile-updated) ไม่งั้น aria-label ค้างเป็นไทยแม้เปลี่ยนเป็น English แล้ว
  drawer.setAttribute('aria-label', t('nav_more'));
  const drawerEyebrow = drawer.querySelector('.eyebrow');
  if (drawerEyebrow) drawerEyebrow.textContent = t('nav_more');
  document.getElementById('btn-drawer-close').setAttribute('aria-label', t('mobile_drawer_close_aria'));
  document.getElementById('mobile-drawer-nav').setAttribute('aria-label', t('mobile_drawer_nav_aria'));

  if (!session) {
    sidebar.hidden = true;
    tabbar.hidden = true;
    drawer.hidden = true;
    drawerBackdrop.hidden = true;
    closeDrawer();
    return;
  }

  const roles = session.profile?.Roles ?? [];
  const b = session.badges ?? {};

  // primaryItems: dashboard/kaizen/review/feed — ใช้ทั้ง desktop sidebar
  // (ท่อนบน) และ mobile bottom tab bar
  // ★ เดิม "feed" คือ leaderboard เห็นเฉพาะมีรอบที่ประกาศผลแล้ว (เงื่อนไข if
  // (b.latestPublishedPeriodCode)) — 2026-09-15 เปลี่ยนเป็นหน้า Feed โชว์โครงการที่ส่งแล้วของ
  // ทุกคน (ไม่โชว์คะแนน) ไม่ต้องรอประกาศผลอีกต่อไป จึงโชว์แท็บนี้เสมอเหมือน dashboard/kaizen
  // ไม่มีเงื่อนไขอีกแล้ว (ดู Spec.md — เดิมผู้ใช้เข้าใจผิดว่า "เหลือ 4 ปุ่ม" เป็นบั๊ก ทั้งที่เป็น
  // เงื่อนไขเดิมที่ตั้งใจไว้ — เปลี่ยน design แทนที่จะอธิบายซ้ำ)
  const primaryItems = [{ hash: '#/dashboard', icon: 'dashboard', label: t('nav_dashboard') }];
  if (roles.includes('employee') || roles.includes('committee') || roles.includes('admin')) {
    primaryItems.push({ hash: '#/kaizen', icon: 'kaizen', label: t('nav_kaizen'), count: b.needRevision });
  }
  if (roles.includes('committee') || roles.includes('admin')) {
    primaryItems.push({ hash: '#/review', icon: 'review', label: t('nav_review'), count: b.pendingToScore });
  }
  primaryItems.push({ hash: '#/feed', icon: 'feed', label: t('nav_feed') });

  // adminItems: ใช้ทั้ง desktop sidebar (ต่อท้ายหลัง divider) และ mobile drawer ("เมนู")
  const adminItems = roles.includes('admin') ? [
    { hash: '#/admin/periods', icon: 'periods', label: t('nav_admin_periods') },
    { hash: '#/admin/master', icon: 'master', label: t('nav_admin_master') },
    { hash: '#/admin/users', icon: 'users', label: t('nav_admin_users'), count: b.pendingActivation },
    { hash: '#/admin/audit', icon: 'audit', label: t('nav_admin_audit') },
  ] : [];

  // ---- Desktop sidebar — output เหมือนเดิมทุกประการ ----
  const links = primaryItems.map((i) => navLink(i.hash, i.icon, i.label, i.count));
  if (adminItems.length) {
    links.push('<div class="nav-section">Admin</div>');
    links.push(...adminItems.map((i) => navLink(i.hash, i.icon, i.label, i.count)));
  }
  sidebar.hidden = false;
  document.getElementById('sidebar-nav').innerHTML = links.join('');
  document.getElementById('sidebar-user').innerHTML = userBoxHtml(session, roles);
  wireUserBoxActions(session);

  // ---- Mobile bottom tab bar + drawer (ใหม่, มีผลเฉพาะ ≤760px ผ่าน CSS) ----
  tabbar.hidden = false;
  drawer.hidden = false;
  drawerBackdrop.hidden = false;
  renderMobileChrome(session, roles, primaryItems, adminItems);

  hydrateAvatars(document.body, getAvatarSignedUrl); // ครอบทั้ง sidebar + tabbar + drawer ทีเดียว
}

function renderMobileChrome(session, roles, primaryItems, adminItems) {
  const moreBadge = roles.includes('admin') ? session.badges?.pendingActivation : 0;
  const moreBadgeHtml = moreBadge ? `<span class="tabbar-badge">${moreBadge}</span>` : '';

  // ย้าย "ตรวจให้คะแนน" ออกจากแถบล่างไปไว้ใน "เมนู" แทน — ให้แถบล่างเหลือ 5 ปุ่มพอดีเสมอทุก role
  // (dashboard/kaizen/+/feed/avatar-เมนู — คำขอผู้ใช้ 2026-09-10, คงที่แน่นอนตั้งแต่ feed ไม่มี
  // เงื่อนไข "ต้องมีรอบประกาศผลแล้ว" อีกต่อไป 2026-09-15) ไม่กระทบ desktop sidebar เพราะ desktop
  // render จาก primaryItems เดิม (ก่อนหน้าฟังก์ชันนี้) ไปแล้ว ส่วนนี้แค่กรองซ้ำเฉพาะฝั่งมือถือ
  const tabbarItems = primaryItems.filter((i) => i.hash !== '#/review');
  const drawerExtraItems = primaryItems.filter((i) => i.hash === '#/review');

  // ปุ่ม "+" เสนอ KAIZEN ใหม่ กลางแถบ (เฉพาะ role ที่สร้างโครงการได้ — เงื่อนไขเดียวกับที่
  // เพิ่มเมนู "โครงการของฉัน" ด้านบน) — แทรกกลาง tabbarItems แทนต่อท้าย ให้ตำแหน่งอยู่ค่อนกลาง
  // แถบเสมอไม่ว่า role นั้นจะมีกี่เมนูหลัก (mirror รูปแบบปุ่ม + กลางแถบของ Instagram)
  const canCreate = roles.includes('employee') || roles.includes('committee') || roles.includes('admin');
  const tabLinks = tabbarItems.map((i) => tabLink(i.hash, i.icon, i.label, i.count));
  if (canCreate) {
    const mid = Math.ceil(tabbarItems.length / 2);
    tabLinks.splice(mid, 0, tabLink('#/kaizen/new', 'plus', t('nav_new_kaizen'), 0, 'tabbar-create'));
  }

  const avatarHtml = `<span class="tabbar-avatar"${session.profile?.AvatarPath ? ` data-avatar-path="${escapeHtml(session.profile.AvatarPath)}"` : ''}>${escapeHtml(initials(session.profile?.FullName))}</span>`;
  document.getElementById('mobile-tabbar').innerHTML =
    tabLinks.join('') +
    `<button type="button" id="btn-drawer-toggle" class="tabbar-link" aria-expanded="false" aria-controls="mobile-drawer" aria-haspopup="dialog" aria-label="${t('nav_more')}">
       <span class="tabbar-icon">${avatarHtml}${moreBadgeHtml}</span>
     </button>`;
  document.getElementById('btn-drawer-toggle').addEventListener('click', () => openDrawer());

  document.getElementById('mobile-drawer-nav').innerHTML = [...drawerExtraItems, ...adminItems].map((i) => navLink(i.hash, i.icon, i.label, i.count)).join('');
  document.getElementById('mobile-drawer-user').innerHTML = userBoxHtml(session, roles, '-mobile');
  wireUserBoxActions(session, '-mobile');
}

let drawerOpenerEl = null;

function onDrawerKeydown(e) {
  if (e.key === 'Escape') closeDrawer();
}

function openDrawer() {
  drawerOpenerEl = document.getElementById('btn-drawer-toggle');
  const drawer = document.getElementById('mobile-drawer');
  const backdrop = document.getElementById('mobile-drawer-backdrop');
  if (!drawer || !backdrop) return;

  drawer.classList.add('is-open');
  backdrop.classList.add('is-open');
  drawer.inert = false;
  drawer.removeAttribute('aria-hidden');
  drawerOpenerEl?.setAttribute('aria-expanded', 'true');

  // กัน keyboard tab หลุดเข้าไปเนื้อหาที่อยู่หลัง backdrop (มองไม่เห็นแต่ยัง focus ได้ถ้าไม่กัน)
  const shell = document.querySelector('.shell');
  const tabbar = document.getElementById('mobile-tabbar');
  if (shell) shell.inert = true;
  if (tabbar) tabbar.inert = true;

  document.getElementById('btn-drawer-close')?.focus();
  document.addEventListener('keydown', onDrawerKeydown);
}

function closeDrawer() {
  const drawer = document.getElementById('mobile-drawer');
  const backdrop = document.getElementById('mobile-drawer-backdrop');
  if (!drawer || !drawer.classList.contains('is-open')) return;

  drawer.classList.remove('is-open');
  backdrop.classList.remove('is-open');
  drawer.inert = true;
  drawer.setAttribute('aria-hidden', 'true');

  const shell = document.querySelector('.shell');
  const tabbar = document.getElementById('mobile-tabbar');
  if (shell) shell.inert = false;
  if (tabbar) tabbar.inert = false;

  document.removeEventListener('keydown', onDrawerKeydown);
  drawerOpenerEl?.setAttribute('aria-expanded', 'false');
  drawerOpenerEl?.focus();
  drawerOpenerEl = null;
}

async function refreshSession(authSession) {
  cachedSession = await buildSession(authSession);
  renderChrome(cachedSession);
  return cachedSession;
}

// views/profile.js (dynamic import ของ router.js — คนละ module instance จาก app.js นี้ ข้าม
// import ตรงๆ ไม่ได้) ยิง CustomEvent นี้หลังแก้โปรไฟล์สำเร็จ (เช่น เปลี่ยนรูป) แทน — ดึง
// profile ใหม่จาก DB มา render sidebar/mobile chrome ให้ตรงกันทันที ไม่ต้อง reload ทั้งหน้า
window.addEventListener('kaizen:profile-updated', async () => {
  const authSession = await getSession();
  await refreshSession(authSession);
});

async function bootstrap() {
  initLang();

  // ★ target เป็น element คงที่ (ไม่ถูกสร้างใหม่ใน renderChrome()) ผูก listener ครั้งเดียวพอ —
  //   #mobile-drawer-nav ใช้ event delegation เพราะลิงก์ข้างในถูกแทนที่ทุกครั้งที่ renderChrome()
  document.getElementById('mobile-drawer-backdrop').addEventListener('click', closeDrawer);
  document.getElementById('btn-drawer-close').addEventListener('click', closeDrawer);
  document.getElementById('mobile-drawer-nav').addEventListener('click', (e) => {
    if (e.target.closest('a')) closeDrawer();
  });
  document.getElementById('mobile-drawer-user').addEventListener('click', (e) => {
    if (e.target.closest('a')) closeDrawer();
  });

  // ★ ลิงก์ "ลืมรหัสผ่าน" ที่ Supabase ส่งทางอีเมล ถ้าหมดอายุ/ถูกใช้ไปแล้ว/ไม่ถูกต้อง จะ
  // redirect กลับมาเป็น #error=...&error_code=...&error_description=... ตรงๆ (ไม่ใช่ route
  // ของแอปเราเอง ไม่มี auth event ใดๆ เกิดขึ้นด้วยเพราะไม่มี token ให้ตั้ง session เลย) —
  // ดักจับก่อน initRouter() ทำงาน แล้วแปลงเป็น route ปกติที่ resetPassword.js อ่านต่อได้
  // (ดู Spec.md §4.8 backlog Low #1)
  if (location.hash.startsWith('#error=')) {
    const params = new URLSearchParams(location.hash.slice(1));
    const code = params.get('error_code') || 'unknown';
    location.hash = `#/reset-password?error=${encodeURIComponent(code)}`;
  }

  const authSession = await getSession();
  await refreshSession(authSession);

  onAuthStateChange(async (event, nextAuthSession) => {
    // ★ ลิงก์ตั้งรหัสผ่านใหม่ที่ยังไม่หมดอายุ Supabase จะฝัง access_token ใน URL แล้ว
    // client (detectSessionInUrl) สร้าง session ชั่วคราวให้อัตโนมัติพร้อมยิง event นี้มา —
    // ต้องพาไปหน้า "ตั้งรหัสผ่านใหม่" ไม่ใช่ปล่อยเข้า dashboard เฉยๆ เหมือน sign-in ปกติ
    // (ทดสอบสดยืนยันแล้วว่า event นี้ยิงมาจริงแม้ subscribe หลัง getSession() ข้างบน)
    if (event === 'PASSWORD_RECOVERY') {
      // ★ resetPassword.js ต้องแยกแยะ "มาจากลิงก์ reset จริง" ออกจาก "แค่ล็อกอินปกติอยู่แล้ว
      // แล้วพิมพ์ #/reset-password เข้ามาตรงๆ" — เช็คแค่ session ไม่พอเพราะคนที่ล็อกอินปกติก็มี
      // session เหมือนกัน ใช้ธง sessionStorage นี้เป็นสัญญาณเฉพาะจาก event นี้เท่านั้น
      try { sessionStorage.setItem('kaizen_recovery_flow', '1'); } catch { /* private mode */ }
      navigate('#/reset-password');
      return;
    }

    // ★ Supabase ยิง event แรกทันทีตอน subscribe ด้วย session ปัจจุบัน (ซ้ำกับ
    //   refreshSession ที่เพิ่ง await ไปด้านบน) และยิงซ้ำอีกทุก token refresh (~ทุก 50
    //   นาทีที่แท็บเปิดค้าง) — ถ้าไม่กรอง computeBadges() (6 query) จะยิงซ้ำทุกครั้งที่โหลด
    //   หน้า เจอจริงจาก network log ตอนทดสอบ (สรุปใน Spec.md §4.1) จึง skip เมื่อ user
    //   เดิม ไม่ใช่การ sign in/out จริง
    const prevUserId = cachedSession?.user?.id ?? null;
    const nextUserId = nextAuthSession?.user?.id ?? null;
    if (prevUserId === nextUserId) return;

    await refreshSession(nextAuthSession);
    if (!nextAuthSession) {
      // ★ ออกจากระบบ (หรือ session หมดอายุ/หลุดกลางคัน) พาไปหน้า welcome แทน login ตรงๆ
      // (2026-09-14 ตามคำขอ) ให้เห็นทางเลือก "สร้างบัญชี"/"เข้าสู่ระบบ" อีกครั้งเหมือนตอนเข้าเว็บ
      // ครั้งแรก แทนที่จะโดนโยนเข้าฟอร์ม login ทันที
      navigate('#/welcome');
    }
  });

  window.addEventListener('hashchange', () => {
    if (cachedSession) renderChrome(cachedSession); // แค่ re-render active-link, ไม่ query ซ้ำ
  });

  initRouter(getCurrentSession);
}

bootstrap();
