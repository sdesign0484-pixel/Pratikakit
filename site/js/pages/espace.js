import { getClient, isConfigured, isDemo } from '../api.js';
import { $, h, loadChrome, replaceContent, setMeta, toolUrl, formatDate, formatPrice, badgeOf, ORDER_STATUS, ACCESS_STATE, SOURCE_LABEL, emptyState, errorState, loadingGrid } from '../ui.js';
import { field } from '../forms.js';
import { currentUser, loginUrl, signOut, authMessage } from '../auth.js';
import { myTools, myOrders, getProfile, updateProfile, shopMessage } from '../shop.js';
import { launchTool } from '../launch.js';

const settingsP = loadChrome('account');
settingsP.then((s) => setMeta('Mon espace', '', s.site_name));
const root = $('#space-root');
const TABS = [['applications', 'Mes applications'], ['commandes', 'Mes commandes'], ['profil', 'Mon profil']];
let user = null;
const added = new URLSearchParams(location.search).get('added') === '1';
const MONEY = (n) => formatPrice({ price_amount: n, currency: 'MGA' }).text;
const METHOD = { mvola: 'MVola', orange_money: 'Orange Money', airtel_money: 'Airtel Money', autre: 'autre moyen' };

function appCard(t) {
  const price = null;
  const meta = [h('span', {}, SOURCE_LABEL[t.source] || t.source),
    h('span', {}, t.access_state === 'not_started' ? `À partir du ${formatDate(t.starts_at)}` : `Depuis le ${formatDate(t.starts_at)}`),
    h('span', {}, t.expires_at ? `Expire le ${formatDate(t.expires_at)}` : 'Accès permanent'),
    badgeOf(ACCESS_STATE, t.access_state)];
  const msg = h('div', { 'aria-live': 'polite' });
  const actions = [];
  if (t.access_state === 'active' && t.tool_status === 'available') {
    const btn = h('button', { class: 'btn btn-primary', type: 'button' }, "Utiliser l'outil");
    btn.addEventListener('click', async () => {
      replaceContent(msg); btn.disabled = true;
      await launchTool(t, (text) => replaceContent(msg, h('p', { class: 'alert alert-error', role: 'alert' }, text)));
      btn.disabled = false;
    });
    actions.push(btn);
  } else if (t.access_state === 'active') {
    actions.push(h('p', { class: 'note' }, 'Outil momentanément indisponible. Revenez un peu plus tard.'));
  } else if (t.access_state === 'expired') {
    actions.push(h('p', { class: 'note' }, `Accès expiré le ${formatDate(t.expires_at)}.`), h('a', { class: 'btn btn-ghost btn-sm', href: toolUrl(t) }, 'Commander à nouveau'));
  } else if (t.access_state === 'revoked') {
    actions.push(h('p', { class: 'note' }, 'Cet accès a été retiré.'), h('a', { class: 'btn btn-ghost btn-sm', href: 'contact.html' }, 'Nous contacter'));
  } else {
    actions.push(h('p', { class: 'note' }, `Disponible à partir du ${formatDate(t.starts_at)}.`));
  }
  return h('li', {}, h('article', { class: 'app-card' },
    h('div', {}, h('h3', {}, h('a', { href: toolUrl(t) }, t.name)), t.short_description ? h('p', { class: 'desc' }, t.short_description) : null, h('div', { class: 'meta' }, meta)),
    h('div', { class: 'app-actions' }, actions, msg)));
}

async function tabApplications(box) {
  replaceContent(box, loadingGrid(2));
  let rows;
  try { rows = await myTools(); } catch (err) { replaceContent(box, errorState(err, () => tabApplications(box))); return; }
  const banner = added ? h('p', { class: 'alert alert-success', role: 'status' }, 'Outil ajouté à vos applications.') : null;
  if (!rows.length) {
    replaceContent(box, banner, emptyState({ title: "Vous n'avez pas encore d'outil", text: 'Les outils que vous achetez ou obtenez gratuitement apparaissent ici.', action: h('a', { class: 'btn btn-primary', href: 'catalogue.html' }, 'Parcourir le catalogue') }));
    return;
  }
  replaceContent(box, banner, h('ul', { class: 'app-list' }, rows.map(appCard)));
}

async function tabOrders(box) {
  replaceContent(box, loadingGrid(2));
  let rows;
  try { rows = await myOrders(); } catch (err) { replaceContent(box, errorState(err, () => tabOrders(box))); return; }
  if (!rows.length) { replaceContent(box, emptyState({ title: "Aucune commande pour l'instant", text: 'Vos commandes apparaîtront ici avec leur état de paiement.', action: h('a', { class: 'btn btn-primary', href: 'catalogue.html' }, 'Parcourir le catalogue') })); return; }
  replaceContent(box, h('ul', { class: 'line-list' }, rows.map((o) => h('li', {}, h('div', { class: 'line-item' },
    h('div', {}, h('div', { class: 'name mono' }, o.reference), h('div', { class: 'muted' }, `${formatDate(o.created_at)} · ${o.order_items.map((i) => (i.tools ? i.tools.name : '(outil retiré)')).join(', ')}`)),
    h('strong', {}, MONEY(o.total_amount)),
    h('div', { class: 'app-actions' }, badgeOf(ORDER_STATUS, o.status),
      o.payments.length ? h('span', { class: 'note' }, `Payée via ${METHOD[o.payments[0].method] || o.payments[0].method}`) : null,
      o.status === 'awaiting_payment' ? h('a', { class: 'btn btn-ghost btn-sm', href: `commande.html?ref=${encodeURIComponent(o.reference)}` }, 'Voir comment payer') : null))))));
}

