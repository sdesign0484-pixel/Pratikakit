import { h, replaceContent, sb, exec, table, viewHead, toast, openDialog, fmtDate, errorBox, loading, badge } from './lib.js';

const ST = { new: { label: 'Nouveau', cls: 'badge-soon' }, read: { label: 'Lu', cls: 'badge-ok' }, archived: { label: 'Archivé', cls: '' } };

export async function messagesView(view, { isCurrent, refreshBadges }) {
  const sel = h('select', { class: 'input', 'aria-label': 'Filtrer par statut' }, [['new', 'Nouveaux'], ['read', 'Lus'], ['archived', 'Archivés'], ['', 'Tous']].map(([v, l]) => h('option', { value: v }, l)));
  const box = h('div', {});
  replaceContent(view, viewHead('Messages de contact'), h('div', { class: 'toolbar' }, sel), box);
  let msgs = [];

  async function load() {
    replaceContent(box, loading());
    try {
      let q = sb().from('contact_messages').select('*').order('created_at', { ascending: false }).limit(300);
      if (sel.value) q = q.eq('status', sel.value);
      msgs = (await exec(q)).data;
    } catch (err) { if (isCurrent()) replaceContent(box, errorBox(err, load)); return; }
    if (isCurrent()) draw();
  }
  const draw = () => replaceContent(box, table([
    { label: 'Message', render: (m) => [h('button', { class: 'link-btn', type: 'button', onclick: () => open(m) }, m.subject), h('div', { class: 'cell-sub' }, m.message.length > 90 ? `${m.message.slice(0, 90)}…` : m.message)] },
    { label: 'De', render: (m) => [m.name, h('div', { class: 'cell-sub' }, m.email)] },
    { label: 'Reçu le', render: (m) => fmtDate(m.created_at) },
    { label: 'Statut', render: (m) => badge(ST, m.status) },
  ], msgs, { empty: 'Aucun message.' }));

  async function setStatus(m, status) {
    await exec(sb().from('contact_messages').update({ status }).eq('id', m.id));
    m.status = status; refreshBadges();
  }

  async function open(m) {
    if (m.status === 'new') { try { await setStatus(m, 'read'); draw(); } catch (_) { /* non bloquant */ } }
    const mail = `mailto:${m.email}?subject=${encodeURIComponent(`Re: ${m.subject}`)}`;
    const body = h('div', { class: 'stack' },
      h('dl', { class: 'facts' }, h('div', {}, h('dt', {}, 'De'), h('dd', {}, `${m.name} <${m.email}>`)), h('div', {}, h('dt', {}, 'Reçu le'), h('dd', {}, fmtDate(m.created_at)))),
      h('p', { class: 'message-text' }, m.message),
      h('div', { class: 'actions dialog-actions' },
        h('a', { class: 'btn btn-primary', href: mail }, 'Répondre par e-mail'),
        h('button', { class: 'btn btn-ghost', type: 'button', onclick: async () => { try { await setStatus(m, m.status === 'archived' ? 'read' : 'archived'); dlg.close(); toast(m.status === 'archived' ? 'Message archivé.' : 'Message désarchivé.'); load(); } catch (err) { toast(err.message, 'error'); } } }, m.status === 'archived' ? 'Désarchiver' : 'Archiver')));
    const dlg = openDialog({ title: m.subject, body, wide: true });
  }
  sel.addEventListener('change', load);
  load();
}
