import { h, replaceContent, sb, exec, field, table, viewHead, toast, openDialog, confirmDialog, fmtDate, fmtDay, fmtAmount, errorBox, loading, badge, ACCESS_STATE, ORDER_STATUS, SOURCES, accessState, normalize } from './lib.js';

const statusBadge = (s) => h('span', { class: s === 'active' ? 'badge badge-ok' : 'badge badge-off' }, s === 'active' ? 'Actif' : 'Suspendu');

export async function clientsList(view, { isCurrent }) {
  replaceContent(view, viewHead('Clients'), loading());
  let people;
  try { people = (await exec(sb().from('profiles').select('id,email,full_name,phone,role,status,created_at').order('created_at', { ascending: false }).limit(1000))).data; }
  catch (err) { if (isCurrent()) replaceContent(view, viewHead('Clients'), errorBox(err, () => clientsList(view, { isCurrent }))); return; }
  if (!isCurrent()) return;
  const search = h('input', { class: 'input', type: 'search', placeholder: 'Nom, téléphone, e-mail…', 'aria-label': 'Rechercher un client' });
  const box = h('div', {});
  const draw = () => {
    const q = normalize(search.value);
    const rows = people.filter((p) => !q || normalize([p.full_name, p.phone, p.email].join(' ')).includes(q));
    replaceContent(box, table([
      { label: 'Client', render: (p) => [h('a', { href: `#/clients/${p.id}` }, p.full_name || '(sans nom)'), p.role === 'admin' ? h('span', { class: 'badge badge-ok tag' }, 'Admin') : null] },
      { label: 'Téléphone', render: (p) => p.phone || '—' },
      { label: 'E-mail', render: (p) => p.email || '—' },
      { label: 'Compte', render: (p) => statusBadge(p.status) },
      { label: 'Inscrit le', render: (p) => fmtDay(p.created_at) },
    ], rows, { empty: people.length ? 'Aucun client ne correspond.' : 'Aucun client inscrit pour le moment.' }));
  };
  search.addEventListener('input', draw);
  replaceContent(view, viewHead('Clients'), h('div', { class: 'toolbar' }, search, h('span', { class: 'muted' }, `${people.length} compte${people.length > 1 ? 's' : ''}`)), box);
  draw();
}

