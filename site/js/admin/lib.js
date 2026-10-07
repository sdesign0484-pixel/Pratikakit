// Outils partagés de l'administration : accès base, messages d'erreur, tableaux, formulaires, fenêtres.
// RÈGLE : aucun texte venant de la base n'est inséré avec innerHTML (toujours textContent).
import { getClient } from '../api.js';
import { h, $, replaceContent } from '../ui.js';

export { h, $, replaceContent };
export const sb = () => getClient();

/* ---------- Erreurs lisibles ---------- */
const CODE_TEXT = {
  FORBIDDEN: "Action refusée : cette opération est réservée à l'administrateur connecté avec la double authentification.",
  ORDER_NOT_FOUND: 'Commande introuvable.',
  ORDER_NOT_PAYABLE: "Cette commande n'est plus en attente de paiement (déjà payée ou annulée).",
  INVALID_INPUT: 'Valeur refusée (vous ne pouvez pas, par exemple, suspendre votre propre compte).',
  NOT_FOUND: 'Élément introuvable.',
  RATE_LIMITED: 'Trop de demandes en peu de temps. Réessayez dans un instant.',
};
export function friendly(err) {
  const msg = String((err && err.message) || err || '');
  const code = (err && err.code) || '';
  for (const k of Object.keys(CODE_TEXT)) if (msg === k) return CODE_TEXT[k];
  if (code === '23505') {
    if (msg.includes('payments_txref_unique')) return 'Cette référence de transaction a déjà servi à valider un autre paiement.';
    if (msg.includes('slug')) return 'Cet identifiant (slug) est déjà utilisé.';
    if (msg.includes('entitlements')) return 'Ce client a déjà un accès à cet outil.';
    return 'Cette valeur existe déjà.';
  }
  if (code === '23514') {
    if (msg.includes('slug')) return "Identifiant invalide : lettres minuscules, chiffres et tirets seulement (ex. suivi-tresorerie).";
    if (msg.includes('external_url')) return 'Le lien externe doit commencer par https://';
    if (msg.includes('image_url')) return "L'adresse de l'image doit commencer par https://";
    if (msg.includes('html_content')) return 'Fichier trop volumineux (5 Mo maximum).';
    return 'Une valeur est refusée par la base (format incorrect).';
  }
  if (code === '42501' || /row-level security|permission denied/i.test(msg)) {
    return "Action refusée : votre session n'a pas les droits d'administration (double authentification requise). Reconnectez-vous.";
  }
  if (!code && /fetch|network|load failed/i.test(msg)) return 'Connexion impossible. Vérifiez votre réseau puis réessayez.';
  return `Erreur : ${msg || 'inconnue'}`;
}

// Exécute une requête Supabase et lève une erreur lisible (pas de relance automatique : message immédiat).
export async function exec(builder) {
  if (builder && typeof builder.retry === 'function') builder = builder.retry(false);
  let res;
  try { res = await builder; } catch (e) { const x = new Error(friendly(e)); x.raw = e; throw x; }
  if (res.error) { const x = new Error(friendly(res.error)); x.raw = res.error; throw x; }
  return res;
}

export async function fetchAll(table, select, orderCol = 'id') {
  const out = [];
  for (let from = 0; ; from += 1000) {
    const { data } = await exec(sb().from(table).select(select).order(orderCol).range(from, from + 999));
    out.push(...data);
    if (data.length < 1000) break;
  }
  return out;
}

/* ---------- Formats ---------- */
export const fmtDate = (iso) => (iso ? new Date(iso).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—');
export const fmtDay = (iso) => (iso ? new Date(iso).toLocaleDateString('fr-FR') : '—');
export const fmtAmount = (n) => `${new Intl.NumberFormat('fr-FR').format(n || 0).replace(/\u202f/g, '\u00a0')}\u00a0Ar`;
export const fmtKb = (bytes) => `${Math.max(1, Math.round(bytes / 1024))} Ko`;
export const slugify = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);
export const lines = (text) => String(text || '').split('\n').map((x) => x.trim()).filter(Boolean);

