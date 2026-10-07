// Éléments d'interface partagés : construction DOM sécurisée, en-tête/pied de page, cartes, états.
// RÈGLE : aucun texte venant de la base n'est inséré avec innerHTML (toujours textContent).
import { CONFIG } from './config.js';
import { fetchSettings, isDemo, isConfigured, DEFAULT_SETTINGS } from './api.js';
import { currentUser } from './auth.js';
import { cart } from './cart.js';

export function h(tag, attrs, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  for (const c of children.flat(Infinity)) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c.nodeType ? c : document.createTextNode(String(c)));
  }
  return el;
}

export const $ = (sel, root = document) => root.querySelector(sel);

export function replaceContent(el, ...nodes) {
  el.replaceChildren(...nodes.flat(Infinity).filter(Boolean));
}

/* ---------- Formats ---------- */
export function formatPrice(tool) {
  if (!tool.price_amount) return { text: 'Gratuit', free: true };
  const label = tool.currency && tool.currency !== 'MGA' ? tool.currency : CONFIG.CURRENCY_LABEL;
  return { text: new Intl.NumberFormat('fr-FR').format(tool.price_amount).replace(/\u202f/g, '\u00a0') + '\u00a0' + label, free: false };
}

export function accessLabel(days) {
  if (!days) return 'Accès permanent';
  return days === 1 ? 'Accès de 1 jour' : `Accès de ${days} jours`;
}

export const STATUS = {
  available: { label: 'Disponible', cls: 'badge-ok' },
  coming_soon: { label: 'Bientôt disponible', cls: 'badge-soon' },
  unavailable: { label: 'Indisponible', cls: 'badge-off' },
};
export const statusBadge = (status) => {
  const s = STATUS[status] || STATUS.unavailable;
  return h('span', { class: `badge ${s.cls}` }, s.label);
};

export const normalize = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
export const cleanList = (v) => (Array.isArray(v) ? v.filter((x) => typeof x === 'string' && x.trim()).map((x) => x.trim()) : []);
const hueOf = (slug) => [...String(slug)].reduce((n, ch) => n + ch.charCodeAt(0), 0) % 3;
const initialsOf = (name) => {
  const w = String(name || '').trim().split(/\s+/).filter(Boolean);
  return ((w[0] || '?')[0] + (w.length > 1 ? w[1][0] : '')).toUpperCase();
};

/* ---------- Visuel d'un outil : image si fournie (https), sinon initiale colorée ---------- */
export function toolVisual(tool, { onFail } = {}) {
  const placeholder = () => h('div', { class: `tool-visual hue-${hueOf(tool.slug)}`, 'aria-hidden': 'true' }, h('span', { class: 'initial' }, initialsOf(tool.name)[0]));
  if (typeof tool.image_url === 'string' && /^https:\/\//.test(tool.image_url)) {
    const img = h('img', { src: tool.image_url, alt: '', loading: 'lazy', decoding: 'async' });
    const box = h('div', { class: 'tool-visual', 'aria-hidden': 'true' }, img);
    img.addEventListener('error', () => (onFail ? onFail(box) : box.replaceWith(placeholder())), { once: true });
    return box;
  }
  return onFail ? null : placeholder();  // onFail fourni = pas de repli décoratif (fiche détaillée)
}

export const formatDate = (iso) => (iso ? new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '');
export const ORDER_STATUS = {
  awaiting_payment: { label: 'En attente de paiement', cls: 'badge-soon' },
  paid: { label: 'Payée', cls: 'badge-ok' },
  cancelled: { label: 'Annulée', cls: 'badge-off' },
};
export const ACCESS_STATE = {
  active: { label: 'Actif', cls: 'badge-ok' },
  expired: { label: 'Expiré', cls: 'badge-off' },
  revoked: { label: 'Retiré', cls: 'badge-off' },
  not_started: { label: 'Pas encore actif', cls: 'badge-soon' },
};
export const SOURCE_LABEL = { purchase: 'Achat', free: 'Gratuit', manual: 'Offert' };
export const badgeOf = (map, key) => { const m = map[key] || { label: key, cls: '' }; return h('span', { class: `badge ${m.cls}` }, m.label); };

