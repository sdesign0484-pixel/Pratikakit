import { getClient, isConfigured, isDemo } from '../api.js';
import { $, h, loadChrome, replaceContent, setMeta } from '../ui.js';
import { field } from '../forms.js';
import { currentUser, safeNext, authMessage, isUnconfirmed } from '../auth.js';

loadChrome('login').then((s) => setMeta('Connexion', '', s.site_name));
const root = $('#auth-root');
const params = new URLSearchParams(location.search);
const rawNext = params.get('next');
const next = safeNext(rawNext);
const keep = rawNext && safeNext(rawNext, null) ? `?next=${encodeURIComponent(rawNext)}` : '';

(async () => {
  if (!isConfigured() || isDemo()) {
    replaceContent(root, h('div', { class: 'auth-card' }, h('h1', {}, 'Connexion'), h('p', { class: 'alert alert-info' }, isDemo() ? 'Mode démonstration : la connexion est désactivée.' : "Le site n'est pas encore relié à sa base de données (js/config.js).")));
    return;
  }
  if (await currentUser()) { location.replace(next); return; }

  const email = field({ id: 'l-email', label: 'Adresse e-mail', type: 'email', required: true, autocomplete: 'username', inputmode: 'email' });
  const pass = field({ id: 'l-pass', label: 'Mot de passe', type: 'password', required: true, autocomplete: 'current-password', reveal: true });
  const status = h('div', { 'aria-live': 'polite' });
  const btn = h('button', { class: 'btn btn-primary btn-block', type: 'submit' }, 'Se connecter');
  const form = h('form', { class: 'form', novalidate: true }, email.el, pass.el, status, btn);

  form.addEventListener('submit', async (ev) => {
    ev.preventDefault(); replaceContent(status); email.error(''); pass.error('');
    const e = email.input.value.trim();
    if (!e) { email.error('Indiquez votre adresse e-mail.'); email.input.focus(); return; }
    if (!pass.input.value) { pass.error('Indiquez votre mot de passe.'); pass.input.focus(); return; }
    btn.disabled = true; btn.textContent = 'Connexion…';
    const { error } = await getClient().auth.signInWithPassword({ email: e, password: pass.input.value });
    if (!error) { location.assign(next); return; }
    btn.disabled = false; btn.textContent = 'Se connecter';
    const resend = isUnconfirmed(error) ? h('button', { class: 'btn btn-ghost btn-sm', type: 'button', onclick: async (clickEv) => {
      clickEv.target.disabled = true;
      const r = await getClient().auth.resend({ type: 'signup', email: e, options: { emailRedirectTo: new URL('connexion.html', location.href).href } });
      replaceContent(status, h('div', { class: r.error ? 'alert alert-error' : 'alert alert-success', role: r.error ? 'alert' : 'status' }, r.error ? authMessage(r.error) : 'E-mail de confirmation renvoyé. Vérifiez votre boîte de réception et vos courriers indésirables.'));
    } }, "Renvoyer l'e-mail de confirmation") : null;
    replaceContent(status, h('div', { class: 'alert alert-error', role: 'alert' }, authMessage(error)), resend);
  });

  replaceContent(root, h('div', { class: 'auth-card' }, h('h1', {}, 'Connexion'), form,
    h('div', { class: 'auth-links' },
      h('a', { href: 'mot-de-passe-oublie.html' }, 'Mot de passe oublié ?'),
      h('a', { href: `inscription.html${keep}` }, "Pas encore de compte ? Créer un compte"))));
  email.input.focus();
})();
