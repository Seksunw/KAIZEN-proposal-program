// js/views/welcome.js — หน้าต้อนรับก่อนล็อกอิน (หน้าแรกของเว็บสำหรับผู้ที่ยังไม่ล็อกอิน — ดู
// router.js: hash ว่างพาผู้ใช้ที่ยังไม่ล็อกอินมาที่นี่แทนที่จะเด้งตรงไปฟอร์ม login เลย)
import { t } from '../i18n.js?v=20260911z11';
import { navigate } from '../router.js?v=20260911z11';
import { authLangSwitchHtml, wireAuthLangSwitch } from '../ui.js?v=20260911z11';

export async function render(container, params, session) {
  // ★ ผู้ใช้ที่ล็อกอินอยู่แล้ว (เช่น กด back มาที่ #/welcome) ไม่ควรเห็นหน้านี้ — พาไป
  // dashboard ตรงๆ แทน
  if (session) {
    navigate('#/dashboard');
    return;
  }

  document.title = `${t('welcome_title')} · ${t('appName')}`;
  container.innerHTML = `
    ${authLangSwitchHtml()}
    <div class="welcome-shell">
      <div class="welcome-hero">
        <div class="welcome-blob">
          <div class="welcome-blob-card">
            <img src="assets/suntory-wellness.jpg" alt="Suntory Wellness" />
          </div>
        </div>
        <div class="brand-sub">KAIZEN PROGRAM</div>
      </div>
      <div class="welcome-body">
        <h1>${t('welcome_title')}</h1>
        <p class="welcome-subtitle">${t('welcome_subtitle')}</p>
      </div>
      <div class="welcome-actions">
        <button type="button" id="btn-create-account" class="btn-block">${t('welcome_create_account')}</button>
        <a href="#/login" class="welcome-login-link">${t('welcome_login_link')}</a>
      </div>
    </div>
  `;

  // ★ ผู้ใช้ขอ fade out/in เบาๆ ตอนสลับภาษา (2026-09-15) — fade-in ของเนื้อหาใหม่ได้มาฟรีจาก
  // #app > * { animation: pageFadeIn } ที่มีอยู่แล้ว (style.css) เพราะ render() สร้าง DOM ใหม่
  // ทุกครั้งอยู่แล้ว แต่ "fade out" ของเนื้อหาเก่าไม่มีมาก่อน (เดิม innerHTML ถูกเขียนทับทันที
  // ไม่มีจังหวะเลย) เลยต้อง fade เนื้อหาเดิมออกเองก่อน ไม่แตะปุ่มสลับภาษาเอง (มี animation ของ
  // ตัวเองอยู่แล้ว ต้องโชว์ตลอดตอนกด)
  //
  // ★ ผู้ใช้ขอเพิ่มอีกขั้น (2026-09-15): ต้องรอให้ animation ของตัวปุ่มเอง (แผ่นเลื่อน/สีตัวหนังสือ
  // ใน style.css .lang-switch-glider/.lang-switch-tab) เล่นจบก่อน ถึงจะเริ่มเปลี่ยนหน้า — ตัวปุ่ม
  // เองไม่มี event ให้ฟัง (เป็น CSS transition ล้วนๆ) เลยต้องรอด้วย setTimeout ตรงๆ ตามความยาวจริง
  // ของ transition ที่ยาวที่สุด (.lang-switch-glider transform 0.34s) — ★ ถ้าแก้ความเร็ว
  // animation ของปุ่มใน style.css ทีหลัง ต้องแก้เลขนี้ให้ตรงกันด้วย ไม่งั้นจังหวะจะเพี้ยน
  const TOGGLE_ANIMATION_MS = 340;

  wireAuthLangSwitch(async () => {
    await new Promise((resolve) => setTimeout(resolve, TOGGLE_ANIMATION_MS));
    const shell = container.querySelector('.welcome-shell');
    if (shell) {
      shell.style.transition = 'opacity 0.15s ease';
      shell.style.opacity = '0';
      await new Promise((resolve) => setTimeout(resolve, 150));
    }
    await render(container, params, session);
  });
  document.getElementById('btn-create-account').addEventListener('click', () => navigate('#/register'));
}