async function tabProfile(box) {
  replaceContent(box, h('p', { class: 'muted', role: 'status' }, 'Chargement…'));
  let prof;
  try { prof = await getProfile(user.id); } catch (err) { replaceContent(box, errorState(err, () => tabProfile(box))); return; }
  prof = prof || { full_name: '', phone: '', email: user.email };
  const F = {
    name: field({ id: 'p-name', label: 'Nom complet', value: prof.full_name, maxlength: 120, required: true, autocomplete: 'name' }),
    phone: field({ id: 'p-phone', label: 'Téléphone', type: 'tel', value: prof.phone || '', maxlength: 20, required: true, autocomplete: 'tel', hint: 'Le numéro avec lequel vous payez en Mobile Money.' }),
  };
  const pstatus = h('div', { 'aria-live': 'polite' });
  const pbtn = h('button', { class: 'btn btn-primary', type: 'submit' }, 'Enregistrer');
  const pform = h('form', { class: 'form narrow', novalidate: true },
    h('div', { class: 'field' }, h('label', {}, 'Adresse e-mail'), h('p', {}, prof.email || user.email), h('p', { class: 'hint' }, "L'adresse e-mail ne peut pas être modifiée ici.")),
    F.name.el, F.phone.el, pstatus, h('div', {}, pbtn));
  pform.addEventListener('submit', async (ev) => {
    ev.preventDefault(); replaceContent(pstatus); F.name.error(''); F.phone.error('');
    const name = F.name.input.value.trim(), phone = F.phone.input.value.trim();
    if (!name) { F.name.error('Indiquez votre nom complet.'); F.name.input.focus(); return; }
    if (!/^\+?[0-9 ]{8,20}$/.test(phone)) { F.phone.error('Numéro invalide : 8 à 20 chiffres (espaces et « + » acceptés).'); F.phone.input.focus(); return; }
    pbtn.disabled = true;
    try { await updateProfile(user.id, { full_name: name, phone }); replaceContent(pstatus, h('p', { class: 'alert alert-success', role: 'status' }, 'Profil enregistré.')); }
    catch (err) { replaceContent(pstatus, h('p', { class: 'alert alert-error', role: 'alert' }, shopMessage(err))); }
    pbtn.disabled = false;
  });

  const W = {
    pass: field({ id: 'w-pass', label: 'Nouveau mot de passe', type: 'password', autocomplete: 'new-password', reveal: true, hint: '8 caractères minimum.' }),
    confirm: field({ id: 'w-confirm', label: 'Confirmer le nouveau mot de passe', type: 'password', autocomplete: 'new-password', reveal: true }),
  };
  const wstatus = h('div', { 'aria-live': 'polite' });
  const wbtn = h('button', { class: 'btn btn-ghost', type: 'submit' }, 'Changer le mot de passe');
  const wform = h('form', { class: 'form narrow', novalidate: true }, W.pass.el, W.confirm.el, wstatus, h('div', {}, wbtn));
  wform.addEventListener('submit', async (ev) => {
    ev.preventDefault(); replaceContent(wstatus); W.pass.error(''); W.confirm.error('');
    if (W.pass.input.value.length < 8) { W.pass.error('8 caractères minimum.'); W.pass.input.focus(); return; }
    if (W.confirm.input.value !== W.pass.input.value) { W.confirm.error('Les deux mots de passe ne sont pas identiques.'); W.confirm.input.focus(); return; }
    wbtn.disabled = true;
    const { error } = await getClient().auth.updateUser({ password: W.pass.input.value });
    wbtn.disabled = false;
    if (error) { replaceContent(wstatus, h('p', { class: 'alert alert-error', role: 'alert' }, authMessage(error))); return; }
    wform.reset(); replaceContent(wstatus, h('p', { class: 'alert alert-success', role: 'status' }, 'Mot de passe modifié.'));
  });
  replaceContent(box, h('section', { class: 'panel-block' }, h('h2', {}, 'Mes informations'), pform),
    h('section', { class: 'panel-block' }, h('h2', {}, 'Mot de passe'), wform),
    h('div', { class: 'actions' }, h('button', { class: 'btn btn-ghost', type: 'button', onclick: async () => { await signOut(); location.assign('index.html'); } }, 'Se déconnecter')));
}

function draw() {
  const key = TABS.some(([k]) => k === location.hash.slice(1)) ? location.hash.slice(1) : 'applications';
  const box = h('div', {});
  replaceContent(root,
    h('nav', { class: 'tabs', 'aria-label': 'Sections de mon espace' }, TABS.map(([k, l]) => h('a', { href: `#${k}`, 'aria-current': k === key ? 'page' : null }, l))),
    box);
  ({ applications: tabApplications, commandes: tabOrders, profil: tabProfile })[key](box);
}

(async () => {
  if (!isConfigured() || isDemo()) {
    replaceContent(root, emptyState({ title: 'Espace client indisponible', text: isDemo() ? 'Mode démonstration : aucun compte client.' : "Le site n'est pas encore relié à sa base de données (js/config.js)." }));
    return;
  }
  user = await currentUser();
  if (!user) { location.replace(loginUrl('mon-espace.html')); return; }
  window.addEventListener('hashchange', draw);
  draw();
})();
