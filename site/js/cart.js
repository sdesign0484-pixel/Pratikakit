// Panier : seulement des identifiants d'outils, gardés dans le navigateur. Les PRIX ne sont jamais stockés
// ici : ils sont relus dans la base à l'affichage et à la commande.
const KEY = 'pf_cart', MAX = 20, UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
let memory = [];  // repli si le stockage du navigateur est indisponible (navigation privée stricte)

function read() {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || '[]');
    return Array.isArray(v) ? [...new Set(v.filter((x) => typeof x === 'string' && UUID.test(x)))].slice(0, MAX) : [];
  } catch (_) { return memory; }
}
function write(ids) {
  memory = ids;
  try { localStorage.setItem(KEY, JSON.stringify(ids)); } catch (_) { /* repli mémoire */ }
  window.dispatchEvent(new Event('pf-cart'));
}

export const cart = {
  ids: read,
  has: (id) => read().includes(id),
  count: () => read().length,
  add(id) { const ids = read(); if (!ids.includes(id) && ids.length < MAX) { ids.push(id); write(ids); } return ids.length <= MAX; },
  remove(id) { write(read().filter((x) => x !== id)); },
  removeMany(list) { const s = new Set(list); write(read().filter((x) => !s.has(x))); },
};
