import { h, replaceContent, sb, exec, fetchAll, table, viewHead, toast, fmtDate, fmtAmount, errorBox, loading } from './lib.js';

export async function countOf(table_, filter) {
  let q = sb().from(table_).select('*', { count: 'exact', head: true });
  if (filter) q = filter(q);
  return (await exec(q)).count ?? 0;
}

async function exportBackup(includeHtml) {
  const [categories, tools, assets, orders, items, payments, entitlements, profiles, messages, settings, audit] = await Promise.all([
    fetchAll('categories', '*'), fetchAll('tools', '*'),
    fetchAll('tool_assets', includeHtml ? '*' : 'tool_id,distribution_type,external_url,watermark,html_size,updated_at', 'tool_id'),
    fetchAll('orders', '*'), fetchAll('order_items', '*'), fetchAll('payments', '*'), fetchAll('entitlements', '*'),
    fetchAll('profiles', '*'), fetchAll('contact_messages', '*'), fetchAll('site_settings', '*', 'key'), fetchAll('audit_log', '*'),
  ]);
  const data = { exported_at: new Date().toISOString(), contains_html: includeHtml, categories, tools, tool_assets: assets, orders, order_items: items, payments, entitlements, profiles, contact_messages: messages, site_settings: settings, audit_log: audit };
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
  const a = h('a', { href: url, download: `sauvegarde-${new Date().toISOString().slice(0, 10)}.json` });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

export async function dashboardView(view, { isCurrent }) {
  replaceContent(view, viewHead('Tableau de bord'), loading());
  let n, latest;
  try {
    const r = await Promise.all([
      countOf('orders', (q) => q.eq('status', 'awaiting_payment')),
      countOf('contact_messages', (q) => q.eq('status', 'new')),
      countOf('tools', (q) => q.eq('status', 'available')),
      countOf('tools', (q) => q.eq('status', 'draft')),
      countOf('profiles'),
      exec(sb().from('orders').select('id,reference,total_amount,created_at,profiles(full_name,email)').eq('status', 'awaiting_payment').order('created_at', { ascending: false }).limit(5)),
    ]);
    n = { orders: r[0], msgs: r[1], avail: r[2], drafts: r[3], people: r[4] }; latest = r[5].data;
  } catch (err) { if (isCurrent()) replaceContent(view, viewHead('Tableau de bord'), errorBox(err, () => dashboardView(view, { isCurrent }))); return; }
  if (!isCurrent()) return;

  const stat = (href, value, label, hot) => h('a', { class: hot && value > 0 ? 'stat alert-state' : 'stat', href }, h('div', { class: 'n' }, String(value)), h('div', { class: 'l' }, label));
  const withHtml = h('input', { type: 'checkbox', id: 'bk-html' });
  const btn = h('button', { class: 'btn btn-ghost', type: 'button' }, 'Télécharger la sauvegarde');
  btn.addEventListener('click', async () => {
    btn.disabled = true; btn.textContent = 'Préparation…';
    try { await exportBackup(withHtml.checked); toast('Sauvegarde téléchargée. Conservez-la en lieu sûr : elle contient des données de clients.'); } catch (err) { toast(err.message, 'error'); }
    btn.disabled = false; btn.textContent = 'Télécharger la sauvegarde';
  });

  replaceContent(view, viewHead('Tableau de bord'),
    h('div', { class: 'stat-grid' },
      stat('#/commandes', n.orders, 'commandes à vérifier', true), stat('#/messages', n.msgs, 'nouveaux messages', true),
      stat('#/outils', n.avail, 'outils disponibles'), stat('#/outils', n.drafts, 'outils en brouillon'), stat('#/clients', n.people, 'comptes')),
    h('section', { class: 'panel' }, h('h2', {}, 'Commandes en attente de paiement'),
      table([
        { label: 'Référence', render: (o) => h('a', { href: '#/commandes', class: 'mono' }, o.reference) },
        { label: 'Client', render: (o) => (o.profiles && (o.profiles.full_name || o.profiles.email)) || '—' },
        { label: 'Total', render: (o) => fmtAmount(o.total_amount) },
        { label: 'Date', render: (o) => fmtDate(o.created_at) },
      ], latest, { empty: 'Aucune commande en attente.' })),
    h('section', { class: 'panel' }, h('h2', {}, 'Sauvegarde'),
      h('p', { class: 'muted' }, 'Télécharge un fichier JSON avec le catalogue, les commandes, les clients et les messages.'),
      h('div', { class: 'checkbox' }, withHtml, h('label', { for: 'bk-html' }, 'Inclure le contenu HTML des outils', h('span', { class: 'hint block' }, 'Peut rendre le fichier très volumineux.'))),
      h('div', { class: 'actions' }, btn)));
}
