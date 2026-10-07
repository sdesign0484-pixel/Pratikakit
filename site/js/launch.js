// Ouverture d'un outil acheté.
//  - lien externe : nouvel onglet détaché de cette page ;
//  - fichier HTML : la page « lanceur » du sous-domaine des outils reçoit le HTML par postMessage et
//    l'affiche. L'outil s'exécute donc sur SON origine (autre stockage, aucune session ici).
import { CONFIG } from './config.js';
import { ApiError } from './api.js';
import { getToolPayload, shopMessage } from './shop.js';

export async function launchTool(tool, onError) {
  const html = tool.distribution_type === 'html_standalone';
  let origin = null;
  if (html) {
    try { origin = new URL(CONFIG.TOOLS_ORIGIN).origin; } catch (_) {
      onError("L'ouverture des outils HTML n'est pas encore configurée sur ce site (TOOLS_ORIGIN dans js/config.js).");
      return;
    }
  }
  // La fenêtre est ouverte tout de suite (pendant le clic) pour ne pas être prise pour un pop-up publicitaire.
  const w = window.open(html ? `${origin}/launcher.html` : 'about:blank', '_blank');
  if (!w) { onError("Votre navigateur a bloqué l'ouverture de l'outil. Autorisez les fenêtres pop-up pour ce site puis réessayez."); return; }

  let stop = () => {};
  const ready = html ? new Promise((resolve, reject) => {
    const timer = setTimeout(() => { stop(); reject(new ApiError('network', 'LAUNCHER_TIMEOUT')); }, 12000);
    const onMsg = (ev) => { if (ev.origin === origin && ev.source === w && ev.data && ev.data.type === 'pf-ready') { stop(); resolve(); } };
    stop = () => { clearTimeout(timer); window.removeEventListener('message', onMsg); };
    window.addEventListener('message', onMsg);
  }) : Promise.resolve();

  try {
    const [payload] = await Promise.all([getToolPayload(tool.tool_id), ready]);
    if (payload.type === 'external_url') {
      try { w.opener = null; } catch (_) { /* déjà détachée */ }
      w.location.href = payload.url;
    } else {
      w.postMessage({ type: 'pf-tool', name: payload.name, html: payload.html }, origin);
    }
  } catch (err) {
    stop();
    try { w.close(); } catch (_) { /* rien */ }
    onError(shopMessage(err));
  }
}
