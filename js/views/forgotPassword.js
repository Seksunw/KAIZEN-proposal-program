// js/views/forgotPassword.js — ขอลิงก์ตั้งรหัสผ่านใหม่ทางอีเมล (Spec.md §4.8 backlog Low #1)
import { requestPasswordReset } from '../api.js?v=20260911z5';
import { t } from '../i18n.js?v=20260911z5';
import { escapeHtml } from '../ui.js?v=20260911z5';

export async function render(container) {
  document.title = `${t('forgot_title')} · ${t('appName')}`;
  container.innerHTML = `
    <div class="auth-shell">
      <div class="auth-brand">
        <img src="assets/suntory-wellness.jpg" alt="Suntory Wellness" />
        <div class="brand-sub">KAIZEN PROGRAM</div>
      </div>
      <div class="auth-form-wrap">
        <div class="auth-card">
          <h1>${t('forgot_title')}</h1>
          <p class="auth-sub">${t('forgot_sub')}</p>
          <form id="forgot-form">
            <div class="form-control">
              <input type="email" name="email" id="f-email" required autocomplete="email" placeholder=" " />
              <label for="f-email"><span>${t('login_email')}</span></label>
            </div>
            <div id="forgot-error"></div>
            <button type="submit" class="btn-block" id="btn-submit">${t('forgot_submit')}</button>
          </form>
          <div id="forgot-success" hidden>
            <div class="success">
              <strong>${t('forgot_sent_title')}</strong>
              <p style="margin-top:6px">${t('forgot_sent_body')}</p>
            </div>
          </div>
          <div class="divider"></div>
          <p><a href="#/login">${t('forgot_back_login')}</a></p>
        </div>
      </div>
    </div>
  `;

  const form = document.getElementById('forgot-form');
  const errorBox = document.getElementById('forgot-error');
  const successBox = document.getElementById('forgot-success');
  const btn = document.getElementById('btn-submit');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorBox.innerHTML = '';
    btn.disabled = true; btn.textContent = t('common_loading');
    const fd = new FormData(form);
    try {
      await requestPasswordReset(fd.get('email'));
    } catch { /* เพิกเฉยตั้งใจ — ไม่บอกว่าอีเมลนี้มีบัญชีอยู่จริงไหม (กัน user enumeration) */ }
    // ★ โชว์ข้อความเดียวกันเสมอไม่ว่าอีเมลนี้จะมีบัญชีจริงหรือไม่ — ถ้าบอกต่างกัน (เช่น
    // "ไม่พบอีเมลนี้" เทียบกับ "ส่งแล้ว") จะกลายเป็นช่องทางเดาอีเมลที่มีบัญชีในระบบได้
    // (หลักการเดียวกับ M8 ที่แก้ไปแล้วตอนสมัครสมาชิก)
    form.hidden = true;
    successBox.hidden = false;
  });
}
