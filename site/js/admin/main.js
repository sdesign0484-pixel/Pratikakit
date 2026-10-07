import { isConfigured } from '../api.js';
import { getClient } from '../api.js';
import { h, $, replaceContent } from '../ui.js';
import { startGate } from './gate.js';
import { countOf } from './dashboard.js';

const root = $('#app');

if (!isConfigured()) {
  replaceContent(root, h('main', { class: 'auth-card', id: 'main' }, h('h1', {}, 'Administration'),
    h('p', { class: 'alert alert-error', role: 'alert' }, "Le site n'est pas relié à Supabase : renseignez SUPABASE_URL et SUPABASE_ANON_KEY dans js/config.js, puis redéployez.")));
} else {
  getClient().auth.onAuthStateChange((event) => { if (event === 'SIGNED_OUT') location.reload(); });
  startGate(root, boot);
}

const NAV = [
  ['#/', 'Tableau de bord'], ['#/outils', 'Outils'], ['#/categories', 'Catégories'], ['#/commandes', 'Commandes', 'orders'],
  ['#/clients', 'Clients'], ['#/messages', 'Messages', 'msgs'], ['#/reglages', 'Réglages du site'], ['#/journal', 'Journal'],
];
const ROUTES = {
  '': () => import('./dashboard.js').then((m) => m.dashboardView),
  outils: (a) => import('./tools.js').then((m) => (a ? (v, c) => m.toolForm(v, a === 'nouveau' ? null : a, c) : m.toolsList)),
  categories: () => import('./categories.js').then((m) => m.categoriesView),
  commandes: () => import('./orders.js').then((m) => m.ordersView),
  clients: (a) => import('./clients.js').then((m) => (a ? (v, c) => m.clientDetail(v, a, c) : m.clientsList)),
  messages: () => import('./messages.js').then((m) => m.messagesView),
  reglages: () => import('./settings.js').then((m) => m.settingsView),
  journal: () => import('./journal.js').then((m) => m.journalView),
};

function boot(session) {
  const view = h('main', { class: 'admin-main', id: 'main', tabindex: '-1' });
  const nav = h('ul', { class: 'admin-nav' });
  const badges = {};
  for (const [href, label, key] of NAV) {
    const count = key ? h('span', { class: 'nav-count', hidden: true }) : null;
    if (key) badges[key] = count;
    nav.append(h('li', {}, h('a', { href, 'data-href': href }, label, count)));
  }
  replaceContent(root, h('div', { class: 'admin-shell' },
    h('aside', { class: 'admin-side' },
      h('div', { class: 'admin-brand' }, h('strong', {}, 'Administration'), h('span', { class: 'cell-sub' }, session.user.email)),
      h('nav', { 'aria-label': 'Sections' }, nav),
      h('div', { class: 'admin-side-foot' },
        h('a', { href: '../index.html', target: '_blank', rel: 'noopener' }, 'Voir le site'),
        h('button', { class: 'link-btn', type: 'button', onclick: async () => { await getClient().auth.signOut(); } }, 'Se déconnecter'))),
    view));

  async function refreshBadges() {
    try {
      const [o, m] = await Promise.all([countOf('orders', (q) => q.eq('status', 'awaiting_payment')), countOf('contact_messages', (q) => q.eq('status', 'new'))]);
      for (const [k, v] of [['orders', o], ['msgs', m]]) { badges[k].textContent = String(v); badges[k].hidden = v === 0; }
    } catch (_) { /* les pastilles ne doivent jamais bloquer l'écran */ }
  }

  let token = 0;
  async function route() {
    const my = ++token;
    const [section = '', arg] = location.hash.replace(/^#\/?/, '').split('/');
    for (const a of nav.querySelectorAll('a')) {
      const active = (a.dataset.href.replace('#/', '') || '') === section;
      if (active) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    }
    const loader = ROUTES[section];
    if (!loader) { replaceContent(view, h('div', { class: 'state' }, h('h2', {}, 'Page introuvable'), h('a', { class: 'btn btn-primary', href: '#/' }, "Retour au tableau de bord"))); return; }
    const render = await loader(arg);
    if (my !== token) return;
    window.scrollTo(0, 0);
    await render(view, { isCurrent: () => my === token, refreshBadges });
    if (my === token) { view.focus({ preventScroll: true }); refreshBadges(); }
  }
  window.addEventListener('hashchange', route);
  route();
}
