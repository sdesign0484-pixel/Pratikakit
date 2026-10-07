# Plateforme d'outils numériques — étape 3 : comptes clients, commande, ouverture des outils

Site en HTML/CSS/JavaScript (sans framework ni étape de build) + base Supabase.
Étape 1 : catalogue et contact. Étape 2 : administration. **Étape 3 (cette version) : inscription et connexion des clients, panier, commande par référence `CMD-…`, espace « Mes applications », ouverture des outils.**

```
plateforme-outils/
├── netlify.toml, vercel.json     hébergement du site principal (dossier site/)
├── site/                         ← site principal
│   ├── index, catalogue, outil, contact, 404 .html
│   ├── connexion, inscription, mot-de-passe-oublie, reinitialiser .html
│   ├── panier, commande, mon-espace .html
│   ├── admin/index.html          administration
│   ├── css/  js/ (config.js ← à renseigner ; pages/, admin/, vendor/)
│   └── _headers                  sécurité (Netlify)
├── tools-site/                   ← SECOND site : le « lanceur d'outils » (sous-domaine séparé)
└── supabase/                     schema.sql (neuf), patch-v0.2.sql (migration), tests/
```

## 1. Mise en service (dans cet ordre)

**a. Base** — rien de nouveau : `schema.sql` / `patch-v0.2.sql` de l'étape 2 suffisent (aucune table ajoutée).

**b. Réglages Supabase → Authentication** (à faire une fois) :
- *Sign In / Providers* : **« Allow new users to sign up » doit être activé** (les clients s'inscrivent ; si vous l'aviez désactivé à l'étape 2, réactivez-le). Longueur minimale du mot de passe : **8**.
- *URL Configuration* : « Site URL » = adresse de production ; « Redirect URLs » = ajouter les adresses de test (Vercel) **et** de production (Netlify), par ex. `https://mon-test.vercel.app/**` et `https://www.mondomaine.mg/**`. Sans cela, les liens de confirmation et de réinitialisation échouent.
- *E-mails* : garder « Confirm email » activé. **Le service d'envoi intégré de Supabase est très limité** (quelques e-mails par heure) : avant le lancement, brancher un vrai service d'envoi (SMTP personnalisé : Resend, Brevo, etc.). Traduire en français les modèles « Confirm signup » et « Reset password ».

**c. Site principal** — dans `site/js/config.js` : `FEATURES: { auth: true }` (mettre `false` pour fermer la boutique : les achats redeviennent inactifs) et `TOOLS_ORIGIN` (étape d). Redéployer.

**d. Lanceur d'outils** — déployer le dossier `tools-site/` comme **site séparé** sur un sous-domaine (ex. `outils.mondomaine.mg`) ; en test, un second projet Vercel dont le « Root Directory » est `tools-site`. Dans `tools-site/config.js`, mettre l'adresse du site principal dans `PLATFORM_ORIGINS` (ex. `['https://mon-test.vercel.app']`) et redéployer. Puis reporter l'adresse du lanceur dans `TOOLS_ORIGIN` du site principal (sans « / » final). Ne pas ajouter de CSP au lanceur et ne pas activer `Cross-Origin-Opener-Policy` sur le site principal (voir `tools-site/README.md`).

**e. Essai complet** (recommandé avant d'ouvrir au public) : créer un compte client → ajouter un outil au panier → commander → payer (ou simuler) → dans l'admin, « Commandes » → *Confirmer le paiement* → le client voit l'outil dans « Mon espace » → *Utiliser l'outil*.

## 2. Parcours client

| Étape | Ce qui se passe |
|---|---|
| Inscription | Nom, téléphone (utile pour retrouver le paiement Mobile Money), e-mail, mot de passe. Un e-mail de confirmation est envoyé. Une adresse déjà inscrite n'est pas révélée |
| Connexion / mot de passe oublié | Retour automatique vers la page demandée (uniquement des pages du site). Renvoi de l'e-mail de confirmation possible |
| Panier | Gardé dans le navigateur (identifiants seulement). Les **prix sont relus dans la base** et le total est recalculé par le serveur à la commande |
| Commande | Référence `CMD-XXXXXXXX`, état « en attente de paiement », instructions de paiement saisies dans l'admin, lien WhatsApp pré-rempli. **Aucun accès n'est donné avant que vous confirmiez le paiement** |
| Mon espace | Applications (origine, date, durée, état : actif / expiré / retiré / pas encore actif), commandes, profil (nom, téléphone, mot de passe) |
| Outil gratuit | « Obtenir gratuitement » depuis la fiche, après connexion |
| Ouvrir un outil | Lien externe : nouvel onglet détaché. Fichier HTML : fenêtre du lanceur, sur une origine séparée |

**Limites à connaître** : les fenêtres pop-up doivent être autorisées ; un fichier HTML livré dans un navigateur peut être copié (le filigrane nom + téléphone dissuade, il n'empêche pas) ; les outils 100 % locaux gardent leurs données dans le navigateur du client.

## 3. Hébergement

Voir la section « hébergement » de l'étape précédente : Vercel pour tester (usage non commercial uniquement), Netlify pour la production. Le lanceur (`tools-site/`) a ses propres `vercel.json` et `netlify.toml`. `vercel.json` et `site/_headers` doivent rester identiques (même protections).

## 4. Ce qui est fonctionnel, provisoire, restant

| Élément | État |
|---|---|
| Inscription, connexion, réinitialisation, panier, commande, espace client, obtention gratuite, ouverture des outils | Fonctionnel (tests ci-dessous) |
| Confirmation de paiement par l'administrateur (Mobile Money manuel) | Fonctionnel |
| Paiement en ligne automatique | Non prévu (validation manuelle) |
| **Pages légales** (CGV, confidentialité, mentions) et acceptation à l'inscription | **À faire avant le lancement** |
| Notification par e-mail à l'administrateur (nouvelle commande / message) | Non incluse : tout se lit dans l'admin |
| Aperçu d'un outil HTML dans l'admin | Non (par sécurité) ; l'essai se fait avec un compte client |

## 5. Tests réalisés (Chrome headless, politique de sécurité réelle, vraie API PostgREST, vrai `schema.sql`)

- **Parcours clients : 109 contrôles sur 109** — inscription (validations, confirmation d'e-mail, adresse déjà utilisée, création du profil par la base), connexion et redirections (adresses externes refusées), mot de passe oublié et réinitialisation (lien valide, expiré, mal formé), panier (persistant, trafiqué, nettoyé), commande (prix serveur, limite de 5 commandes en attente, isolation entre clients), paiement confirmé → accès, états expiré / retiré / pas encore actif / outil indisponible, profil et changement de mot de passe, déconnexion, ouverture d'un outil HTML (origine séparée, aucune session visible, filigrane, liaison coupée), lien externe, fenêtre bloquée, accès retiré après affichage, **attaque simulée contre le lanceur depuis un autre site (ignorée)**, boutique fermée, mobile 390 px.
- **Administration : 111/111**, **site public : 70/70**, **base : 90/90** (non-régression).

**Non testé** : un vrai projet Supabase. Le service d'authentification (GoTrue) était **simulé** : l'envoi réel des e-mails, la validation des codes de double authentification et vos réglages d'authentification n'ont pas été éprouvés. Safari et Firefox (notamment le blocage des pop-up), lecteurs d'écran, réseau mobile lent et déploiement réel sur Vercel / Netlify non plus.
