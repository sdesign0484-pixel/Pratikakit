import { fetchCatalogue } from '../api.js';
import { $, h, loadChrome, loadingGrid, toolCard, emptyState, errorState, replaceContent, setMeta, normalize, cleanList } from '../ui.js';

const settingsP = loadChrome('catalogue');
settingsP.then((s) => setMeta('Catalogue', 'Tous les outils et applications, par catégorie.', s.site_name));

const chipsEl = $('#chips'), gridEl = $('#grid'), countEl = $('#result-count'), searchEl = $('#search');
const state = { cat: '', q: '' };
let data = { categories: [], tools: [] };

// Filtre pur : toutes les catégories/mots saisis doivent correspondre (nom, description,
// catégorie, fonctionnalités, problèmes résolus ; accents et majuscules ignorés).
export function filterTools(tools, categories, { cat, q }) {
  const catById = new Map(categories.map((c) => [c.id, c]));
  const terms = normalize(q).split(/\s+/).filter(Boolean);
  return tools.filter((t) => {
    const c = catById.get(t.category_id);
    if (cat && !(c && c.slug === cat)) return false;
    if (!terms.length) return true;
    const hay = normalize([t.name, t.short_description, c && c.name, ...cleanList(t.features), ...cleanList(t.problems_solved)].join(' '));
    return terms.every((w) => hay.includes(w));
  });
}

function syncUrl() {
  const p = new URLSearchParams();
  if (state.cat) p.set('cat', state.cat);
  if (state.q.trim()) p.set('q', state.q.trim());
  const qs = p.toString();
  history.replaceState(null, '', location.pathname + (qs ? `?${qs}` : ''));
}

function renderChips() {
  const catWithTools = data.categories
    .map((c) => ({ c, n: data.tools.filter((t) => t.category_id === c.id).length }))
    .filter((r) => r.n > 0);
  const chip = (label, slug) => h('button', {
    class: 'chip', type: 'button', 'aria-pressed': String(state.cat === slug),
    onclick: () => { state.cat = slug; render(); },
  }, label);
  replaceContent(chipsEl, chip(`Tous (${data.tools.length})`, ''), catWithTools.map(({ c, n }) => chip(`${c.name} (${n})`, c.slug)));
}

function resetFilters() { state.cat = ''; state.q = ''; searchEl.value = ''; render(); }

function render() {
  syncUrl();
  renderChips();
  const catName = new Map(data.categories.map((c) => [c.id, c.name]));
  const list = filterTools(data.tools, data.categories, state);
  if (!data.tools.length) {
    countEl.textContent = '';
    replaceContent(gridEl, emptyState({ title: 'Le catalogue est vide pour le moment', text: 'Les premiers outils seront publiés bientôt.' }));
    return;
  }
  if (!list.length) {
    countEl.textContent = 'Aucun outil trouvé.';
    replaceContent(gridEl, emptyState({
      title: 'Aucun outil ne correspond à votre recherche',
      text: 'Essayez un autre mot-clé ou affichez toutes les catégories.',
      action: h('button', { class: 'btn btn-ghost', type: 'button', onclick: resetFilters }, 'Réinitialiser les filtres'),
    }));
    return;
  }
  const cat = data.categories.find((c) => c.slug === state.cat);
  countEl.textContent = `${list.length} outil${list.length > 1 ? 's' : ''}` + (cat ? ` dans « ${cat.name} »` : '') + (state.q.trim() ? ` pour « ${state.q.trim()} »` : '');
  replaceContent(gridEl, h('ul', { class: 'tool-grid' }, list.map((t) => toolCard(t, catName.get(t.category_id)))));
}

async function load() {
  replaceContent(gridEl, loadingGrid(6));
  replaceContent(chipsEl);
  countEl.textContent = '';
  try {
    data = await fetchCatalogue();
    const params = new URLSearchParams(location.search);
    const wanted = params.get('cat') || '';
    state.cat = data.categories.some((c) => c.slug === wanted) ? wanted : '';
    state.q = params.get('q') || '';
    searchEl.value = state.q;
    render();
  } catch (err) {
    replaceContent(gridEl, errorState(err, load));
  }
}

let timer;
searchEl.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(() => { state.q = searchEl.value; render(); }, 120); });
$('#search-form').addEventListener('submit', (e) => { e.preventDefault(); clearTimeout(timer); state.q = searchEl.value; render(); });
load();