export const toolUrl = (tool) => `outil.html?slug=${encodeURIComponent(tool.slug)}`;

export function toolCard(tool, categoryName) {
  const price = formatPrice(tool);
  return h('li', {},
    h('article', { class: 'tool-card' },
      toolVisual(tool),
      h('div', { class: 'tool-body' },
        categoryName ? h('p', { class: 'tool-cat' }, categoryName) : null,
        h('h3', { class: 'tool-title' }, h('a', { href: toolUrl(tool) }, tool.name)),
        tool.short_description ? h('p', { class: 'tool-desc' }, tool.short_description) : null,
        h('div', { class: 'tool-foot' },
          h('span', { class: price.free ? 'price free' : 'price' }, price.text),
          statusBadge(tool.status)))));
}

/* ---------- États ---------- */
export const loadingGrid = (n = 3) =>
  h('div', { class: 'tool-grid', role: 'status', 'aria-label': 'Chargement' },
    Array.from({ length: n }, () => h('div', { class: 'skeleton' })));

export function emptyState({ title, text, action }) {
  return h('div', { class: 'state' }, h('h2', {}, title), text ? h('p', {}, text) : null, action || null);
}

export const ERROR_TEXT = {
  not_configured: "Le site n'est pas encore relié à sa base de données. Renseignez js/config.js (ajoutez ?demo=1 à l'adresse pour un aperçu avec des données fictives).",
  network: 'La connexion au serveur a échoué. Vérifiez votre réseau, puis réessayez.',
  server: "Le serveur a répondu par une erreur. Réessayez dans un instant ; si le problème persiste, écrivez-nous depuis la page Contact.",
};
export function errorState(err, onRetry) {
  return h('div', { class: 'state is-error', role: 'alert' },
    h('h2', {}, 'Impossible de charger les données'),
    h('p', {}, ERROR_TEXT[err && err.kind] || ERROR_TEXT.server),
    err && err.kind === 'not_configured' ? null : h('button', { class: 'btn btn-ghost', type: 'button', onclick: onRetry }, 'Réessayer'));
}

export function setMeta(title, description, siteName) {
  document.title = title ? `${title} — ${siteName}` : siteName;
  const m = document.querySelector('meta[name="description"]');
  if (m && description) m.setAttribute('content', description.slice(0, 200));
}

/* ---------- En-tête et pied de page ---------- */
const NAV = [
  { key: 'home', label: 'Accueil', href: 'index.html' },
  { key: 'catalogue', label: 'Catalogue', href: 'catalogue.html' },
  { key: 'contact', label: 'Contact', href: 'contact.html' },
];

const brandMark = (name) => initialsOf(name);
export const whatsappUrl = (n) => { const d = String(n || '').replace(/\D/g, ''); return d.length >= 8 ? `https://wa.me/${d}` : null; };
export const mailUrl = (e) => (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e || '') ? `mailto:${e}` : null);

const shopEnabled = () => Boolean(CONFIG.FEATURES.auth) && isConfigured() && !isDemo();

