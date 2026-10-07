// Appels « boutique » côté client. Les règles (prix, accès, doublons) sont appliquées par la base :
// cette couche ne fait que transmettre et traduire les erreurs.
import { getClient, ApiError } from './api.js';
import { ERROR_TEXT } from './ui.js';

async function call(builder) {
  if (builder && typeof builder.retry === 'function') builder = builder.retry(false);
  const { data, error } = await builder;
  if (error) throw new ApiError(error.code ? 'server' : 'network', error.message, error.code);
  return data;
}
const sb = () => getClient();

export const createOrder = (ids) => call(sb().rpc('create_order', { p_tool_ids: ids }));
export const claimFree = (toolId) => call(sb().rpc('claim_free_tool', { p_tool_id: toolId }));
export const myTools = () => call(sb().rpc('my_tools'));
export const getToolPayload = (toolId) => call(sb().rpc('get_tool_payload', { p_tool_id: toolId }));
export const getProfile = (uid) => call(sb().from('profiles').select('full_name,phone,email,status').eq('id', uid).maybeSingle());
export const updateProfile = (uid, row) => call(sb().from('profiles').update(row).eq('id', uid));
export const myOrders = () => call(sb().from('orders').select('id,reference,status,total_amount,created_at,order_items(unit_price,tools(name)),payments(method,transaction_ref,created_at)').order('created_at', { ascending: false }).limit(100));
export const orderByRef = (ref) => call(sb().from('orders').select('id,reference,status,total_amount,created_at,order_items(unit_price,tools(name,slug)),payments(method,transaction_ref,created_at)').eq('reference', ref).maybeSingle());

const TOKEN_TEXT = {
  NOT_AUTHENTICATED: 'Connectez-vous pour continuer.',
  ACCOUNT_SUSPENDED: 'Votre compte est suspendu. Contactez-nous depuis la page Contact.',
  RATE_LIMITED: 'Trop de demandes en peu de temps. Réessayez dans un instant.',
  INVALID_CART: 'Panier invalide.',
  TOOL_NOT_PURCHASABLE: "Un des outils n'est plus en vente. Actualisez le panier.",
  TOOL_NOT_FREE: "Cet outil n'est plus gratuit.",
  ALREADY_OWNED: 'Vous avez déjà accès à un de ces outils : retirez-le du panier.',
  TOO_MANY_PENDING: "Vous avez déjà 5 commandes en attente de paiement. Réglez-les ou contactez-nous avant d'en créer une nouvelle.",
  ACCESS_DENIED: "Vous n'avez pas accès à cet outil.",
  ACCESS_REVOKED: "Votre accès à cet outil a été retiré. Contactez-nous depuis la page Contact.",
  ACCESS_NOT_STARTED: "Votre accès à cet outil n'est pas encore actif.",
  ACCESS_EXPIRED: 'Votre accès à cet outil a expiré. Vous pouvez le commander à nouveau.',
  TOOL_UNAVAILABLE: 'Cet outil est momentanément indisponible.',
  LAUNCHER_TIMEOUT: "Le lanceur d'outils ne répond pas. Vérifiez TOOLS_ORIGIN et le déploiement du dossier tools-site.",
};
export function shopMessage(err) {
  if (err && TOKEN_TEXT[err.message]) return TOKEN_TEXT[err.message];
  if (err && err.kind === 'network') return ERROR_TEXT.network;
  return 'Une erreur est survenue. Réessayez dans un instant.';
}
export const isToken = (err, token) => Boolean(err && err.message === token);
