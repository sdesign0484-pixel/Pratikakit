import { h, replaceContent, sb, exec, field, checkbox, viewHead, toast, errorBox, loading } from './lib.js';
import { DEFAULT_SETTINGS } from '../api.js';

export async function settingsView(view, { isCurrent }) {
  replaceContent(view, viewHead('Réglages du site'), loading());
  let rows;
  try { rows = (await exec(sb().from('site_settings').select('key,value'))).data; }
  catch (err) { if (isCurrent()) replaceContent(view, viewHead('Réglages du site'), errorBox(err, () => settingsView(view, { isCurrent }))); return; }
  if (!isCurrent()) return;
  const cur = { ...DEFAULT_SETTINGS };
  for (const r of rows) if (r.key in cur) cur[r.key] = r.value;

  const F = {
    site_name: field({ id: 's-name', label: 'Nom du site', value: cur.site_name, required: true, maxlength: 60, hint: "Affiché dans l'en-tête, le pied de page et le titre des pages. Idéal : votre nom (personal branding)." }),
    hero_title: field({ id: 's-hero', label: "Titre de la page d'accueil", value: cur.hero_title, maxlength: 120 }),
    hero_lead: field({ id: 's-lead', label: "Texte sous le titre d'accueil", type: 'textarea', rows: 3, value: cur.hero_lead, maxlength: 300 }),
    footer_text: field({ id: 's-footer', label: 'Texte du pied de page', type: 'textarea', rows: 2, value: cur.footer_text, maxlength: 300 }),
    whatsapp_number: field({ id: 's-wa', label: 'Numéro WhatsApp', value: cur.whatsapp_number, maxlength: 20, placeholder: '+261 34 00 000 00', hint: 'Laissez vide pour ne rien afficher.' }),
    contact_email: field({ id: 's-mail', label: 'E-mail de contact', type: 'email', value: cur.contact_email, maxlength: 254, hint: 'Laissez vide pour ne rien afficher.' }),
    payment_instructions: field({ id: 's-pay', label: 'Instructions de paiement', type: 'textarea', rows: 5, value: cur.payment_instructions, maxlength: 1000, hint: 'Ex. numéros MVola / Orange Money / Airtel Money. Elles seront montrées aux clients à l\'étape de commande (étape à venir).' }),
  };
  const showCats = checkbox({ id: 's-cats', label: "Afficher « Parcourir par catégorie » sur l'accueil", checked: cur.show_categories !== 'false' });
  const showSteps = checkbox({ id: 's-steps', label: "Afficher « Comment ça marche » sur l'accueil", checked: cur.show_steps !== 'false' });
  const status = h('div', { 'aria-live': 'polite' });
  const btn = h('button', { class: 'btn btn-primary', type: 'submit' }, 'Enregistrer les réglages');
  const form = h('form', { class: 'form', novalidate: true },
    h('section', { class: 'panel' }, h('h2', {}, 'Identité'), F.site_name.el),
    h('section', { class: 'panel' }, h('h2', {}, "Page d'accueil"), h('div', { class: 'form-grid' }, F.hero_title.el, h('div', { class: 'full' }, F.hero_lead.el), h('div', { class: 'full' }, F.footer_text.el), showCats.el, showSteps.el),
      h('p', { class: 'hint' }, 'Un champ vide rétablit le texte par défaut.')),
    h('section', { class: 'panel' }, h('h2', {}, 'Contact'), h('div', { class: 'form-grid' }, F.whatsapp_number.el, F.contact_email.el)),
    h('section', { class: 'panel' }, h('h2', {}, 'Paiement'), F.payment_instructions.el),
    status, h('div', { class: 'actions' }, btn));

  form.addEventListener('submit', async (ev) => {
    ev.preventDefault(); replaceContent(status); Object.values(F).forEach((f) => f.error(''));
    const v = Object.fromEntries(Object.entries(F).map(([k, f]) => [k, f.input.value.trim()]));
    const e = {};
    if (!v.site_name) e.site_name = 'Indiquez le nom du site.';
    if (v.whatsapp_number && !/^\+?[0-9 ]{8,20}$/.test(v.whatsapp_number)) e.whatsapp_number = 'Chiffres, espaces et « + » seulement (8 à 20 caractères).';
    if (v.contact_email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v.contact_email)) e.contact_email = "Cette adresse e-mail n'est pas valide.";
    for (const [k, m] of Object.entries(e)) F[k].error(m);
    if (Object.keys(e).length) { F[Object.keys(e)[0]].input.focus(); return; }
    const now = new Date().toISOString();
    const out = { ...v, show_categories: String(showCats.input.checked), show_steps: String(showSteps.input.checked) };
    btn.disabled = true; btn.textContent = 'Enregistrement…';
    try {
      await exec(sb().from('site_settings').upsert(Object.entries(out).map(([key, value]) => ({ key, value, updated_at: now })), { onConflict: 'key' }));
      toast('Réglages enregistrés. Le site public est à jour.');
    } catch (err) { replaceContent(status, h('div', { class: 'alert alert-error', role: 'alert' }, err.message)); }
    btn.disabled = false; btn.textContent = 'Enregistrer les réglages';
  });
  replaceContent(view, viewHead('Réglages du site'), form);
}
