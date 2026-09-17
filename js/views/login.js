// js/views/login.js — split layout ตาม README.md ข้อ 1
import { signIn } from '../api.js?v=20260911z9';
import { t, getLang } from '../i18n.js?v=20260911z9';
import { navigate, getQuery } from '../router.js?v=20260911z9';
import { criteriaTags, wireCriteriaTags } from '../ui.js?v=20260911z9';

export async function render(container) {
  document.title = `${t('login_title')} · ${t('appName')}`;
  container.innerHTML = `
    <div class="auth-shell">
      <div class="auth-brand">
        <img src="assets/suntory-wellness.jpg" alt="Suntory Wellness" />
        <div class="brand-sub">KAIZEN PROGRAM</div>
        <p class="brand-line">${t('login_brand_line')}</p>
        <p class="muted" style="font-size:12.8px;margin-top:var(--sp-5)">${t('auth_criteria_label')}</p>
        ${criteriaTags(getLang())}
      </div>
      <div class="auth-form-wrap">
        <div class="auth-card">
          <h1>${t('login_title')}</h1>
          <p class="auth-sub">${t('login_sub')}</p>
          <form id="login-form">
            <div class="form-control">
              <input type="email" name="email" id="f-email" required autocomplete="email" placeholder=" " />
              <label for="f-email"><span>${t('login_email')}</span></label>
            </div>
            <div class="form-control">
              <input type="password" name="password" id="f-password" required autocomplete="current-password" placeholder=" " />
              <label for="f-password"><span>${t('login_password')}</span></label>
            </div>
            <p style="margin-top:-8px"><a href="#/forgot-password" style="font-size:13px">${t('login_forgot_link')}</a></p>
            <div id="login-error"></div>
            <button type="submit" class="btn-block">${t('login_submit')}</button>
          </form>
          <div class="divider"></div>
          <p>${t('login_no_account')} <a href="#/register">${t('login_register_link')}</a></p>
          <p class="field-hint">${t('login_pending_activation_hint')}</p>
        </div>
      </div>
    </div>
  `;

  wireCriteriaTags(container);

  const form = document.getElementById('login-form');
  const errorBox = document.getElementById('login-error');
  const passwordInput = document.getElementById('f-password');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorBox.innerHTML = '';
    passwordInput.classList.remove('is-invalid');
    const fd = new FormData(form);
    try {
      await signIn({ email: fd.get('email'), password: fd.get('password') });
      const next = getQuery().get('next');
      navigate(next || '#/dashboard');
    } catch {
      passwordInput.classList.add('is-invalid');
      errorBox.innerHTML = `<div class="error">${t('login_error')}</div>`;
    }
  });
}
