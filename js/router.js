// js/router.js — hash-based client router, ทำงานฝั่ง client 100% (§5.3)

export const ROUTES = [
  { pattern: '#/welcome',                 view: 'views/welcome.js',       roles: [], public: true },
  { pattern: '#/login',                   view: 'views/login.js',         roles: [], public: true },
  { pattern: '#/register',                view: 'views/register.js',      roles: [], public: true },
  { pattern: '#/forgot-password',         view: 'views/forgotPassword.js', roles: [], public: true },
  { pattern: '#/reset-password',          view: 'views/resetPassword.js', roles: [], public: true },
  { pattern: '#/dashboard',               view: 'views/dashboard.js',     roles: ['employee', 'committee', 'admin'] },
  { pattern: '#/kaizen',                  view: 'views/kaizenList.js',    roles: ['employee', 'committee', 'admin'] },
  { pattern: '#/kaizen/new',              view: 'views/kaizenForm.js',    roles: ['employee', 'committee', 'admin'] },
  { pattern: '#/kaizen/:id',              view: 'views/kaizenDetail.js',  roles: ['employee', 'committee', 'admin'] },
  { pattern: '#/kaizen/:id/edit',         view: 'views/kaizenForm.js',    roles: ['employee', 'committee', 'admin'] },
  { pattern: '#/kaizen/:id/progress',     view: 'views/kaizenProgress.js', roles: ['employee', 'committee', 'admin'] },
  { pattern: '#/feed',                    view: 'views/kaizenFeed.js',    roles: ['employee', 'committee', 'admin'] },
  { pattern: '#/profile',                 view: 'views/profile.js',      roles: ['employee', 'committee', 'admin'] },
  { pattern: '#/review',                  view: 'views/reviewQueue.js',   roles: ['committee', 'admin'] },
  { pattern: '#/review/:kaizenId',        view: 'views/reviewScore.js',   roles: ['committee', 'admin'] },
  { pattern: '#/admin/users',             view: 'views/adminUsers.js',    roles: ['admin'] },
  { pattern: '#/admin/master',            view: 'views/adminMaster.js',   roles: ['admin'] },
  { pattern: '#/admin/periods',           view: 'views/adminPeriods.js',  roles: ['admin'] },
  // ★ ต้องอยู่ "ก่อน" #/admin/periods/:id เสมอ — matchRoute() คืน route แรกที่ match และ :id
  //   จับได้ทุกค่ารวมถึงคำว่า "new" (จำนวน segment เท่ากัน) ถ้าสลับลำดับหน้านี้จะโหลดหน้า detail
  //   โดยส่ง id = "new" แทน
  { pattern: '#/admin/periods/new',       view: 'views/adminPeriodNew.js', roles: ['admin'] },
  { pattern: '#/admin/periods/:id',       view: 'views/adminPeriodDetail.js', roles: ['admin'] },
  { pattern: '#/admin/audit',             view: 'views/adminAudit.js',    roles: ['admin'] },
  { pattern: '#/403',                     view: 'views/forbidden.js',     roles: [], public: true },
  { pattern: '#/404',                     view: 'views/notFound.js',      roles: [], public: true },
];

function splitHash(hash) {
  const [pathPart, ...rest] = hash.split('?');
  return { path: pathPart || '#/', query: rest.join('?') || '' };
}

function matchRoute(path) {
  const pathSegments = path.split('/');
  for (const route of ROUTES) {
    const patternSegments = route.pattern.split('/');
    if (patternSegments.length !== pathSegments.length) continue;
    const params = {};
    let ok = true;
    for (let i = 0; i < patternSegments.length; i++) {
      const p = patternSegments[i];
      if (p.startsWith(':')) {
        params[p.slice(1)] = pathSegments[i];
      } else if (p !== pathSegments[i]) {
        ok = false;
        break;
      }
    }
    if (ok) return { route, params };
  }
  return null;
}

// อ่าน query string แยกจาก params เสมอ
export function getQuery() {
  const { query } = splitHash(location.hash);
  return new URLSearchParams(query);
}

// ทางเดียวที่โค้ดอื่นควรใช้เปลี่ยนหน้า
export function navigate(hash) {
  if (location.hash === hash) {
    onRouteChange();
  } else {
    location.hash = hash;
  }
}

