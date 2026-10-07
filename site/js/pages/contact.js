import { submitContact } from '../api.js';
import { $, h, loadChrome, replaceContent, setMeta, whatsappUrl, mailUrl } from '../ui.js';

const settingsP = loadChrome('contact');
let settings = null;
settingsP.then((s) => {
  settings = s;
  setMeta('Contact', 'Écrivez-nous : question, demande de renseignements ou besoin d\'un outil sur mesure.', s.site_name);
  const wa = whatsappUrl(s.whatsapp_number), mail = mailUrl(s.contact_email);
  replaceContent($('#other-contact'),
    h('h2', {}, 'Autres moyens de nous joindre'),
    wa ? h('p', { class: 'contact-line' }, h('span', {}, 'WhatsApp'), h('a', { href: wa, target: '_blank', rel: 'noopener' }, s.whatsapp_number)) : null,
    mail ? h('p', { class: 'contact-line' }, h('span', {}, 'E-mail'), h('a', { href: mail }, s.contact_email)) : null,
    !wa && !mail ? h('p', { class: 'muted' }, 'Les autres moyens de contact seront ajoutés prochainement. Utilisez le formulaire.') : null);
});

const form = $('#contact-form'), status = $('#form-status'), submit = $('#submit-btn');
const presetSubject = new URLSearchParams(location.search).get('sujet');
if (presetSubject) $('#f-subject').value = presetSubject.slice(0, 200);
const fields = {
  name: $('#f-name'), email: $('#f-email'), subject: $('#f-subject'), message: $('#f-message'),
};

// Mêmes règles que la base de données (submit_contact_message).
export function validate(v) {
  const e = {};
  const name = v.name.trim(), email = v.email.trim(), subject = v.subject.trim(), message = v.message.trim();
  if (!name) e.name = 'Indiquez votre nom.'; else if (name.length > 120) e.name = '120 caractères maximum.';
  if (!email) e.email = 'Indiquez votre adresse e-mail.';
  else if (email.length > 254 || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) e.email = "Cette adresse e-mail n'est pas valide.";
  if (!subject) e.subject = "Indiquez l'objet de votre message."; else if (subject.length > 200) e.subject = '200 caractères maximum.';
  if (message.length < 10) e.message = 'Votre message doit faire au moins 10 caractères.'; else if (message.length > 5000) e.message = '5 000 caractères maximum.';
  return e;
}

function showErrors(errors) {
  for (const [key, input] of Object.entries(fields)) {
    const msg = errors[key] || '';
    $(`#err-${key}`).textContent = msg;
    if (msg) input.setAttribute('aria-invalid', 'true'); else input.removeAttribute('aria-invalid');
  }
}

function failureMessage(err) {
  const wa = settings && whatsappUrl(settings.whatsapp_number);
  if (err.kind === 'demo') return "Mode démonstration : aucun message n'est envoyé.";
  if (err.kind === 'not_configured') return "Le formulaire n'est pas encore relié à la base de données (js/config.js). Votre message n'a pas été envoyé.";
  if (err.kind === 'network') return "Connexion impossible. Vérifiez votre réseau puis réessayez. Votre message n'a pas été envoyé.";
  if (err.message === 'INVALID_INPUT') return "Le message a été refusé : vérifiez l'adresse e-mail et la longueur des champs. Il n'a pas été envoyé.";
  if (err.message === 'RATE_LIMITED') return `Trop de messages envoyés en peu de temps. Réessayez plus tard${wa ? ' ou écrivez-nous sur WhatsApp' : ''}. Votre message n'a pas été envoyé.`;
  if (err.message === 'SPAM_DETECTED') return 'Message refusé par le filtre anti-spam. Il n\'a pas été envoyé.';
  return "Une erreur est survenue : votre message n'a pas été envoyé. Réessayez.";
}

form.addEventListener('submit', async (ev) => {
  ev.preventDefault();
  replaceContent(status);
  const values = { name: fields.name.value, email: fields.email.value, subject: fields.subject.value, message: fields.message.value };
  const errors = validate(values);
  showErrors(errors);
  const firstBad = Object.keys(fields).find((k) => errors[k]);
  if (firstBad) { fields[firstBad].focus(); return; }

  submit.disabled = true; submit.textContent = 'Envoi en cours…';
  try {
    await submitContact({ ...values, hp: $('#f-website').value });
    form.hidden = true;
    replaceContent(status, h('div', { class: 'alert alert-success', role: 'status' },
      h('p', {}, 'Message envoyé. Nous vous répondrons dès que possible.'),
      h('button', { class: 'btn btn-ghost', type: 'button', onclick: () => { form.reset(); form.hidden = false; replaceContent(status); fields.name.focus(); } }, 'Envoyer un autre message')));
  } catch (err) {
    replaceContent(status, h('div', { class: 'alert alert-error', role: 'alert' }, failureMessage(err)));
  } finally {
    submit.disabled = false; submit.textContent = 'Envoyer le message';
  }
});
