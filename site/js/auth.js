// Session et messages d'authentification (Supabase Auth). Le contrôle réel des accès est dans la base.
import { getClient, isConfigured, isDemo } from './api.js';

export async function currentUser() {
  if (!isConfigured() || isDemo()) return null;
  try { const { data: { session } } = await getClient().auth.getSession(); return session ? session.user : null; } catch (_) { return null; }
}

// Redirection après connexion : uniquement vers une page du site (jamais vers une autre adresse).
const NEXT_OK = /^[a-z0-9_-]+\.html(\?[A-Za-z0-9_=&%.\-]*)?$/;
export const safeNext = (raw, fallback = 'mon-espace.html') => (typeof raw === 'string' && NEXT_OK.test(raw) ? raw : fallback);
export const loginUrl = (next) => `connexion.html?next=${encodeURIComponent(next)}`;
export const signOut = () => getClient().auth.signOut();

export function authMessage(error) {
  const msg = String((error && error.message) || '');
  const code = (error && (error.code || error.error_code)) || '';
  if (/invalid login credentials/i.test(msg) || code === 'invalid_credentials') return 'E-mail ou mot de passe incorrect.';
  if (/not confirmed/i.test(msg) || code === 'email_not_confirmed') return "Adresse e-mail non confirmée. Ouvrez le message de confirmation reçu par e-mail, puis connectez-vous.";
  if (/already registered/i.test(msg) || code === 'user_already_exists') return 'Un compte existe déjà avec cette adresse. Connectez-vous ou réinitialisez votre mot de passe.';
  if (code === 'weak_password' || /password.*(short|weak|least)/i.test(msg)) return 'Mot de passe trop faible : 8 caractères minimum.';
  if (code === 'same_password' || /different from the old/i.test(msg)) return "Le nouveau mot de passe doit être différent de l'ancien.";
  if (error && (error.status === 429 || /rate limit|too many/i.test(msg) || /over_.*rate_limit/.test(code))) return 'Trop de demandes en peu de temps. Patientez quelques minutes puis réessayez.';
  if (!error || !error.status) return 'Connexion impossible. Vérifiez votre réseau puis réessayez.';
  return 'Une erreur est survenue. Réessayez dans un instant.';
}
export const isUnconfirmed = (error) => /not confirmed/i.test(String((error && error.message) || '')) || (error && error.code === 'email_not_confirmed');