function renderHeader(el, active, settings, user) {
  const links = NAV.map((n) => h('a', { href: n.href, 'aria-current': n.key === active ? 'page' : null }, n.label));
  if (shopEnabled()) {
    const count = h('span', { class: 'cart-count', hidden: true });
    const syncCount = () => { const n = cart.count(); count.textContent = String(n); count.hidden = n === 0; count.setAttribute('aria-label', `${n} outil${n > 1 ? 's' : ''} dans le panier`); };
    syncCount();
    window.addEventListener('pf-cart', syncCount); window.addEventListener('storage', syncCount);
    links.push(
      h('a', { class: 'nav-cta', href: 'panier.html', 'aria-current': active === 'cart' ? 'page' : null }, 'Panier', count),
      user ? h('a', { class: 'nav-cta', href: 'mon-espace.html', 'aria-current': active === 'account' ? 'page' : null }, 'Mon espace')
           : h('a', { class: 'nav-cta', href: 'connexion.html', 'aria-current': active === 'login' ? 'page' : null }, 'Connexion'));
  }
  const nav = h('nav', { id: 'site-nav', class: 'site-nav', 'aria-label': 'Navigation principale' }, links);
  const toggle = h('button', { class: 'nav-toggle', type: 'button', 'aria-expanded': 'false', 'aria-controls': 'site-nav', 'aria-label': 'Ouvrir le menu' },
    h('span', { class: 'nav-toggle-bars', 'aria-hidden': 'true' }));
  const setOpen = (open) => {
    toggle.setAttribute('aria-expanded', String(open));
    toggle.setAttribute('aria-label', open ? 'Fermer le menu' : 'Ouvrir le menu');
    if (open) nav.setAttribute('data-open', 'true'); else nav.removeAttribute('data-open');
  };
  toggle.addEventListener('click', () => setOpen(toggle.getAttribute('aria-expanded') !== 'true'));
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') setOpen(false); });
  nav.addEventListener('click', (e) => { if (e.target.closest('a')) setOpen(false); });

  const notice = isDemo()
    ? h('div', { class: 'notice-bar', role: 'note' }, h('div', { class: 'container' }, 'Mode démonstration : les outils affichés sont fictifs et aucune commande ni aucun message n\'est enregistré. ', h('a', { href: `${location.pathname}?demo=0` }, 'Quitter le mode démo')))
    : !isConfigured()
      ? h('div', { class: 'notice-bar', role: 'note' }, h('div', { class: 'container' }, 'Base de données non configurée (js/config.js). Ajoutez ?demo=1 à l\'adresse pour voir un aperçu avec des données fictives.'))
      : null;

  replaceContent(el, notice, h('header', { class: 'site-header' },
    h('div', { class: 'container header-inner' },
      h('a', { class: 'brand', href: 'index.html' }, h('span', { class: 'brand-mark', 'aria-hidden': 'true' }, brandMark(settings.site_name)), h('span', { class: 'brand-name' }, settings.site_name)),
      toggle, nav)));
}

function renderFooter(el, settings) {
  const wa = whatsappUrl(settings.whatsapp_number), mail = mailUrl(settings.contact_email);
  replaceContent(el, h('footer', { class: 'site-footer' },
    h('div', { class: 'container' },
      h('div', { class: 'footer-grid' },
        h('div', { class: 'footer-about' }, h('a', { class: 'brand', href: 'index.html' }, h('span', { class: 'brand-mark', 'aria-hidden': 'true' }, brandMark(settings.site_name)), h('span', { class: 'brand-name' }, settings.site_name)),
          h('p', {}, settings.footer_text)),
        h('div', {}, h('h2', {}, 'Navigation'), h('ul', {}, NAV.map((n) => h('li', {}, h('a', { href: n.href }, n.label))))),
        h('div', {}, h('h2', {}, 'Contact'), h('ul', {},
          wa ? h('li', {}, h('a', { href: wa, rel: 'noopener', target: '_blank' }, 'WhatsApp')) : null,
          mail ? h('li', {}, h('a', { href: mail }, settings.contact_email)) : null,
          h('li', {}, h('a', { href: 'contact.html' }, 'Formulaire de contact'))))),
      h('div', { class: 'footer-bottom' }, `© ${new Date().getFullYear()} ${settings.site_name}`))));
}

// Lance le chargement des réglages et affiche en-tête/pied dès qu'ils sont prêts.
// Retourne une promesse des réglages (utile pour le titre de la page).
export function loadChrome(active) {
  const header = $('#site-header'), footer = $('#site-footer');
  return Promise.all([fetchSettings(), currentUser()]).then(([settings, user]) => {
    if (header) renderHeader(header, active, settings, user);
    if (footer) renderFooter(footer, settings);
    return settings;
  }).catch(() => {
    const s = { ...DEFAULT_SETTINGS };
    if (header) renderHeader(header, active, s, null);
    if (footer) renderFooter(footer, s);
    return s;
  });
}
