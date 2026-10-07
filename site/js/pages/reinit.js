// Le lien reçu par e-mail ouvre cette page avec un jeton dans l'adresse ; supabase-js le lit et ouvre une
// session temporaire. On capture l'adresse AVANT toute initialisation (la bibliothèque efface le jeton).
const startHash = location.hash;
import { getClient, isConfigured, isDemo } from '../api.js';
import { $, h, loadChrome, replaceContent, setMeta } from '../ui.js';
import { field } from '../forms.js';
import { authMessage } from '../auth.js';

loadChrome('login').then((s) => setMeta('Nouveau mot de passe', '', s.site_name));
const root = $('#auth-root');
const invalid = () => replaceContent(root, h('div', { class: 'auth-card' }, h('h1', {}, 'Lien invalide ou expiré'),
  h('p', { class: 'alert alert-error', role: 'alert' }, "Ce lien de réinitialisation n'est plus valable (il ne sert qu'une fois et expire rapidement)."),
  h('div', { class: 'auth-links' }, h('a', { href: 'mot-de-passe-oublie.html' }, 'Demander un nouveau lien'))));

(async () => {
  if (!isConfigured() || isDemo()) { invalid(); return; }
  const { data: { session } } = await getClient().auth.getSession();
  if (!session || !/type=recovery/.test(startHash)) { invalid(); return; }

  const F = {
    password: field({ id: 'n-pass', label: 'Nouveau mot de passe', type: 'password', required: true, autocomplete: 'new-password', reveal: true, hint: '8 caractères minimum.' }),
    confirm: field({ id: 'n-confirm', label: 'Confirmer le nouveau mot de passe', type: 'password', required: true, autocomplete: 'new-password', reveal: true }),
  };
  const status = h('div', { 'aria-live': 'polite' });
  const btn = h('button', { class: 'btn btn-primary btn-block', type: 'submit' }, 'Enregistrer le mot de passe');
  const form = h('form', { class: 'form', novalidate: true }, F.password.el, F.confirm.el, status, btn);
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault(); replaceContent(status); F.password.error(''); F.confirm.error('');
    if (F.password.input.value.length < 8) { F.password.error('8 caractères minimum.'); F.password.input.focus(); return; }
    if (F.confirm.input.value !== F.password.input.value) { F.confirm.error('Les deux mots de passe ne sont pas identiques.'); F.confirm.input.focus(); return; }
    btn.disabled = true;
    const { error } = await getClient().auth.updateUser({ password: F.password.input.value });
    btn.disabled = false;
    if (error) { replaceContent(status, h('div', { class: 'alert alert-error', role: 'alert' }, authMessage(error))); return; }
    replaceContent(root, h('div', { class: 'auth-card' }, h('h1', {}, 'Mot de passe modifié'),
      h('p', { class: 'alert alert-success', role: 'status' }, 'Votre nouveau mot de passe est enregistré. Vous êtes connecté.'),
      h('div', { class: 'actions' }, h('a', { class: 'btn btn-primary', href: 'mon-espace.html' }, 'Aller à mon espace'))));
  });
  replaceContent(root, h('div', { class: 'auth-card' }, h('h1', {}, 'Nouveau mot de passe'), form));
  F.password.input.focus();
})();
