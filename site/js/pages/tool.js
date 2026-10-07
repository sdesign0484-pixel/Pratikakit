import { fetchTool, isConfigured, isDemo } from '../api.js';
import { CONFIG } from '../config.js';
import { cart } from '../cart.js';
import { currentUser, loginUrl } from '../auth.js';
import { myTools, claimFree, shopMessage } from '../shop.js';
import { $, h, loadChrome, loadingGrid, toolCard, toolVisual, toolUrl, emptyState, errorState, replaceContent, setMeta, formatPrice, accessLabel, statusBadge, cleanList } from '../ui.js';

const settingsP = loadChrome('catalogue');
const root = $('#tool-root');

// ctx : { user, mine } — mine = ligne de my_tools() pour cet outil (ou null)
function actionFor(tool, ctx, redraw) {
  const free = !tool.price_amount;
  const disabled = (label) => h('button', { class: 'btn btn-primary btn-block', type: 'button', disabled: true }, label);
  if (tool.status === 'coming_soon') return [disabled('Bientôt disponible'), h('p', { class: 'muted' }, "Cet outil n'est pas encore en vente.")];
  if (tool.status !== 'available') return [disabled('Indisponible'), h('p', { class: 'muted' }, 'Cet outil est temporairement indisponible.')];
  if (isDemo()) return [disabled(free ? 'Obtention indisponible' : 'Achat indisponible'), h('p', { class: 'alert alert-info' }, "Mode démonstration : aucune commande n'est possible.")];
  if (!CONFIG.FEATURES.auth || !isConfigured()) {
    return [disabled(free ? 'Obtention bientôt ouverte' : 'Achat bientôt ouvert'),
      h('p', { class: 'alert alert-info' }, "La commande en ligne n'est pas encore ouverte. Pour en savoir plus, ", h('a', { href: 'contact.html' }, 'écrivez-nous'), '.')];
  }
  const mine = ctx.mine;
  if (mine && (mine.access_state === 'active' || mine.access_state === 'not_started')) {
    return [h('p', { class: 'alert alert-success', role: 'status' }, mine.access_state === 'active' ? 'Vous avez déjà cet outil.' : "Votre accès sera actif bientôt."),
      h('a', { class: 'btn btn-primary btn-block', href: 'mon-espace.html#applications' }, 'Ouvrir mes applications')];
  }
  const note = mine && mine.access_state === 'revoked' ? h('p', { class: 'alert alert-error' }, ['Votre accès à cet outil a été retiré. ', h('a', { href: 'contact.html' }, 'Contactez-nous'), '.'])
    : mine && mine.access_state === 'expired' ? h('p', { class: 'alert alert-info' }, 'Votre accès précédent a expiré : vous pouvez commander cet outil à nouveau.') : null;
  if (mine && mine.access_state === 'revoked') return [note];
  const out = [];
  if (free) {
    if (!ctx.user) return [h('a', { class: 'btn btn-primary btn-block', href: loginUrl(toolUrl(tool)) }, "Se connecter pour l'obtenir")];
    const msg = h('div', { 'aria-live': 'polite' });
    const btn = h('button', { class: 'btn btn-primary btn-block', type: 'button' }, 'Obtenir gratuitement');
    btn.addEventListener('click', async () => {
      btn.disabled = true; replaceContent(msg);
      try { await claimFree(tool.id); location.assign('mon-espace.html?added=1#applications'); }
      catch (err) { btn.disabled = false; replaceContent(msg, h('p', { class: 'alert alert-error', role: 'alert' }, shopMessage(err))); }
    });
    return [note, btn, msg];
  }
  if (cart.has(tool.id)) out.push(h('p', { class: 'alert alert-success', role: 'status' }, 'Cet outil est dans votre panier.'), h('a', { class: 'btn btn-primary btn-block', href: 'panier.html' }, 'Voir le panier'));
  else {
    const btn = h('button', { class: 'btn btn-primary btn-block', type: 'button' }, 'Ajouter au panier');
    btn.addEventListener('click', () => { cart.add(tool.id); redraw(); });
    out.push(btn, h('p', { class: 'muted' }, 'Vous payez ensuite par Mobile Money ; l\'accès est activé après vérification de votre paiement.'));
  }
  return [note, out];
}