let getSessionFn = null;

export function initRouter(getSession) {
  getSessionFn = getSession;
  window.addEventListener('hashchange', onRouteChange);
  window.addEventListener('DOMContentLoaded', onRouteChange);
  if (document.readyState !== 'loading') onRouteChange();
}

async function onRouteChange() {
  if (!location.hash) {
    // ★ เจอบั๊กจริงจากการทดสอบสด (2026-09-17): ลิงก์ recovery ที่ Supabase redirect กลับมาพร้อม
    // #access_token=...&type=recovery ถูก app.js ดักไป #/reset-password ทันทีตั้งแต่ bootstrap()
    // (ก่อนไฟล์นี้ทำงานด้วยซ้ำ) แต่ Supabase client เองก็ทำ history.replaceState เคลียร์ hash
    // ทิ้งทีหลังอีกที (ตอนประมวลผล token เสร็จจริง ซึ่งช้ากว่า) กลายเป็นเขียนทับ hash ที่เพิ่งตั้ง
    // ไว้ให้กลายเป็นค่าง่าง อีกที ทำให้ตกลงมาเจอเงื่อนไข "hash ว่าง" นี้อีกรอบ แล้วเด้งไป
    // #/dashboard เพราะตอนนี้มี session แล้ว (ทั้งที่เพิ่งตั้งใจจะพาไป reset-password) — กันซ้ำอีก
    // ชั้นด้วย sessionStorage flag เดียวกับที่ app.js ตั้งไว้ ให้ชนะการเช็คนี้เสมอไม่ว่า hash จะ
    // โดนเคลียร์กี่รอบก็ตาม
    let isRecoveryFlow = false;
    try { isRecoveryFlow = sessionStorage.getItem('kaizen_recovery_flow') === '1'; } catch { /* private mode */ }
    if (isRecoveryFlow) {
      location.hash = '#/reset-password';
      return;
    }

    // ★ เข้าเว็บครั้งแรกแบบไม่มี hash เลย — คนที่ล็อกอินอยู่แล้ว (เช่น เปิดแท็บใหม่) พาไป
    // dashboard ตรงๆ ต่อ ส่วนคนที่ยังไม่ล็อกอินพาไปหน้า welcome ก่อน (เดิมพาไป #/dashboard
    // เสมอ ซึ่งจะโดน route guard ด้านล่างเด้งไป #/login ต่ออีกที — เปลี่ยนเป็น #/welcome ตรงๆ
    // ให้เห็นหน้าต้อนรับก่อนแทนที่จะโดนเด้งไปฟอร์ม login เลย)
    const session = getSessionFn ? await getSessionFn() : null;
    location.hash = session ? '#/dashboard' : '#/welcome';
    return; // จะ trigger hashchange แล้วเข้ามาใหม่พร้อม hash จริง
  }

  const { path } = splitHash(location.hash);
  const matched = matchRoute(path);

  if (!matched) {
    navigate('#/404');
    return;
  }

  const { route, params } = matched;
  const session = getSessionFn ? await getSessionFn() : null;

  if (route.public !== true && !session) {
    navigate(`#/login?next=${encodeURIComponent(location.hash)}`);
    return;
  }

  if (route.roles.length > 0) {
    const myRoles = session?.profile?.Roles ?? [];
    if (!route.roles.some((r) => myRoles.includes(r))) {
      navigate(`#/403?from=${encodeURIComponent(location.hash)}`);
      return;
    }
  }

  const container = document.getElementById('app');
  // ★ cache-bust ทุกครั้ง — ไม่มี build step ในโปรเจกต์นี้ (§1.2) ไฟล์ view เปลี่ยนบ่อย
  //   ระหว่าง dev แต่ browser cache module JS ตาม URL เดิมไว้ดื้อ ๆ ข้าม hard-refresh
  //   ปกติได้ (มักงงกันว่าทำไมแก้โค้ดแล้วยังไม่ขึ้น) — ตัดปัญหานี้ทิ้งไปเลย
  const mod = await import(`./${route.view}?v=${Date.now()}`);
  await mod.render(container, params, session);
}
