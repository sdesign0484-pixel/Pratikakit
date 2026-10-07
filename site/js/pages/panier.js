import { isConfigured, isDemo, fetchToolsByIds } from '../api.js';
import { $, h, loadChrome, replaceContent, setMeta, toolUrl, formatPrice, emptyState, errorState, loadingGrid } from '../ui.js';
import { cart } from '../cart.js';
import { currentUser, loginUrl } from '../auth.js';
import { myTools, createOrder, shopMessage, isToken } from '../shop.js';

loadChrome('cart').then((s) => setMeta('Panier', '', s.site_name));
const root = $('#cart-root');
const MONEY = (n) => formatPrice({ price_amount: n, currency: 'MGA' }).text;

let drawId = 0;
async function draw() {
  const my = ++drawId;
  const ids = cart.ids();
  if (!isConfigured() || isDemo()) {
    replaceContent(root, emptyState({ title: 'Panier indisponible', text: isDemo() ? 'Mode démonstration : aucune commande possible.' : "Le site n'est pas encore relié à sa base de données (js/config.js)." }));
    return;
  }
  if (!ids.length) {
    replaceContent(root, emptyState({ title: 'Votre panier est vide', text: 'Ajoutez des outils depuis leur fiche pour les commander.', action: h('a', { class: 'btn btn-primary', href: 'catalogue.html' }, 'Parcourir le catalogue') }));
    return;
  }
  replaceContent(root, loadingGrid(1));
  let tools, user, owned = new Set();
  try {
    [tools, user] = await Promise.all([fetchToolsByIds(ids), currentUser()]);
    if (user) { try { (await myTools()).filter((r) => r.access_state === 'active' || r.access_state === 'not_started').forEach((r) => owned.add(r.tool_id)); } catch (_) { /* le serveur refusera de toute façon un doublon */ } }
  } catch (err) { if (my === drawId) replaceContent(root, errorState(err, draw)); return; }
  if (my !== drawId) return;   // un affichage plus récent a pris le relais

  const byId = new Map(tools.map((t) => [t.id, t]));
  // Outils retirés du catalogue depuis l'ajout : on nettoie le panier sans bruit.
  const gone = ids.filter((id) => !byId.has(id));
  if (gone.length) cart.removeMany(gone);

  const lines = tools.map((t) => {
    let problem = null;
    if (owned.has(t.id)) problem = 'Déjà dans vos outils : retirez-le du panier.';
    else if (t.status !== 'available') problem = t.status === 'coming_soon' ? "Pas encore en vente." : 'Momentanément indisponible.';
    else if (!t.price_amount) problem = 'Cet outil est gratuit : obtenez-le directement depuis sa fiche.';
    return { t, problem };
  });
  const orderable = lines.filter((l) => !l.problem);
  const total = orderable.reduce((n, l) => n + l.t.price_amount, 0);
  if (!lines.length) { draw(); return; }

  const status = h('div', { 'aria-live': 'polite' });
  let action;
  if (!orderable.length) action = h('p', { class: 'muted' }, "Aucun outil de votre panier ne peut être commandé pour le moment.");
  else if (!user) action = h('a', { class: 'btn btn-primary btn-block', href: loginUrl('panier.html') }, 'Se connecter pour commander');
  else {
    action = h('button', { class: 'btn btn-primary btn-block', type: 'button' }, 'Passer la commande');
    action.addEventListener('click', async () => {
      replaceContent(status); action.disabled = true; action.textContent = 'Création de la commande…';
      try {
        const ref = await createOrder(orderable.map((l) => l.t.id));
        cart.removeMany(orderable.map((l) => l.t.id));
        location.assign(`commande.html?ref=${encodeURIComponent(ref)}`);
      } catch (err) {
        action.disabled = false; action.textContent = 'Passer la commande';
        replaceContent(status, h('p', { class: 'alert alert-error', role: 'alert' }, shopMessage(err)));
        if (isToken(err, 'ALREADY_OWNED') || isToken(err, 'TOOL_NOT_PURCHASABLE')) setTimeout(draw, 1500);
      }
    });
  }

  replaceContent(root,
    h('ul', { class: 'line-list' }, lines.map(({ t, problem }) => {
      const price = formatPrice(t);
      return h('li', {}, h('div', { class: 'line-item' },
        h('div', { class: 'name' }, h('a', { href: toolUrl(t) }, t.name)),
        h('strong', { class: price.free ? 'price free' : 'price' }, price.text),
        h('button', { class: 'btn btn-ghost btn-sm remove', type: 'button', 'aria-label': `Retirer ${t.name} du panier`, onclick: () => { cart.remove(t.id); draw(); } }, 'Retirer'),
        problem ? h('p', { class: 'sub' }, problem) : null));
    })),
    h('div', { class: 'summary' },
      h('div', { class: 'total' }, h('span', {}, 'Total à payer'), h('strong', {}, MONEY(total))),
      h('p', { class: 'muted' }, "Le montant est recalculé par le serveur à la commande. Vous réglez ensuite par Mobile Money : l'accès est activé dès que votre paiement est vérifié."),
      status, action));
}
window.addEventListener('storage', draw);
draw();
