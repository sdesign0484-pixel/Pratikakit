import { getClient, isConfigured, isDemo } from '../api.js';
import { $, h, loadChrome, replaceContent, setMeta } from '../ui.js';
import { field } from '../forms.js';
import { authMessage } from '../auth.js';

loadChrome('login').then((s) => setMeta('Mot de passe oublié', '', s.site_name));
const root = $('#auth-root');

if (!isConfigured() || isDemo()) {
  replaceContent(root, h('div', { class: 'auth-card' }, h('h1', {}, 'Mot de passe oublié'), h('p', { class: 'alert alert-info' }, isDemo() ? 'Mode démonstration : indisponible.' : "Le site n'est pas encore relié à sa base de données (js/config.js).")));
} else {
  const email = field({ id: 'f-email', label: 'Adresse e-mail de votre compte', type: 'email', required: true, autocomplete: 'email', inputmode: 'email' });
  const status = h('div', { 'aria-live': 'polite' });
  const btn = h('button', { class: 'btn btn-primary btn-block', type: 'submit' }, 'Envoyer le lien');
  const form = h('form', { class: 'form', novalidate: true }, email.el, status, btn);
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault(); replaceContent(status); email.error('');
    const e = email.input.value.trim();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) { email.error("Indiquez une adresse e-mail valide."); email.input.focus(); return; }
    btn.disabled = true; btn.textContent = 'Envoi…';
    const { error } = await getClient().auth.resetPasswordForEmail(e, { redirectTo: new URL('reinitialiser.html', location.href).href });
    btn.disabled = false; btn.textContent = 'Envoyer le lien';
    if (error) { replaceContent(status, h('div', { class: 'alert alert-error', role: 'alert' }, authMessage(error))); return; }
    replaceContent(status, h('div', { class: 'alert alert-success', role: 'status' }, "Si un compte existe avec cette adresse, un e-mail contenant un lien de réinitialisation vient d'être envoyé. Pensez à regarder dans les courriers indésirables."));
  });
  replaceContent(root, h('div', { class: 'auth-card' }, h('h1', {}, 'Mot de passe oublié'), h('p', { class: 'muted' }, 'Indiquez votre adresse e-mail : nous vous envoyons un lien pour choisir un nouveau mot de passe.'), form,
    h('div', { class: 'auth-links' }, h('a', { href: 'connexion.html' }, 'Retour à la connexion'))));
  email.input.focus();
}
