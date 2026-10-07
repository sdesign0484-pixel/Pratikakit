import { fetchCatalogue } from '../api.js';
import { $, h, loadChrome, loadingGrid, toolCard, emptyState, errorState, replaceContent, setMeta } from '../ui.js';

const settingsP = loadChrome('home');
let showCategories = true;
settingsP.then((s) => {
  setMeta('', s.hero_lead, s.site_name);
  $('#hero-title').textContent = s.hero_title;
  $('#hero-lead').textContent = s.hero_lead;
  showCategories = s.show_categories !== 'false';
  $('#steps-section').hidden = s.show_steps === 'false';
});

const featured = $('#featured'), catsSection = $('#categories-section'), cats = $('#categories');

async function load() {
  replaceContent(featured, loadingGrid(3));
  catsSection.hidden = true;
  try {
    const { categories, tools } = await fetchCatalogue();
    const catName = new Map(categories.map((c) => [c.id, c.name]));

    if (!tools.length) {
      replaceContent(featured, emptyState({ title: 'Le catalogue se remplit', text: 'Les premiers outils seront publiés bientôt. Revenez nous voir ou écrivez-nous depuis la page Contact.' }));
      return;
    }
    const pick = tools.filter((t) => t.status === 'available');
    const shown = (pick.length ? pick : tools).slice(0, 3);
    replaceContent(featured, h('ul', { class: 'tool-grid' }, shown.map((t) => toolCard(t, catName.get(t.category_id)))));

    await settingsP;
    const rows = !showCategories ? [] : categories
      .map((c) => ({ c, n: tools.filter((t) => t.category_id === c.id).length }))
      .filter((r) => r.n > 0);
    if (rows.length) {
      replaceContent(cats, rows.map(({ c, n }) =>
        h('li', {}, h('a', { class: 'cat-row', href: `catalogue.html?cat=${encodeURIComponent(c.slug)}` },
          h('span', { class: 'cat-name' }, c.name),
          h('span', { class: 'cat-desc' }, c.description || ''),
          h('span', { class: 'cat-count' }, `${n} outil${n > 1 ? 's' : ''}`)))));
      catsSection.hidden = false;
    }
  } catch (err) {
    replaceContent(featured, errorState(err, load));
  }
}
load();
