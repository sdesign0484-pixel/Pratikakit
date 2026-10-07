import { h, $, replaceContent, sb, exec, field, checkbox, table, viewHead, toast, fmtAmount, fmtDate, fmtKb, slugify, lines, errorBox, loading, normalize, friendly } from './lib.js';
import { statusBadge, STATUS } from '../ui.js';

const MAX_HTML = 5_000_000;
const SELECT_ASSET = 'tool_id,distribution_type,external_url,watermark,html_size,updated_at';

function distributionCell(tool, asset) {
  const problem = tool.status === 'available';
  const warn = (text) => h('span', { class: problem ? 'badge badge-off' : 'badge badge-soon' }, text);
  if (!asset) return warn('Non configurée');
  if (asset.distribution_type === 'external_url') return asset.external_url ? h('span', { class: 'cell-sub' }, 'Lien externe') : warn('Lien manquant');
  return asset.html_size ? h('span', { class: 'cell-sub' }, `Fichier HTML · ${fmtKb(asset.html_size)}`) : warn('Fichier manquant');
}

/* =============== LISTE =============== */
export async function toolsList(view, { isCurrent }) {
  replaceContent(view, viewHead('Outils', h('a', { class: 'btn btn-primary', href: '#/outils/nouveau' }, 'Nouvel outil')), loading());
  let tools, cats, assets;
  try {
    [tools, cats, assets] = (await Promise.all([
      exec(sb().from('tools').select('id,slug,name,category_id,price_amount,access_duration_days,status,updated_at').order('display_order').order('name')),
      exec(sb().from('categories').select('id,name')),
      exec(sb().from('tool_assets').select(SELECT_ASSET)),
    ])).map((r) => r.data);
  } catch (err) { if (isCurrent()) replaceContent(view, viewHead('Outils'), errorBox(err, () => toolsList(view, { isCurrent }))); return; }
  if (!isCurrent()) return;
  const catName = new Map(cats.map((c) => [c.id, c.name])), assetOf = new Map(assets.map((a) => [a.tool_id, a]));

  const search = h('input', { class: 'input', type: 'search', placeholder: 'Rechercher un outil…', 'aria-label': 'Rechercher un outil' });
  const status = h('select', { class: 'input', 'aria-label': 'Filtrer par statut' }, h('option', { value: '' }, 'Tous les statuts'), h('option', { value: 'draft' }, 'Brouillon'), Object.entries(STATUS).map(([k, v]) => h('option', { value: k }, v.label)));
  const box = h('div', {});
  const draw = () => {
    const q = normalize(search.value);
    const rows = tools.filter((t) => (!status.value || t.status === status.value) && (!q || normalize(t.name + ' ' + t.slug).includes(q)));
    replaceContent(box, table([
      { label: 'Outil', render: (t) => [h('a', { href: `#/outils/${t.id}` }, t.name), h('div', { class: 'cell-sub mono' }, t.slug)] },
      { label: 'Catégorie', render: (t) => catName.get(t.category_id) || '—' },
      { label: 'Prix', render: (t) => (t.price_amount ? fmtAmount(t.price_amount) : 'Gratuit') },
      { label: 'Accès', render: (t) => (t.access_duration_days ? `${t.access_duration_days} jours` : 'Permanent') },
      { label: 'Statut', render: (t) => (t.status === 'draft' ? h('span', { class: 'badge' }, 'Brouillon') : statusBadge(t.status)) },
      { label: 'Distribution', render: (t) => distributionCell(t, assetOf.get(t.id)) },
      { label: 'Modifié', render: (t) => fmtDate(t.updated_at) },
    ], rows, { empty: tools.length ? 'Aucun outil ne correspond.' : "Aucun outil pour l'instant. Cliquez sur « Nouvel outil »." }));
  };
  search.addEventListener('input', draw); status.addEventListener('change', draw);
  replaceContent(view, viewHead('Outils', h('a', { class: 'btn btn-primary', href: '#/outils/nouveau' }, 'Nouvel outil')), h('div', { class: 'toolbar' }, search, status), box);
  draw();
}