export const ORDER_STATUS = {
  awaiting_payment: { label: 'En attente de paiement', cls: 'badge-soon' },
  paid: { label: 'Payée', cls: 'badge-ok' },
  cancelled: { label: 'Annulée', cls: 'badge-off' },
};
export const ACCESS_STATE = {
  active: { label: 'Actif', cls: 'badge-ok' },
  expired: { label: 'Expiré', cls: 'badge-off' },
  revoked: { label: 'Révoqué', cls: 'badge-off' },
  not_started: { label: 'Pas encore actif', cls: 'badge-soon' },
};
export const METHODS = { mvola: 'MVola', orange_money: 'Orange Money', airtel_money: 'Airtel Money', autre: 'Autre' };
export const SOURCES = { purchase: 'Achat', free: 'Gratuit', manual: 'Attribué manuellement' };
export const badge = (map, key) => { const s = map[key] || { label: key, cls: '' }; return h('span', { class: `badge ${s.cls}` }, s.label); };
export function accessState(e) {
  if (e.status === 'revoked') return 'revoked';
  if (new Date(e.starts_at) > new Date()) return 'not_started';
  if (e.expires_at && new Date(e.expires_at) <= new Date()) return 'expired';
  return 'active';
}

/* ---------- Notifications et fenêtres ---------- */
export function toast(message, kind = 'ok') {
  const el = h('div', { class: `toast toast-${kind}` }, message);
  $('#toasts').append(el);
  setTimeout(() => el.remove(), kind === 'error' ? 9000 : 3500);
}

export function openDialog({ title, body, wide = false }) {
  const dlg = h('dialog', { class: wide ? 'dialog dialog-wide' : 'dialog', 'aria-labelledby': 'dlg-title' },
    h('div', { class: 'dialog-head' },
      h('h2', { id: 'dlg-title' }, title),
      h('button', { class: 'btn btn-ghost btn-sm', type: 'button', onclick: () => dlg.close() }, 'Fermer')),
    h('div', { class: 'dialog-body' }, body));
  dlg.addEventListener('close', () => dlg.remove());
  document.body.append(dlg);
  dlg.showModal();
  return dlg;
}

export function confirmDialog({ title, text, confirmLabel = 'Confirmer', danger = false }) {
  return new Promise((resolve) => {
    let answer = false;
    const dlg = openDialog({
      title,
      body: [h('p', { class: 'muted' }, text), h('div', { class: 'actions dialog-actions' },
        h('button', { class: 'btn btn-ghost', type: 'button', onclick: () => dlg.close() }, 'Annuler'),
        h('button', { class: danger ? 'btn btn-danger' : 'btn btn-primary', type: 'button', 'data-confirm': 'yes', onclick: () => { answer = true; dlg.close(); } }, confirmLabel))],
    });
    dlg.addEventListener('close', () => resolve(answer));
  });
}

/* ---------- Formulaires (partagés avec le site public) ---------- */
export { field, checkbox } from '../forms.js';

/* ---------- Tableaux ---------- */
export function table(columns, rows, { empty = 'Aucun résultat.' } = {}) {
  if (!rows.length) return h('p', { class: 'empty-line' }, empty);
  return h('div', { class: 'table-wrap' }, h('table', { class: 'table' },
    h('thead', {}, h('tr', {}, columns.map((c) => h('th', { scope: 'col' }, c.label)))),
    h('tbody', {}, rows.map((r) => h('tr', {}, columns.map((c) => h('td', { 'data-label': c.label }, h('div', { class: 'cell' }, c.render(r)))))))));
}

export const viewHead = (title, ...actions) => h('div', { class: 'view-head' }, h('h1', {}, title), h('div', { class: 'actions' }, actions));
export const normalize = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
export const errorBox = (err, retry) => h('div', { class: 'state is-error', role: 'alert' }, h('h2', {}, 'Impossible de charger cette section'), h('p', {}, err.message), retry ? h('button', { class: 'btn btn-ghost', type: 'button', onclick: retry }, 'Réessayer') : null);
export const loading = () => h('p', { class: 'muted', role: 'status' }, 'Chargement…');
