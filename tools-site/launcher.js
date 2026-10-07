// Lanceur d'outils : reçoit le HTML d'un outil depuis le site principal (postMessage) et l'affiche ici.
// Cette adresse n'a AUCUNE session ni donnée du site principal : l'outil y est isolé.
import { PLATFORM_ORIGINS } from './config.js';

const status = document.getElementById('status');
const opener = window.opener;

if (!PLATFORM_ORIGINS.length) {
  status.textContent = "Lanceur non configuré : renseignez PLATFORM_ORIGINS dans config.js.";
} else if (!opener) {
  status.textContent = 'Ouvrez cet outil depuis votre espace client.';
} else {
  let done = false, tries = 0;
  const ping = () => PLATFORM_ORIGINS.forEach((o) => { try { opener.postMessage({ type: 'pf-ready' }, o); } catch (_) { /* origine non joignable */ } });

  window.addEventListener('message', (ev) => {
    if (done || ev.source !== opener || !PLATFORM_ORIGINS.includes(ev.origin)) return;   // site inconnu : ignoré
    const d = ev.data;
    if (!d || d.type !== 'pf-tool' || typeof d.html !== 'string' || d.html.length > 6000000) return;
    done = true; clearInterval(timer);
    try { window.opener = null; } catch (_) { /* rien */ }  // l'outil ne doit pas pouvoir piloter le site principal
    document.open(); document.write(d.html); document.close();
  });

  ping();
  const timer = setInterval(() => { if (done || ++tries > 30) clearInterval(timer); else ping(); }, 400);
}