/* =============== FORMULAIRE =============== */
export async function toolForm(view, id, { isCurrent }) {
  replaceContent(view, viewHead(id ? 'Modifier un outil' : 'Nouvel outil'), loading());
  let tool = null, asset = null, cats;
  try {
    const jobs = [exec(sb().from('categories').select('id,name').order('display_order').order('name'))];
    if (id) jobs.push(exec(sb().from('tools').select('*').eq('id', id).maybeSingle()), exec(sb().from('tool_assets').select(SELECT_ASSET).eq('tool_id', id).maybeSingle()));
    const res = await Promise.all(jobs);
    cats = res[0].data;
    if (id) { tool = res[1].data; asset = res[2].data; }
  } catch (err) { if (isCurrent()) replaceContent(view, viewHead('Outil'), errorBox(err, () => toolForm(view, id, { isCurrent }))); return; }
  if (!isCurrent()) return;
  if (id && !tool) { replaceContent(view, viewHead('Outil introuvable'), h('p', {}, h('a', { href: '#/outils' }, 'Retour à la liste'))); return; }

  const t = tool || { name: '', slug: '', short_description: '', long_description: '', category_id: '', image_url: '', problems_solved: [], features: [], price_amount: 0, access_duration_days: null, status: 'draft', display_order: 0 };
  const F = {
    name: field({ id: 't-name', label: "Nom de l'outil", value: t.name, required: true, maxlength: 120 }),
    slug: field({ id: 't-slug', label: 'Identifiant dans l\'adresse (slug)', value: t.slug, required: true, maxlength: 80, hint: 'Minuscules, chiffres et tirets. Il apparaît dans le lien de la fiche.' }),
    cat: field({ id: 't-cat', label: 'Catégorie', type: 'select', value: t.category_id || '', options: [{ value: '', label: 'Sans catégorie' }, ...cats.map((c) => ({ value: c.id, label: c.name }))] }),
    short: field({ id: 't-short', label: 'Description courte', type: 'textarea', rows: 2, maxlength: 240, value: t.short_description, hint: 'Affichée sur les cartes du catalogue.' }),
    long: field({ id: 't-long', label: 'Présentation détaillée', type: 'textarea', rows: 8, value: t.long_description || '', hint: 'Texte brut. Une ligne vide sépare deux paragraphes.' }),
    image: field({ id: 't-image', label: "Adresse de l'image (facultatif)", type: 'url', value: t.image_url || '', placeholder: 'https://…', hint: "Doit commencer par https://. Sans image, une initiale colorée s'affiche." }),
    problems: field({ id: 't-problems', label: 'Problèmes résolus', type: 'textarea', rows: 4, value: (t.problems_solved || []).join('\n'), hint: 'Une ligne par problème.' }),
    features: field({ id: 't-features', label: 'Fonctionnalités principales', type: 'textarea', rows: 5, value: (t.features || []).join('\n'), hint: 'Une ligne par fonctionnalité.' }),
    price: field({ id: 't-price', label: 'Prix en Ariary', type: 'number', min: 0, step: 1, value: t.price_amount, hint: '0 = outil gratuit.' }),
    mode: field({ id: 't-mode', label: "Durée de l'accès", type: 'select', value: t.access_duration_days ? 'limited' : 'permanent', options: [{ value: 'permanent', label: 'Permanent' }, { value: 'limited', label: 'Limitée' }] }),
    days: field({ id: 't-days', label: 'Nombre de jours', type: 'number', min: 1, step: 1, value: t.access_duration_days || 30 }),
    status: field({ id: 't-status', label: 'Statut', type: 'select', value: t.status, options: [{ value: 'draft', label: 'Brouillon (invisible)' }, { value: 'available', label: 'Disponible' }, { value: 'coming_soon', label: 'Bientôt disponible' }, { value: 'unavailable', label: 'Indisponible' }] }),
    order: field({ id: 't-order', label: "Ordre d'affichage", type: 'number', step: 1, value: t.display_order, hint: 'Les plus petits nombres apparaissent en premier.' }),
    dtype: field({ id: 't-dtype', label: 'Mode de distribution', type: 'select', value: asset ? asset.distribution_type : 'html_standalone', options: [{ value: 'html_standalone', label: 'Fichier HTML autonome' }, { value: 'external_url', label: 'Lien vers un site externe' }] }),
    url: field({ id: 't-url', label: "Adresse de l'outil", type: 'url', value: (asset && asset.external_url) || '', placeholder: 'https://…', hint: "Ouvert dans un nouvel onglet, seulement pour les clients autorisés." }),
  };
  const wm = checkbox({ id: 't-wm', label: 'Filigrane au nom et téléphone du client', checked: asset ? asset.watermark : false, hint: 'Dissuade le partage du fichier ; ne l\'empêche pas.' });
  F.days.el.hidden = F.mode.input.value !== 'limited';
  F.mode.input.addEventListener('change', () => { F.days.el.hidden = F.mode.input.value !== 'limited'; });

  // Fichier HTML
  let pendingHtml = null;
  const fileInput = h('input', { class: 'input', id: 't-file', type: 'file', accept: '.html,.htm,text/html', 'aria-describedby': 'file-info err-t-file' });
  const fileErr = h('p', { class: 'field-error', id: 'err-t-file' });
  const fileInfo = h('p', { class: 'hint', id: 'file-info' });
  const showFileInfo = () => {
    fileInfo.textContent = pendingHtml !== null ? `Nouveau fichier prêt : ${fileInput.files[0].name} (${fmtKb(fileInput.files[0].size)}). Il sera enregistré avec l'outil.`
      : asset && asset.html_size ? `Fichier actuel : ${fmtKb(asset.html_size)}, mis à jour le ${fmtDate(asset.updated_at)}. Choisissez un fichier pour le remplacer.` : 'Aucun fichier enregistré pour cet outil.';
  };
  fileInput.addEventListener('change', async () => {
    fileErr.textContent = ''; pendingHtml = null;
    const f = fileInput.files[0];
    if (f) {
      if (f.size > MAX_HTML) fileErr.textContent = 'Fichier trop volumineux : 5 Mo maximum.';
      else {
        const text = await f.text();
        if (!/<\s*(!doctype|html|head|body)/i.test(text)) fileErr.textContent = 'Ce fichier ne ressemble pas à une page HTML.';
        else pendingHtml = text;
      }
      if (fileErr.textContent) fileInput.value = '';
    }
    showFileInfo();
  });
  showFileInfo();
  const htmlBlock = h('div', { class: 'field' }, h('label', { for: 't-file' }, 'Fichier HTML de l\'outil'), fileInput, fileInfo, fileErr,
    h('p', { class: 'hint' }, "Le fichier est stocké dans la base et livré seulement aux clients autorisés. Un fichier HTML livré dans un navigateur peut être copié. Pas d'aperçu ici : il se fera sur le sous-domaine des outils (étape suivante)."));
  const syncDist = () => { htmlBlock.hidden = F.dtype.input.value !== 'html_standalone'; F.url.el.hidden = F.dtype.input.value !== 'external_url'; };
  F.dtype.input.addEventListener('change', syncDist); syncDist();

  if (!id) F.name.input.addEventListener('input', () => { if (!F.slug.touched) F.slug.input.value = slugify(F.name.input.value); });
  F.slug.input.addEventListener('input', () => { F.slug.touched = true; });

  const status = h('div', { 'aria-live': 'polite' });
  const save = h('button', { class: 'btn btn-primary', type: 'submit' }, 'Enregistrer');
  const form = h('form', { class: 'form', novalidate: true },
    h('section', { class: 'panel' }, h('h2', {}, 'Informations'), h('div', { class: 'form-grid' }, F.name.el, F.slug.el, F.cat.el, F.status.el, el2(F.short.el), el2(F.long.el), el2(F.image.el))),
    h('section', { class: 'panel' }, h('h2', {}, 'Contenu de la fiche'), h('div', { class: 'form-grid' }, F.problems.el, F.features.el)),
    h('section', { class: 'panel' }, h('h2', {}, 'Vente'), h('div', { class: 'form-grid' }, F.price.el, F.order.el, F.mode.el, F.days.el)),
    h('section', { class: 'panel' }, h('h2', {}, 'Distribution'), h('div', { class: 'form-grid' }, F.dtype.el, el2(htmlBlock), el2(F.url.el), el2(wm.el))),
    status,
    h('div', { class: 'actions' }, save, h('a', { class: 'btn btn-ghost', href: '#/outils' }, 'Retour à la liste'),
      tool ? h('a', { class: 'btn btn-ghost', href: `../outil.html?slug=${encodeURIComponent(tool.slug)}`, target: '_blank', rel: 'noopener' }, 'Voir la fiche publique') : null),
    h('p', { class: 'hint' }, 'Pour retirer un outil du catalogue, passez-le en « Indisponible » ou « Brouillon » : il n\'est pas supprimé, ses clients gardent leur historique.'));

  function el2(node) { node.classList.add('full'); return node; }

  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    replaceContent(status);
    Object.values(F).forEach((f) => f.error(''));
    const v = {
      name: F.name.input.value.trim(), slug: F.slug.input.value.trim(), price: F.price.input.value.trim(), order: F.order.input.value.trim(),
      days: F.days.input.value.trim(), image: F.image.input.value.trim(), url: F.url.input.value.trim(), dtype: F.dtype.input.value, st: F.status.input.value,
    };
    const e = {};
    if (!v.name) e.name = 'Indiquez le nom de l\'outil.';
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(v.slug)) e.slug = 'Lettres minuscules, chiffres et tirets seulement (ex. suivi-tresorerie).';
    if (!/^\d+$/.test(v.price)) e.price = 'Indiquez un nombre entier positif ou 0.';
    if (!/^-?\d+$/.test(v.order)) e.order = 'Indiquez un nombre entier.';
    if (F.mode.input.value === 'limited' && !(/^\d+$/.test(v.days) && Number(v.days) >= 1)) e.days = 'Indiquez un nombre de jours (1 ou plus).';
    if (v.image && !/^https:\/\//.test(v.image)) e.image = "L'adresse doit commencer par https://";
    if (v.url && !/^https:\/\/\S+$/.test(v.url)) e.url = "Le lien doit commencer par https:// (sans espace).";
    const hasHtml = pendingHtml !== null || Boolean(asset && asset.html_size);
    if (v.st === 'available') {
      if (v.dtype === 'html_standalone' && !hasHtml) e.file = "Un outil « Disponible » doit avoir un fichier HTML.";
      if (v.dtype === 'external_url' && !v.url) e.url = "Un outil « Disponible » doit avoir un lien externe.";
    }
    const key = { name: F.name, slug: F.slug, price: F.price, order: F.order, days: F.days, image: F.image, url: F.url };
    for (const [k, msg] of Object.entries(e)) { if (key[k]) key[k].error(msg); else fileErr.textContent = msg; }
    const first = Object.keys(e)[0];
    if (first) { (key[first] ? key[first].input : fileInput).focus(); return; }

    const row = {
      name: v.name, slug: v.slug, short_description: F.short.input.value.trim(), long_description: F.long.input.value.trim() || null,
      category_id: F.cat.input.value || null, image_url: v.image || null, problems_solved: lines(F.problems.input.value), features: lines(F.features.input.value),
      price_amount: Number(v.price), access_duration_days: F.mode.input.value === 'limited' ? Number(v.days) : null, status: v.st, display_order: Number(v.order),
    };
    save.disabled = true; save.textContent = 'Enregistrement…';
    let toolId = id;
    try {
      if (id) await exec(sb().from('tools').update(row).eq('id', id));
      else toolId = (await exec(sb().from('tools').insert(row).select('id').single())).data.id;
    } catch (err) { save.disabled = false; save.textContent = 'Enregistrer'; replaceContent(status, h('div', { class: 'alert alert-error', role: 'alert' }, err.message)); return; }

    const assetRow = { tool_id: toolId, distribution_type: v.dtype, watermark: wm.input.checked };
    if (v.dtype === 'html_standalone' && pendingHtml !== null) assetRow.html_content = pendingHtml;
    if (v.dtype === 'external_url') assetRow.external_url = v.url || null;
    const needsAsset = pendingHtml !== null || Boolean(asset) || (v.dtype === 'external_url' && v.url);
    try {
      if (needsAsset) await exec(sb().from('tool_assets').upsert(assetRow, { onConflict: 'tool_id' }));
    } catch (err) {
      save.disabled = false; save.textContent = 'Enregistrer';
      replaceContent(status, h('div', { class: 'alert alert-error', role: 'alert' }, `La fiche est enregistrée, mais pas le fichier ou le lien de l'outil : ${err.message}`));
      if (!id) location.hash = `#/outils/${toolId}`;
      return;
    }
    toast('Outil enregistré.');
    if (!id) location.hash = `#/outils/${toolId}`;
    else toolForm(view, id, { isCurrent });
  });

  replaceContent(view, viewHead(id ? 'Modifier un outil' : 'Nouvel outil'), form);
}
