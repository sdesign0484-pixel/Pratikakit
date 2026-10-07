import { isConfigured, isDemo } from '../api.js';
import { $, h, loadChrome, replaceContent, setMeta, formatPrice, formatDate, badgeOf, ORDER_STATUS, emptyState, errorState, loadingGrid, whatsappUrl } from '../ui.js';
import { currentUser, loginUrl } from '../auth.js';
import { orderByRef } from '../shop.js';

const settingsP = loadChrome('account');
settingsP.then((s) => setMeta('Commande', '', s.site_name));
const root = $('#order-root');
const ref = new URLSearchParams(location.search).get('ref') || '';
const MONEY = (n) => formatPrice({ price_amount: n, currency: 'MGA' }).text;

async function draw() {
  if (!isConfigured() || isDemo()) { replaceContent(root, emptyState({ title: 'Commande indisponible', text: isDemo() ? 'Mode démonstration.' : "Le site n'est pas encore relié à sa base de données (js/config.js)." })); return; }
  if (!/^CMD-[0-9A-F]{8}$/.test(ref)) { replaceContent(root, emptyState({ title: 'Commande introuvable', text: "Cette référence n'est pas valide.", action: h('a', { class: 'btn btn-primary', href: 'mon-espace.html#commandes' }, 'Mes commandes') })); return; }
  const user = await currentUser();
  if (!user) { location.replace(loginUrl(`commande.html?ref=${ref}`)); return; }
  replaceContent(root, loadingGrid(1));
  let order, settings;
  try { [order, settings] = await Promise.all([orderByRef(ref), settingsP]); } catch (err) { replaceContent(root, errorState(err, draw)); return; }
  if (!order) { replaceContent(root, emptyState({ title: 'Commande introuvable', text: "Cette commande n'existe pas ou ne vous appartient pas.", action: h('a', { class: 'btn btn-primary', href: 'mon-espace.html#commandes' }, 'Mes commandes') })); return; }

  const items = h('ul', { class: 'line-list' }, order.order_items.map((i) => h('li', {}, h('div', { class: 'line-item' },
    h('div', { class: 'name' }, i.tools ? i.tools.name : '(outil retiré du catalogue)'), h('strong', { class: 'price' }, MONEY(i.unit_price)), h('span', {})))));
  const head = h('div', { class: 'view-head-public' },
    h('p', { class: 'muted' }, `Commande du ${formatDate(order.created_at)}`), h('div', { class: 'ref-code', 'aria-label': 'Référence de la commande' }, order.reference), h('div', {}, badgeOf(ORDER_STATUS, order.status)));
  const total = h('div', { class: 'summary' }, h('div', { class: 'total' }, h('span', {}, 'Total'), h('strong', {}, MONEY(order.total_amount))));
  const blocks = [head, items, total];

  if (order.status === 'awaiting_payment') {
    const wa = whatsappUrl(settings.whatsapp_number);
    const text = `Bonjour, je viens de payer la commande ${order.reference} (${MONEY(order.total_amount)}). Voici ma preuve de paiement.`;
    const pay = settings.payment_instructions
      ? h('div', {}, h('h3', {}, 'Où payer'), h('p', { class: 'pre-wrap' }, settings.payment_instructions))
      : h('p', { class: 'alert alert-info' }, ["Les numéros de paiement ne sont pas encore affichés. ", h('a', { href: `contact.html?sujet=${encodeURIComponent(`Paiement ${order.reference}`)}` }, 'Contactez-nous'), ' pour les obtenir.']);
    blocks.push(h('section', { class: 'pay-box' }, h('h2', {}, 'Comment payer'),
      h('ol', { class: 'num-list' },
        h('li', {}, `Envoyez ${MONEY(order.total_amount)} par Mobile Money (MVola, Orange Money ou Airtel Money) selon les indications ci-dessous.`),
        h('li', {}, `Notez la référence ${order.reference} dans votre transfert si l'opérateur le permet.`),
        h('li', {}, 'Envoyez-nous la preuve (capture d\'écran ou numéro de transaction) par WhatsApp ou message privé, en précisant la référence. Ce n\'est pas obligatoire sur le site.'),
        h('li', {}, "Dès que nous avons vérifié la réception, l'accès est activé et l'outil apparaît dans « Mon espace ».")),
      pay,
      h('div', { class: 'actions' },
        wa ? h('a', { class: 'btn btn-primary', href: `${wa}?text=${encodeURIComponent(text)}`, target: '_blank', rel: 'noopener' }, 'Envoyer la preuve sur WhatsApp') : null,
        h('a', { class: wa ? 'btn btn-ghost' : 'btn btn-primary', href: `contact.html?sujet=${encodeURIComponent(`Paiement ${order.reference}`)}` }, 'Nous écrire'),
        h('a', { class: 'btn btn-ghost', href: 'mon-espace.html#commandes' }, 'Mes commandes')),
      h('p', { class: 'muted' }, "Votre commande reste « en attente » tant que le paiement n'est pas vérifié : aucun accès n'est donné avant.")));
  } else if (order.status === 'paid') {
    blocks.push(h('div', { class: 'pay-box' }, h('p', { class: 'alert alert-success', role: 'status' }, 'Paiement confirmé : vos outils sont disponibles.'), h('div', { class: 'actions' }, h('a', { class: 'btn btn-primary', href: 'mon-espace.html#applications' }, 'Ouvrir mes applications'))));
  } else {
    blocks.push(h('div', { class: 'pay-box' }, h('p', { class: 'alert alert-info' }, 'Cette commande a été annulée. Vous pouvez en créer une nouvelle depuis le catalogue.'), h('div', { class: 'actions' }, h('a', { class: 'btn btn-primary', href: 'catalogue.html' }, 'Parcourir le catalogue'))));
  }
  replaceContent(root, blocks);
}
draw();
