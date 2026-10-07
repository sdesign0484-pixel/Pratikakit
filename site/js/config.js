// ============================================================
// CONFIGURATION — le seul fichier à modifier pour brancher le site.
// ============================================================
export const CONFIG = {
  // Supabase → Project Settings → API
  SUPABASE_URL: 'https://lxemspwydeaetxegixth.supabase.co',        // ex. 'https://abcdefgh.supabase.co'
  // Clé PUBLIQUE (« anon » ou « publishable »). Elle peut apparaître dans le code du site.
  // Ne JAMAIS y coller la clé « service_role » ou « secret ».
  SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx4ZW1zcHd5ZGVhZXR4ZWdpeHRoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTExMzgyNzcsImV4cCI6MjEwNjcxNDI3N30.iZWXENPw9uCwJ8ZnvIFLM99hkeWtujmekDNvJhwedis',

  // Fonctions activées. Passer `auth` à true quand connexion.html existera (étape suivante) :
  // les boutons « Acheter » / « Obtenir » des fiches pointeront alors vers la connexion.
  FEATURES: { auth: false },

  // Libellé de la devise affiché après les prix (les prix sont stockés en Ariary).
  CURRENCY_LABEL: 'Ar',
};
