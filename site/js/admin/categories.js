import { h, replaceContent, sb, exec, field, checkbox, table, viewHead, toast, openDialog, confirmDialog, slugify, errorBox, loading, badge } from './lib.js';

export async function categoriesView(view, { isCurrent }) {
  replaceContent(view, viewHead('Catégories'), loading());
  let cats, tools;
  try {
    [cats, tools] = (await Promise.all([
      exec(sb().from('categories').select('*').order('display_order').order('name')),
      exec(sb().from('tools').select('id,category_id')),
    ])).map((r) => r.data);
  } catch (err) { if (isCurrent()) replaceContent(view, viewHead('Catégories'), errorBox(err, () => categoriesView(view, { isCurrent }))); return; }
  if (!isCurrent()) return;
  const count = (id) => tools.filter((t) => t.category_id === id).length;
  const reload = () => categoriesView(view, { isCurrent });

  function editor(cat) {
    const c = cat || { name: '', slug: '', description: '', display_order: (cats.length ? Math.max(...cats.map((x) => x.display_order)) + 1 : 0), is_published: true };
    const F = {
      name: field({ id: 'c-name', label: 'Nom', value: c.name, required: true, maxlength: 80 }),
      slug: field({ id: 'c-slug', label: 'Identifiant (slug)', value: c.slug, required: true, maxlength: 80, hint: 'Minuscules, chiffres, tirets. Utilisé dans les liens du catalogue.' }),
      desc: field({ id: 'c-desc', label: 'Description (facultatif)', type: 'textarea', rows: 3, maxlength: 240, value: c.description || '' }),
      order: field({ id: 'c-order', label: "Ordre d'affichage", type: 'number', step: 1, value: c.display_order }),
    };
    const pub = checkbox({ id: 'c-pub', label: 'Publiée (visible dans le catalogue)', checked: c.is_published });
    if (!cat) F.name.input.addEventListener('input', () => { if (!F.slug.touched) F.slug.input.value = slugify(F.name.input.value); });
    F.slug.input.addEventListener('input', () => { F.slug.touched = true; });
    const status = h('div', { 'aria-live': 'polite' });
    const btn = h('button', { class: 'btn btn-primary', type: 'submit' }, 'Enregistrer');
    const form = h('form', { class: 'form', novalidate: true }, F.name.el, F.slug.el, F.desc.el, F.order.el, pub.el, status, h('div', { class: 'actions dialog-actions' }, btn));
    const dlg = openDialog({ title: cat ? 'Modifier la catégorie' : 'Nouvelle catégorie', body: form });
    form.addEventListener('submit', async (ev) => {
      ev.preventDefault(); replaceContent(status); Object.values(F).forEach((f) => f.error(''));
      const name = F.name.input.value.trim(), slug = F.slug.input.value.trim(), order = F.order.input.value.trim();
      const e = {};
      if (!name) e.name = 'Indiquez un nom.';
      if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) e.slug = 'Lettres minuscules, chiffres et tirets seulement.';
      if (!/^-?\d+$/.test(order)) e.order = 'Indiquez un nombre entier.';
      for (const [k, m] of Object.entries(e)) F[k].error(m);
      if (Object.keys(e).length) { F[Object.keys(e)[0]].input.focus(); return; }
      const row = { name, slug, description: F.desc.input.value.trim() || null, display_order: Number(order), is_published: pub.input.checked };
      btn.disabled = true;
      try {
        await exec(cat ? sb().from('categories').update(row).eq('id', cat.id) : sb().from('categories').insert(row));
        dlg.close(); toast('Catégorie enregistrée.'); reload();
      } catch (err) { btn.disabled = false; replaceContent(status, h('div', { class: 'alert alert-error', role: 'alert' }, err.message)); }
    });
    F.name.input.focus();
  }

  async function remove(cat) {
    const n = count(cat.id);
    const ok = await confirmDialog({ title: `Supprimer « ${cat.name} » ?`, text: n ? `${n} outil${n > 1 ? 's' : ''} de cette catégorie resteront dans le catalogue, sans catégorie.` : 'Cette catégorie est vide.', confirmLabel: 'Supprimer', danger: true });
    if (!ok) return;
    try { await exec(sb().from('categories').delete().eq('id', cat.id)); toast('Catégorie supprimée.'); reload(); } catch (err) { toast(err.message, 'error'); }
  }

  replaceContent(view, viewHead('Catégories', h('button', { class: 'btn btn-primary', type: 'button', onclick: () => editor(null) }, 'Nouvelle catégorie')),
    table([
      { label: 'Nom', render: (c) => [h('strong', {}, c.name), c.description ? h('div', { class: 'cell-sub' }, c.description) : null] },
      { label: 'Identifiant', render: (c) => h('span', { class: 'mono' }, c.slug) },
      { label: 'Ordre', render: (c) => String(c.display_order) },
      { label: 'Visibilité', render: (c) => (c.is_published ? badge({ x: { label: 'Publiée', cls: 'badge-ok' } }, 'x') : badge({ x: { label: 'Masquée', cls: '' } }, 'x')) },
      { label: 'Outils', render: (c) => String(count(c.id)) },
      { label: 'Actions', render: (c) => h('div', { class: 'actions' }, h('button', { class: 'btn btn-ghost btn-sm', type: 'button', onclick: () => editor(c) }, 'Modifier'), h('button', { class: 'btn btn-danger btn-sm', type: 'button', onclick: () => remove(c) }, 'Supprimer')) },
    ], cats, { empty: 'Aucune catégorie.' }));
}