const listBlock = (title, items) => items.length
  ? h('section', { class: 'block' }, h('h2', {}, title), h('ul', { class: 'check-list' }, items.map((x) => h('li', {}, x))))
  : null;

function renderTool({ tool, category, related }, ctx) {
  const price = formatPrice(tool);
  const actionBox = h('div', { class: 'stack-sm' });
  const redraw = () => replaceContent(actionBox, actionFor(tool, ctx, redraw));
  redraw();
  // Image en grand seulement si l'outil en a une (pas de grand bloc décoratif sinon)
  const heroBox = h('div', { class: 'tool-hero-visual' });
  const heroImg = toolVisual(tool, { onFail: () => heroBox.remove() });
  if (heroImg) heroBox.append(heroImg);
  const hero = heroImg ? heroBox : null;
  const paragraphs = String(tool.long_description || '').split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  replaceContent(root,
    h('nav', { class: 'breadcrumb', 'aria-label': "Fil d'Ariane" }, h('ol', {},
      h('li', {}, h('a', { href: 'index.html' }, 'Accueil')),
      h('li', {}, h('a', { href: 'catalogue.html' }, 'Catalogue')),
      category ? h('li', {}, h('a', { href: `catalogue.html?cat=${encodeURIComponent(category.slug)}` }, category.name)) : null,
      h('li', { 'aria-current': 'page' }, tool.name))),
    h('div', { class: 'tool-layout' },
      h('div', {},
        h('div', { class: 'tool-head' },
          category ? h('p', { class: 'tool-cat' }, category.name) : null,
          h('h1', {}, tool.name),
          tool.short_description ? h('p', { class: 'lead' }, tool.short_description) : null),
        hero,
        paragraphs.length ? h('section', { class: 'block' }, h('h2', {}, 'Présentation'), h('div', { class: 'prose' }, paragraphs.map((p) => h('p', {}, p)))) : null,
        listBlock('Problèmes résolus', cleanList(tool.problems_solved)),
        listBlock('Fonctionnalités', cleanList(tool.features)),
        related.length ? h('section', { class: 'block' }, h('h2', {}, 'Dans la même catégorie'),
          h('ul', { class: 'tool-grid' }, related.map((t) => toolCard(t, category && category.name)))) : null),
      h('aside', { 'aria-label': "Acheter ou obtenir l'outil" },
        h('div', { class: 'buy-panel' },
          h('p', { class: price.free ? 'price free' : 'price' }, price.text),
          h('div', {}, statusBadge(tool.status)),
          actionBox,
          h('dl', { class: 'facts' },
            h('div', {}, h('dt', {}, 'Accès'), h('dd', {}, accessLabel(tool.access_duration_days))),
            category ? h('div', {}, h('dt', {}, 'Catégorie'), h('dd', {}, category.name)) : null)))));
}

async function load() {
  const slug = new URLSearchParams(location.search).get('slug') || '';
  replaceContent(root, loadingGrid(1));
  if (!slug) return notFound();
  try {
    const [result, user] = await Promise.all([fetchTool(slug), currentUser()]);
    if (!result.tool) return notFound();
    let mine = null;
    if (user) { try { mine = (await myTools()).find((r) => r.tool_id === result.tool.id) || null; } catch (_) { /* le serveur contrôle de toute façon les doublons */ } }
    renderTool(result, { user, mine });
    const s = await settingsP;
    setMeta(result.tool.name, result.tool.short_description, s.site_name);
  } catch (err) {
    replaceContent(root, h('div', { class: 'page-head' }), errorState(err, load));
  }
}

async function notFound() {
  const s = await settingsP;
  setMeta('Outil introuvable', '', s.site_name);
  replaceContent(root, h('div', { class: 'page-head' }),
    emptyState({
      title: 'Outil introuvable',
      text: "Cet outil n'existe pas ou n'est plus publié.",
      action: h('a', { class: 'btn btn-primary', href: 'catalogue.html' }, 'Voir le catalogue'),
    }));
}
load();
