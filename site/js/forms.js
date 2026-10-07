// Champs de formulaire accessibles (label, aide, message d'erreur lié), partagés par le site et l'admin.
import { h } from './ui.js';

// Retourne { el, input, error(msg) }. type: text | textarea | select | number | url | email | tel | date | password
export function field({ id, label, type = 'text', value = '', hint, required = false, maxlength, rows = 4, options = [], placeholder, min, step, pattern, inputmode, autocomplete = 'off', reveal = false }) {
  let input;
  if (type === 'textarea') input = h('textarea', { class: 'textarea', id, rows, maxlength, placeholder });
  else if (type === 'select') input = h('select', { class: 'input', id }, options.map((o) => h('option', { value: o.value }, o.label)));
  else input = h('input', { class: 'input', id, type, maxlength, placeholder, min, step, pattern, inputmode, autocomplete });
  input.value = value ?? '';
  if (required) input.setAttribute('required', '');
  const err = h('p', { class: 'field-error', id: `err-${id}` });
  input.setAttribute('aria-describedby', (hint ? `hint-${id} ` : '') + `err-${id}`);
  let control = input;
  if (reveal) {
    const toggle = h('button', { class: 'reveal', type: 'button', 'aria-controls': id, 'aria-pressed': 'false' }, 'Afficher');
    toggle.addEventListener('click', () => {
      const show = input.type === 'password';
      input.type = show ? 'text' : 'password';
      toggle.textContent = show ? 'Masquer' : 'Afficher';
      toggle.setAttribute('aria-pressed', String(show));
    });
    control = h('div', { class: 'input-wrap' }, input, toggle);
  }
  const el = h('div', { class: 'field' }, h('label', { for: id }, label, required ? h('span', { class: 'req', 'aria-hidden': 'true' }, ' *') : null), control, hint ? h('p', { class: 'hint', id: `hint-${id}` }, hint) : null, err);
  return {
    el, input,
    error(msg) { err.textContent = msg || ''; if (msg) input.setAttribute('aria-invalid', 'true'); else input.removeAttribute('aria-invalid'); },
  };
}

export function checkbox({ id, label, checked = false, hint }) {
  const input = h('input', { type: 'checkbox', id });
  input.checked = checked;
  return { el: h('div', { class: 'checkbox' }, input, h('label', { for: id }, label, hint ? h('span', { class: 'hint block' }, hint) : null)), input };
}
