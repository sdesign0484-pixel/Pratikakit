import { h, replaceContent, sb, exec, field, table, viewHead, toast, openDialog, confirmDialog, fmtDate, fmtAmount, errorBox, loading, badge, ORDER_STATUS, METHODS, normalize } from './lib.js';

const SELECT = 'id,reference,status,total_amount,currency,created_at,profiles(full_name,phone,email),order_items(unit_price,tools(name)),payments(method,transaction_ref,note,created_at)';

export async function ordersView(view, { isCurrent, refreshBadges, filter = 'awaiting_payment' }) {
  const statusSel = h('select', { class: 'input', 'aria-label': 'Filtrer par statut' },
    [['awaiting_payment', 'En attente de paiement'], ['paid', 'Payées'], ['cancelled', 'Annulées'], ['', 'Toutes']].map(([v, l]) => h('option', { value: v }, l)));
  statusSel.value = filter;
  const search = h('input', { class: 'input', type: 'search', placeholder: 'Référence, nom, téléphone, e-mail…', 'aria-label': 'Rechercher une commande' });
  const box = h('div', {});
  replaceContent(view, viewHead('Commandes'), h('div', { class: 'toolbar' }, statusSel, search), box);

  let orders = [];
  async function load() {
    replaceContent(box, loading());
    try {
      let q = sb().from('orders').select(SELECT).order('created_at', { ascending: false }).limit(300);
      if (statusSel.value) q = q.eq('status', statusSel.value);
      orders = (await exec(q)).data;
    } catch (err) { if (isCurrent()) replaceContent(box, errorBox(err, load)); return; }
    if (isCurrent()) draw();
  }

  function draw() {
    const q = normalize(search.value);
    const rows = orders.filter((o) => !q || normalize([o.reference, o.profiles && o.profiles.full_name, o.profiles && o.profiles.phone, o.profiles && o.profiles.email].join(' ')).includes(q));
    replaceContent(box, table([
      { label: 'Référence', render: (o) => [h('strong', { class: 'mono' }, o.reference), h('div', { class: 'cell-sub' }, fmtDate(o.created_at))] },
      { label: 'Client', render: (o) => [o.profiles && o.profiles.full_name ? h('div', {}, o.profiles.full_name) : null, h('div', { class: 'cell-sub' }, [o.profiles && o.profiles.phone, o.profiles && o.profiles.email].filter(Boolean).join(' · '))] },
      { label: 'Outils', render: (o) => h('ul', { class: 'plain-list' }, o.order_items.map((i) => h('li', {}, i.tools ? i.tools.name : '(outil supprimé)'))) },
      { label: 'Total', render: (o) => h('strong', {}, fmtAmount(o.total_amount)) },
      { label: 'Statut', render: (o) => [badge(ORDER_STATUS, o.status), ...o.payments.map((p) => h('div', { class: 'cell-sub' }, `${METHODS[p.method] || p.method}${p.transaction_ref ? ` · ${p.transaction_ref}` : ''}`))] },
      { label: 'Actions', render: (o) => (o.status === 'awaiting_payment'
        ? h('div', { class: 'actions' },
          h('button', { class: 'btn btn-primary btn-sm', type: 'button', onclick: () => confirmPayment(o) }, 'Confirmer le paiement'),
          h('button', { class: 'btn btn-danger btn-sm', type: 'button', onclick: () => cancel(o) }, 'Annuler'))
        : '—') },
    ], rows, { empty: 'Aucune commande.' }));
  }

  function confirmPayment(o) {
    const F = {
      method: field({ id: 'p-method', label: 'Moyen de paiement reçu', type: 'select', value: 'mvola', options: Object.entries(METHODS).map(([value, label]) => ({ value, label })) }),
      ref: field({ id: 'p-ref', label: 'Référence de la transaction', maxlength: 60, hint: "Le numéro reçu par SMS de l'opérateur. Une même référence ne peut pas valider deux commandes." }),
      note: field({ id: 'p-note', label: 'Note (facultatif)', type: 'textarea', rows: 2, maxlength: 300 }),
    };
    const status = h('div', { 'aria-live': 'polite' });
    const btn = h('button', { class: 'btn btn-primary', type: 'submit' }, 'Confirmer : paiement reçu');
    const who = (o.profiles && (o.profiles.full_name || o.profiles.email)) || 'ce client';
    const form = h('form', { class: 'form', novalidate: true },
      h('p', { class: 'alert alert-info' }, `Vérifiez d'abord sur votre compte Mobile Money que ${fmtAmount(o.total_amount)} de ${who} sont bien arrivés (référence ${o.reference}). La confirmation donne accès aux outils au client.`),
      F.method.el, F.ref.el, F.note.el, status, h('div', { class: 'actions dialog-actions' }, btn));
    const dlg = openDialog({ title: `Commande ${o.reference}`, body: form });
    form.addEventListener('submit', async (ev) => {
      ev.preventDefault(); replaceContent(status); btn.disabled = true;
      try {
        await exec(sb().rpc('admin_confirm_payment', { p_order_id: o.id, p_method: F.method.input.value, p_transaction_ref: F.ref.input.value.trim() || null, p_note: F.note.input.value.trim() || null }));
        dlg.close(); toast('Paiement confirmé : le client a maintenant accès à ses outils.'); load(); refreshBadges();
      } catch (err) { btn.disabled = false; replaceContent(status, h('div', { class: 'alert alert-error', role: 'alert' }, err.message)); }
    });
    F.ref.input.focus();
  }

  async function cancel(o) {
    const ok = await confirmDialog({ title: `Annuler ${o.reference} ?`, text: "La commande sera marquée « Annulée ». Aucun accès n'est créé. Cette action ne peut pas être défaite.", confirmLabel: 'Annuler la commande', danger: true });
    if (!ok) return;
    try { await exec(sb().rpc('admin_cancel_order', { p_order_id: o.id, p_note: null })); toast('Commande annulée.'); load(); refreshBadges(); } catch (err) { toast(err.message, 'error'); }
  }

  statusSel.addEventListener('change', load); search.addEventListener('input', draw);
  load();
}