export async function clientDetail(view, id, { isCurrent, refreshBadges }) {
  replaceContent(view, viewHead('Client'), loading());
  let p, ents, orders, tools;
  try {
    const r = await Promise.all([
      exec(sb().from('profiles').select('id,email,full_name,phone,role,status,created_at').eq('id', id).maybeSingle()),
      exec(sb().from('entitlements').select('id,source,status,starts_at,expires_at,note,tools(name)').eq('user_id', id).order('created_at', { ascending: false })),
      exec(sb().from('orders').select('reference,status,total_amount,created_at').eq('user_id', id).order('created_at', { ascending: false })),
      exec(sb().from('tools').select('id,name,status').order('name')),
    ]);
    p = r[0].data; ents = r[1].data; orders = r[2].data; tools = r[3].data;
  } catch (err) { if (isCurrent()) replaceContent(view, viewHead('Client'), errorBox(err, () => clientDetail(view, id, { isCurrent, refreshBadges }))); return; }
  if (!isCurrent()) return;
  if (!p) { replaceContent(view, viewHead('Client introuvable'), h('p', {}, h('a', { href: '#/clients' }, 'Retour à la liste'))); return; }
  const reload = () => clientDetail(view, id, { isCurrent, refreshBadges });

  async function toggleSuspend() {
    const next = p.status === 'active' ? 'suspended' : 'active';
    const ok = await confirmDialog({
      title: next === 'suspended' ? 'Suspendre ce compte ?' : 'Réactiver ce compte ?',
      text: next === 'suspended' ? "Le client ne pourra plus ouvrir ses outils ni commander tant que le compte est suspendu." : 'Le client retrouvera ses accès et pourra de nouveau commander.',
      confirmLabel: next === 'suspended' ? 'Suspendre' : 'Réactiver', danger: next === 'suspended',
    });
    if (!ok) return;
    try { await exec(sb().rpc('admin_set_account_status', { p_user_id: p.id, p_status: next })); toast(next === 'suspended' ? 'Compte suspendu.' : 'Compte réactivé.'); reload(); } catch (err) { toast(err.message, 'error'); }
  }

  async function revoke(e) {
    const ok = await confirmDialog({ title: 'Retirer cet accès ?', text: `Le client ne pourra plus ouvrir « ${e.tools ? e.tools.name : 'cet outil'} ».`, confirmLabel: "Retirer l'accès", danger: true });
    if (!ok) return;
    try { await exec(sb().rpc('admin_revoke_access', { p_entitlement_id: e.id })); toast('Accès retiré.'); reload(); } catch (err) { toast(err.message, 'error'); }
  }

  function grant() {
    const F = {
      tool: field({ id: 'g-tool', label: 'Outil', type: 'select', required: true, options: [{ value: '', label: 'Choisir un outil…' }, ...tools.map((t) => ({ value: t.id, label: t.name }))] }),
      until: field({ id: 'g-until', label: "Date d'expiration (facultatif)", type: 'date', hint: "Laissez vide pour un accès permanent. L'accès s'arrête à la fin de ce jour." }),
      note: field({ id: 'g-note', label: 'Note (facultatif)', maxlength: 200, hint: 'Ex. cadeau, test, remboursement…' }),
    };
    const status = h('div', { 'aria-live': 'polite' });
    const btn = h('button', { class: 'btn btn-primary', type: 'submit' }, "Donner l'accès");
    const form = h('form', { class: 'form', novalidate: true }, F.tool.el, F.until.el, F.note.el, status, h('div', { class: 'actions dialog-actions' }, btn));
    const dlg = openDialog({ title: `Donner un accès à ${p.full_name || p.email}`, body: form });
    form.addEventListener('submit', async (ev) => {
      ev.preventDefault(); replaceContent(status); F.tool.error('');
      if (!F.tool.input.value) { F.tool.error('Choisissez un outil.'); F.tool.input.focus(); return; }
      let exp = null;
      if (F.until.input.value) { exp = new Date(`${F.until.input.value}T23:59:59`); if (!(exp > new Date())) { F.until.error('Choisissez une date future.'); return; } exp = exp.toISOString(); }
      btn.disabled = true;
      try {
        await exec(sb().rpc('admin_grant_access', { p_user_id: p.id, p_tool_id: F.tool.input.value, p_expires_at: exp, p_note: F.note.input.value.trim() || null }));
        dlg.close(); toast('Accès accordé.'); reload();
      } catch (err) { btn.disabled = false; replaceContent(status, h('div', { class: 'alert alert-error', role: 'alert' }, err.message)); }
    });
    F.tool.input.focus();
  }

  replaceContent(view,
    h('p', { class: 'breadcrumb-line' }, h('a', { href: '#/clients' }, '← Tous les clients')),
    viewHead(p.full_name || '(sans nom)', h('button', { class: 'btn btn-ghost', type: 'button', onclick: toggleSuspend }, p.status === 'active' ? 'Suspendre le compte' : 'Réactiver le compte')),
    h('section', { class: 'panel' }, h('dl', { class: 'facts' },
      h('div', {}, h('dt', {}, 'E-mail'), h('dd', {}, p.email || '—')),
      h('div', {}, h('dt', {}, 'Téléphone'), h('dd', {}, p.phone || '—')),
      h('div', {}, h('dt', {}, 'Compte'), h('dd', {}, statusBadge(p.status))),
      h('div', {}, h('dt', {}, 'Inscrit le'), h('dd', {}, fmtDate(p.created_at))))),
    h('section', { class: 'panel' }, h('div', { class: 'panel-head' }, h('h2', {}, 'Outils et accès'), h('button', { class: 'btn btn-primary btn-sm', type: 'button', onclick: grant }, 'Donner un accès')),
      table([
        { label: 'Outil', render: (e) => [e.tools ? e.tools.name : '(outil supprimé)', e.note ? h('div', { class: 'cell-sub' }, e.note) : null] },
        { label: 'Origine', render: (e) => SOURCES[e.source] || e.source },
        { label: 'État', render: (e) => badge(ACCESS_STATE, accessState(e)) },
        { label: 'Début', render: (e) => fmtDay(e.starts_at) },
        { label: 'Expiration', render: (e) => (e.expires_at ? fmtDay(e.expires_at) : 'Jamais') },
        { label: 'Actions', render: (e) => (e.status === 'revoked' ? '—' : h('button', { class: 'btn btn-danger btn-sm', type: 'button', onclick: () => revoke(e) }, "Retirer l'accès")) },
      ], ents, { empty: "Ce client n'a accès à aucun outil." })),
    h('section', { class: 'panel' }, h('h2', {}, 'Commandes'),
      table([
        { label: 'Référence', render: (o) => h('span', { class: 'mono' }, o.reference) },
        { label: 'Date', render: (o) => fmtDate(o.created_at) },
        { label: 'Total', render: (o) => fmtAmount(o.total_amount) },
        { label: 'Statut', render: (o) => badge(ORDER_STATUS, o.status) },
      ], orders, { empty: "Aucune commande." })));
}
