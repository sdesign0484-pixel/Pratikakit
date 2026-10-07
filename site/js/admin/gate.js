// Porte d'entrée de l'administration : connexion → rôle admin → double authentification (TOTP).
// Le contrôle réel est dans la base (is_admin exige aal2) ; cet écran n'est qu'un guide.
import { getClient } from '../api.js';
import { h, replaceContent } from '../ui.js';
import { field } from './lib.js';

const card = (title, ...children) => h('main', { class: 'auth-card', id: 'main' }, h('h1', {}, title), ...children);

export function startGate(root, onReady) {
  const sb = getClient();
  const show = (...nodes) => replaceContent(root, ...nodes);

  async function evaluate() {
    show(card('Administration', h('p', { class: 'muted', role: 'status' }, 'Vérification de la session…')));
    const { data: { session } } = await sb.auth.getSession();
    if (!session) return showLogin();

    const { data: prof, error } = await sb.from('profiles').select('role,status').eq('id', session.user.id).maybeSingle();
    if (error) return showFatal("Impossible de lire votre profil. Vérifiez que schema.sql a bien été exécuté.");
    if (!prof || prof.role !== 'admin' || prof.status !== 'active') return showDenied(session.user.email);

    const { data: aal } = await sb.auth.mfa.getAuthenticatorAssuranceLevel();
    if (aal && aal.currentLevel === 'aal2') {
      const { data: ok } = await sb.rpc('is_admin');
      if (ok === true) return onReady(session);
      return showDenied(session.user.email);
    }
    const { data: f } = await sb.auth.mfa.listFactors();
    if (f && f.totp && f.totp.length) return showVerify(f.totp[0].id);
    return showEnroll();
  }

  function showFatal(text) { show(card('Administration', h('div', { class: 'alert alert-error', role: 'alert' }, text), signOutButton())); }
  const signOutButton = () => h('button', { class: 'btn btn-ghost', type: 'button', onclick: async () => { await sb.auth.signOut(); location.reload(); } }, 'Se déconnecter');

  function showDenied(email) {
    show(card("Accès réservé", h('p', { class: 'alert alert-error', role: 'alert' }, `Le compte ${email} n'a pas les droits d'administration.`), h('div', { class: 'actions' }, signOutButton())));
  }

  function showLogin(message) {
    const email = field({ id: 'a-email', label: 'Adresse e-mail', type: 'email', required: true });
    const pass = field({ id: 'a-pass', label: 'Mot de passe', type: 'password', required: true });
    email.input.setAttribute('autocomplete', 'username'); pass.input.setAttribute('autocomplete', 'current-password');
    const status = h('div', { 'aria-live': 'polite' });
    const btn = h('button', { class: 'btn btn-primary btn-block', type: 'submit' }, 'Se connecter');
    const form = h('form', { class: 'form', novalidate: true }, email.el, pass.el, status, btn);
    form.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      replaceContent(status); email.error(''); pass.error('');
      if (!email.input.value.trim()) { email.error('Indiquez votre adresse e-mail.'); email.input.focus(); return; }
      if (!pass.input.value) { pass.error('Indiquez votre mot de passe.'); pass.input.focus(); return; }
      btn.disabled = true; btn.textContent = 'Connexion…';
      const { error } = await sb.auth.signInWithPassword({ email: email.input.value.trim(), password: pass.input.value });
      btn.disabled = false; btn.textContent = 'Se connecter';
      if (error) {
        const bad = /invalid login|credentials/i.test(error.message);
        const limited = error.status === 429;
        replaceContent(status, h('div', { class: 'alert alert-error', role: 'alert' },
          bad ? 'E-mail ou mot de passe incorrect.' : limited ? 'Trop de tentatives. Patientez quelques minutes.' : 'Connexion impossible. Vérifiez votre réseau puis réessayez.'));
        return;
      }
      evaluate();
    });
    show(card('Administration', h('p', { class: 'muted' }, 'Connectez-vous avec votre compte administrateur.'), message ? h('p', { class: 'alert alert-info' }, message) : null, form));
    email.input.focus();
  }

  function codeForm({ intro, button, onSubmit, extra }) {
    const code = field({ id: 'a-code', label: 'Code à 6 chiffres', required: true, maxlength: 6, inputmode: 'numeric', pattern: '[0-9]*' });
    code.input.setAttribute('autocomplete', 'one-time-code');
    const status = h('div', { 'aria-live': 'polite' });
    const btn = h('button', { class: 'btn btn-primary btn-block', type: 'submit' }, button);
    const form = h('form', { class: 'form', novalidate: true }, intro, extra, code.el, status, btn);
    form.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      replaceContent(status); code.error('');
      const v = code.input.value.replace(/\s/g, '');
      if (!/^\d{6}$/.test(v)) { code.error('Saisissez les 6 chiffres affichés dans votre application.'); code.input.focus(); return; }
      btn.disabled = true;
      const err = await onSubmit(v);
      btn.disabled = false;
      if (err) replaceContent(status, h('div', { class: 'alert alert-error', role: 'alert' }, "Code incorrect ou expiré. Vérifiez aussi que l'heure de votre téléphone est automatique."));
      else evaluate();
    });
    return { form, code };
  }

  function showVerify(factorId) {
    const { form, code } = codeForm({
      intro: h('p', { class: 'muted' }, "Ouvrez votre application d'authentification et saisissez le code actuel."),
      button: 'Valider',
      onSubmit: async (v) => (await sb.auth.mfa.challengeAndVerify({ factorId, code: v })).error,
    });
    show(card('Double authentification', form, h('div', { class: 'actions' }, signOutButton())));
    code.input.focus();
  }

  async function showEnroll() {
    show(card('Double authentification', h('p', { class: 'muted', role: 'status' }, 'Préparation…')));
    const { data: all } = await sb.auth.mfa.listFactors();
    for (const f of (all && all.all) || []) if (f.status !== 'verified') await sb.auth.mfa.unenroll({ factorId: f.id });  // reprise d'une activation interrompue
    const { data, error } = await sb.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'Administration' });
    if (error) return showFatal("Impossible de démarrer l'activation de la double authentification. Réessayez.");
    const { form, code } = codeForm({
      intro: h('p', { class: 'muted' }, "L'administration exige une double authentification. Scannez ce QR code avec une application d'authentification (Google Authenticator, Microsoft Authenticator, Aegis…), puis saisissez le code affiché."),
      extra: [
        h('img', { class: 'qr', src: data.totp.qr_code, alt: "QR code à scanner avec l'application d'authentification" }),
        h('p', { class: 'hint' }, 'Impossible de scanner ? Saisissez cette clé dans l\'application :'),
        h('p', { class: 'secret', 'data-secret': 'yes' }, data.totp.secret),
      ],
      button: 'Activer et continuer',
      onSubmit: async (v) => (await sb.auth.mfa.challengeAndVerify({ factorId: data.id, code: v })).error,
    });
    show(card('Activer la double authentification', form, h('div', { class: 'actions' }, signOutButton())));
    code.input.focus();
  }

  evaluate();
}
