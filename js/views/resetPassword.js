// js/views/resetPassword.js — ตั้งรหัสผ่านใหม่ จากลิงก์ที่ Supabase ส่งทางอีเมล
// (Spec.md §4.8 backlog Low #1) — เข้าถึงหน้านี้ได้ 3 ทาง:
//   1) ลิงก์ยังไม่หมดอายุ: app.js ตรวจ auth event 'PASSWORD_RECOVERY' แล้วพามาที่นี่พร้อม
//      session ชั่วคราวที่ใช้ตั้งรหัสผ่านใหม่ได้ (case ปกติ)
//   2) ลิงก์หมดอายุ/ถูกใช้ไปแล้ว/ไม่ถูกต้อง: app.js แปลง #error=... เป็น query ?error=... ให้
//   3) เข้าตรงๆ โดยไม่เคยกดลิงก์อีเมลเลย: ไม่มี error query และไม่มี session ก็จะไม่มีสิทธิ์แก้
import { updatePassword, signOut } from '../api.js?v=20260911z10';
import { t } from '../i18n.js?v=20260911z10';
import { navigate, getQuery } from '../router.js?v=20260911z10';
import { escapeHtml, translateError, stateCard } from '../ui.js?v=20260911z10';

const PASSWORD_MIN_LEN = 8;

export async function render(container, params, session) {
  document.title = `${t('reset_title')} · ${t('appName')}`;
  const errorCode = getQuery().get('error');
  // ★ เช็คแค่ session ไม่พอ — ผู้ใช้ที่ล็อกอินปกติอยู่แล้ว (ไม่เคยผ่าน recovery link เลย) ก็มี
  // session เหมือนกัน ถ้าพิมพ์ #/reset-password เข้ามาตรงๆ จะโดนปล่อยให้ตั้งรหัสผ่านใหม่ได้เฉยๆ
  // ทั้งที่ไม่ใช่ flow ที่ตั้งใจ — ธงนี้ตั้งจาก app.js เฉพาะตอน auth event 'PASSWORD_RECOVERY'
  // จริงๆ เท่านั้น (ดู Spec.md §4.8 backlog Low #1)
  let isRecoveryFlow = false;
  try { isRecoveryFlow = sessionStorage.getItem('kaizen_recovery_flow') === '1'; } catch { /* private mode */ }

  // ★ เคส 2/3 ข้างบน — ไม่มีทางตั้งรหัสผ่านใหม่ได้ที่นี่ โชว์ข้อความอธิบาย + ทางไปขอลิงก์ใหม่
  if (errorCode || !session || !isRecoveryFlow) {
    container.innerHTML = `
      <div class="auth-shell">
        <div class="auth-brand">
          <img src="assets/suntory-wellness.jpg" alt="Suntory Wellness" />
          <div class="brand-sub">KAIZEN PROGRAM</div>
        </div>
        <div class="auth-form-wrap">
          <div class="auth-card">
            ${stateCard({
              kind: 'warning',
              title: t('reset_expired_title'),
              body: errorCode ? t('reset_expired_body') : t('reset_no_session_body'),
              actions: `<a href="#/forgot-password"><button type="button">${t('reset_request_new')}</button></a>`,
            })}
          </div>
        </div>
      </div>
    `;
    return;
  }

  container.innerHTML = `
    <div class="auth-shell">
      <div class="auth-brand">
        <img src="assets/suntory-wellness.jpg" alt="Suntory Wellness" />
        <div class="brand-sub">KAIZEN PROGRAM</div>
      </div>
      <div class="auth-form-wrap">
        <div class="auth-card">
          <h1>${t('reset_title')}</h1>
          <p class="auth-sub">${t('reset_sub')}</p>
          <form id="reset-form">
            <div>
              <div class="form-control">
                <input type="password" name="password" id="f-password" required minlength="${PASSWORD_MIN_LEN}" autocomplete="new-password" placeholder=" " />
                <label for="f-password"><span>${t('reset_new_password')}</span></label>
              </div>
              <span class="field-hint" id="password-hint">${t('password_min_hint')}</span>
            </div>
            <div class="form-control">
              <input type="password" name="confirmPassword" id="f-confirm-password" required autocomplete="new-password" placeholder=" " />
              <label for="f-confirm-password"><span>${t('reset_confirm_password')}</span></label>
            </div>
            <div id="match-hint"></div>
            <div id="reset-error"></div>
            <button type="submit" class="btn-block" id="btn-submit">${t('reset_submit')}</button>
          </form>
          <div id="reset-success" hidden>
            <div class="success">${t('reset_success')}</div>
            <button type="button" class="btn-block" id="btn-reset-continue" style="margin-top:var(--sp-4)">${t('forgot_back_login')}</button>
          </div>
        </div>
      </div>
    </div>
  `;

  const form = document.getElementById('reset-form');
  const errorBox = document.getElementById('reset-error');
  const successBox = document.getElementById('reset-success');
  const btn = document.getElementById('btn-submit');
  const passwordInput = document.getElementById('f-password');
  const confirmInput = document.getElementById('f-confirm-password');
  const passwordHint = document.getElementById('password-hint');
  const matchHint = document.getElementById('match-hint');

  function updateHints() {
    const pw = passwordInput.value;
    passwordHint.textContent = pw.length > 0 && pw.length < PASSWORD_MIN_LEN ? t('password_too_short') : t('password_min_hint');
    passwordHint.style.color = pw.length > 0 && pw.length < PASSWORD_MIN_LEN ? 'var(--danger)' : '';

    if (confirmInput.value.length === 0) { matchHint.innerHTML = ''; return; }
    const matches = pw === confirmInput.value;
    matchHint.innerHTML = `<p class="field-hint" style="color:${matches ? 'var(--primary)' : 'var(--danger)'}">${matches ? t('password_match_ok') : t('password_mismatch')}</p>`;
  }
  passwordInput.addEventListener('input', updateHints);
  confirmInput.addEventListener('input', updateHints);

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorBox.innerHTML = '';
    if (passwordInput.value.length < PASSWORD_MIN_LEN) {
      errorBox.innerHTML = `<div class="error">${escapeHtml(t('password_too_short'))}</div>`;
      return;
    }
    if (passwordInput.value !== confirmInput.value) {
      errorBox.innerHTML = `<div class="error">${escapeHtml(t('password_mismatch'))}</div>`;
      return;
    }
    btn.disabled = true; btn.textContent = t('common_loading');
    try {
      await updatePassword(passwordInput.value);
      try { sessionStorage.removeItem('kaizen_recovery_flow'); } catch { /* private mode */ }
      // ★ ออกจาก session ชั่วคราวที่ใช้ตั้งรหัสผ่านใหม่ แล้วบังคับให้ล็อกอินใหม่ด้วยรหัสผ่าน
      // ใหม่ — สะอาดกว่าปล่อยให้ค้างอยู่ใน recovery session ต่อ
      form.hidden = true;
      successBox.hidden = false;
      await signOut();
      document.getElementById('btn-reset-continue').addEventListener('click', () => navigate('#/login'));
    } catch (err) {
      errorBox.innerHTML = `<div class="error">${escapeHtml(translateError(err.message) || err.message || t('common_error_generic'))}</div>`;
      btn.disabled = false; btn.textContent = t('reset_submit');
    }
  });
}
