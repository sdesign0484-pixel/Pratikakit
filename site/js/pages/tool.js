import { fetchTool } from '../api.js';
import { CONFIG } from '../config.js';
import { $, h, loadChrome, loadingGrid, toolCard, toolVisual, toolUrl, emptyState, errorState, replaceContent, setMeta, formatPrice, accessLabel, statusBadge, cleanList } from '../ui.js';

const settingsP = loadChrome('catalogue');
const root = $('#tool-root');

function actionFor(tool) {
  const free = !tool.price_amount;
  if (tool.status === 'coming_soon') {
    return [h('button', { class: 'btn btn-primary btn-block', type: 'button', disabled: true }, 'Bientôt disponible'),
      h('p', { class: 'muted' }, "Cet outil n'est pas encore en vente.")];
  }
  if (tool.status !== 'available') {
    return [h('button', { class: 'btn btn-primary btn-block', type: 'button', disabled: true }, 'Indisponible'),
      h('p', { class: 'muted' }, 'Cet outil est temporairement indisponible.')];
  }
  if (CONFIG.FEATURES.auth) {
    const next = encodeURIComponent(toolUrl(tool));
    return [h('a', { class: 'btn btn-primary btn-block', href: `connexion.html?next=${next}` }, free ? "Se connecter pour l'obtenir" : 'Se connecter pour acheter')];
  }
  return [h('button', { class: 'btn btn-primary btn-block', type: 'button', disabled: true }, free ? 'Obtention bientôt ouverte' : 'Achat bientôt ouvert'),
    h('p', { class: 'alert alert-info' }, "La commande en ligne n'est pas encore ouverte. Pour en savoir plus, ", h('a', { href: 'contact.html' }, 'écrivez-nous'), '.')];
}

const listBlock = (title, items) => items.length
  ? h('section', { class: 'block' }, h('h2', {}, title), h('ul', { class: 'check-list' }, items.map((x) => h('li', {}, x))))
  : null;

function renderTool({ tool, category, related }) {
  const price = formatPrice(tool);
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
          actionFor(tool),
          h('dl', { class: 'facts' },
            h('div', {}, h('dt', {}, 'Accès'), h('dd', {}, accessLabel(tool.access_duration_days))),
            category ? h('div', {}, h('dt', {}, 'Catégorie'), h('dd', {}, category.name)) : null)))));
}

async function load() {
  const slug = new URLSearchParams(location.search).get('slug') || '';
  replaceContent(root, loadingGrid(1));
  if (!slug) return notFound();
  try {
    const result = await fetchTool(slug);
    if (!result.tool) return notFound();
    renderTool(result);
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
