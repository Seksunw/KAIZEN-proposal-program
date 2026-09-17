// js/views/notFound.js — MIGRATION.md ข้อ 15
import { t, tf } from '../i18n.js?v=20260911z8';
import { escapeHtml, pageHeader, stateCard } from '../ui.js?v=20260911z8';

export async function render(container) {
  document.title = `${t('notfound_title')} · ${t('appName')}`;

  container.innerHTML = `
    ${pageHeader({ title: t('notfound_title') })}
    <div class="page-body">
      ${stateCard({
        title: t('notfound_detail'),
        body: tf('nf_body', { hash: `<span class="mono">${escapeHtml(location.hash || t('nf_empty_hash_label'))}</span>` }),
        actions: `<a href="#/dashboard"><button type="button">${t('forbidden_back_to_dashboard')}</button></a>`,
      })}
    </div>
  `;
}
