import { h, replaceContent, sb, exec, table, viewHead, fmtDate, errorBox, loading } from './lib.js';

const ACTIONS = {
  payment_confirmed: 'Paiement confirmé', order_cancelled: 'Commande annulée', access_granted: 'Accès accordé',
  access_revoked: 'Accès retiré', account_suspended: 'Compte suspendu', account_active: 'Compte réactivé',
};

export async function journalView(view, { isCurrent }) {
  replaceContent(view, viewHead('Journal des actions'), loading());
  let rows;
  try { rows = (await exec(sb().from('audit_log').select('*').order('id', { ascending: false }).limit(200))).data; }
  catch (err) { if (isCurrent()) replaceContent(view, viewHead('Journal des actions'), errorBox(err, () => journalView(view, { isCurrent }))); return; }
  if (!isCurrent()) return;
  replaceContent(view, viewHead('Journal des actions'), h('p', { class: 'muted' }, "Les 200 dernières actions sensibles (paiements, accès, comptes). Ce journal ne peut pas être modifié depuis le site."),
    table([
      { label: 'Date', render: (r) => fmtDate(r.created_at) },
      { label: 'Action', render: (r) => ACTIONS[r.action] || r.action },
      { label: 'Cible', render: (r) => h('span', { class: 'mono' }, r.target || '—') },
      { label: 'Détails', render: (r) => (r.details ? h('span', { class: 'cell-sub mono' }, JSON.stringify(r.details)) : '—') },
    ], rows, { empty: 'Aucune action enregistrée.' }));
}
