import { getClient, isConfigured, isDemo } from '../api.js';
import { $, h, loadChrome, replaceContent, setMeta } from '../ui.js';
import { field } from '../forms.js';
import { currentUser, safeNext, authMessage } from '../auth.js';

loadChrome('login').then((s) => setMeta('Créer un compte', '', s.site_name));
const root = $('#auth-root');
const params = new URLSearchParams(location.search);
const rawNext = params.get('next');
const next = safeNext(rawNext);
const keep = rawNext && safeNext(rawNext, null) ? `?next=${encodeURIComponent(rawNext)}` : '';

// Mêmes règles que la base : nom ≤ 120 caractères, téléphone en chiffres, espaces et « + ».
export function validateSignup(v) {
  const e = {};
  if (!v.name.trim()) e.name = 'Indiquez votre nom complet.'; else if (v.name.trim().length > 120) e.name = '120 caractères maximum.';
  if (!/^\+?[0-9 ]{8,20}$/.test(v.phone.trim())) e.phone = 'Numéro invalide : 8 à 20 chiffres (espaces et « + » acceptés).';
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v.email.trim()) || v.email.trim().length > 254) e.email = "Cette adresse e-mail n'est pas valide.";
  if (v.password.length < 8) e.password = '8 caractères minimum.';
  if (!v.confirm) e.confirm = 'Confirmez votre mot de passe.';
  else if (v.confirm !== v.password) e.confirm = 'Les deux mots de passe ne sont pas identiques.';
  return e;
}

(async () => {
  if (!isConfigured() || isDemo()) {
    replaceContent(root, h('div', { class: 'auth-card' }, h('h1', {}, 'Créer un compte'), h('p', { class: 'alert alert-info' }, isDemo() ? 'Mode démonstration : la création de compte est désactivée.' : "Le site n'est pas encore relié à sa base de données (js/config.js).")));
    return;
  }
  if (await currentUser()) { location.replace(next); return; }

  const F = {
    name: field({ id: 'r-name', label: 'Nom complet', required: true, maxlength: 120, autocomplete: 'name' }),
    phone: field({ id: 'r-phone', label: 'Numéro de téléphone', type: 'tel', required: true, maxlength: 20, autocomplete: 'tel', inputmode: 'tel', hint: 'Le numéro avec lequel vous payez en Mobile Money : il nous aide à retrouver votre paiement.' }),
    email: field({ id: 'r-email', label: 'Adresse e-mail', type: 'email', required: true, maxlength: 254, autocomplete: 'email', inputmode: 'email' }),
    password: field({ id: 'r-pass', label: 'Mot de passe', type: 'password', required: true, autocomplete: 'new-password', reveal: true, hint: '8 caractères minimum.' }),
    confirm: field({ id: 'r-confirm', label: 'Confirmer le mot de passe', type: 'password', required: true, autocomplete: 'new-password', reveal: true }),
  };
  const status = h('div', { 'aria-live': 'polite' });
  const btn = h('button', { class: 'btn btn-primary btn-block', type: 'submit' }, 'Créer mon compte');
  const form = h('form', { class: 'form', novalidate: true }, Object.values(F).map((f) => f.el), status, btn);

  form.addEventListener('submit', async (ev) => {
    ev.preventDefault(); replaceContent(status); Object.values(F).forEach((f) => f.error(''));
    const v = { name: F.name.input.value, phone: F.phone.input.value, email: F.email.input.value, password: F.password.input.value, confirm: F.confirm.input.value };
    const errors = validateSignup(v);
    for (const [k, m] of Object.entries(errors)) F[k].error(m);
    const first = Object.keys(errors)[0];
    if (first) { F[first].input.focus(); return; }
    btn.disabled = true; btn.textContent = 'Création…';
    const { data, error } = await getClient().auth.signUp({
      email: v.email.trim(), password: v.password,
      options: { data: { full_name: v.name.trim(), phone: v.phone.trim() }, emailRedirectTo: new URL('connexion.html', location.href).href },
    });
    btn.disabled = false; btn.textContent = 'Créer mon compte';
    if (error) { replaceContent(status, h('div', { class: 'alert alert-error', role: 'alert' }, authMessage(error))); return; }
    if (data.session) { location.assign(next); return; }
    // Adresse déjà inscrite : le service ne le dit pas (pour ne pas révéler qui a un compte).
    const ambiguous = data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0;
    replaceContent(root, h('div', { class: 'auth-card' }, h('h1', {}, 'Vérifiez votre e-mail'),
      h('p', { class: 'alert alert-success', role: 'status' }, ambiguous
        ? `Si l'adresse ${v.email.trim()} n'est pas déjà utilisée, votre compte vient d'être créé et un e-mail de confirmation vous a été envoyé. Sinon, connectez-vous ou réinitialisez votre mot de passe.`
        : `Votre compte est créé. Un e-mail de confirmation a été envoyé à ${v.email.trim()}. Cliquez sur le lien qu'il contient, puis connectez-vous.`),
      h('p', { class: 'muted' }, 'Pensez à regarder dans les courriers indésirables.'),
      h('div', { class: 'auth-links' }, h('a', { href: `connexion.html${keep}` }, 'Aller à la connexion'), h('a', { href: 'mot-de-passe-oublie.html' }, 'Mot de passe oublié ?'))));
  });

  replaceContent(root, h('div', { class: 'auth-card' }, h('h1', {}, 'Créer un compte'), form,
    h('div', { class: 'auth-links' }, h('a', { href: `connexion.html${keep}` }, 'Déjà un compte ? Se connecter'))));
  F.name.input.focus();
})();
