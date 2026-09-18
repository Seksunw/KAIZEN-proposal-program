// js/views/forbidden.js — MIGRATION.md ข้อ 15 (session + query ?from= จาก router.js)
import { t, tf } from '../i18n.js?v=20260911z15';
import { getQuery, ROUTES } from '../router.js?v=20260911z15';
import { escapeHtml, pageHeader, stateCard, roleLabel } from '../ui.js?v=20260911z15';

export async function render(container, params, session) {
  document.title = `${t('forbidden_title')} · ${t('appName')}`;

  const from = getQuery().get('from');
  const route = from ? ROUTES.find((r) => from.split('?')[0] === r.pattern || from.split('?')[0].startsWith(r.pattern.split(':')[0])) : null;
  const needed = route?.roles ?? [];
  const have = session?.profile?.Roles ?? [];

  container.innerHTML = `
    ${pageHeader({ title: t('forbidden_title') })}
    <div class="page-body">
      ${stateCard({
        kind: 'forbidden',
        title: t('forbidden_detail'),
        body: `
          ${needed.length > 0 ? `${t('forbidden_needed_roles_label')} <strong>${needed.map((r) => escapeHtml(roleLabel(r))).join(', ')}</strong><br/>` : ''}
          ${t('forbidden_your_roles_label')} <strong>${have.length > 0 ? have.map((r) => escapeHtml(roleLabel(r))).join(', ') : t('forbidden_none')}</strong><br/>
          ${tf('forbidden_contact_admin', { id: `<span class="mono">${escapeHtml(session?.profile?.EmployeeId ?? '—')}</span>` })}
        `,
        actions: `<a href="#/dashboard"><button type="button">${t('forbidden_back_to_dashboard')}</button></a>`,
      })}
    </div>
  `;
}
