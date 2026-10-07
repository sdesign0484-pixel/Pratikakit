# Plateforme d'outils numériques — étape 2 : administration

Site en HTML/CSS/JavaScript (sans framework ni étape de build) + base Supabase.
Étape 1 : structure, design sombre, catalogue, contact. **Étape 2 (cette version) : administration complète.**

```
plateforme-outils/
├── netlify.toml                  Netlify : publie le dossier site/
├── vercel.json                   Vercel : publie le dossier site/ + en-têtes de sécurité
├── site/                         ← le site à déployer
│   ├── index.html, catalogue.html, outil.html, contact.html, 404.html
│   ├── admin/index.html          ← L'ADMINISTRATION (adresse : votre-site/admin/)
│   ├── _headers                  Netlify : sécurité (CSP) ; l'admin est « noindex » et sans cache
│   ├── css/style.css, css/admin.css
│   └── js/
│       ├── config.js             ← LE fichier à renseigner (URL + clé publique Supabase)
│       ├── api.js, ui.js, demo-data.js, pages/ (site public)
│       ├── admin/                connexion + 2FA, tableau de bord, 7 sections
│       └── vendor/supabase.js    supabase-js 2.117.2 hébergé avec le site
└── supabase/
    ├── schema.sql                installation NEUVE (v0.2)
    ├── patch-v0.2.sql            migration si schema.sql v0.1 est déjà installé
    └── tests/                    tests de sécurité de la base
```

## 1. Mettre la base à jour

- **Projet déjà installé avec la v0.1** : SQL Editor → coller `supabase/patch-v0.2.sql` → Run. Sans danger si relancé. Il ajoute l'e-mail dans les profils, la taille des fichiers HTML et les réglages d'accueil.
- **Nouveau projet** : coller `supabase/schema.sql` à la place.

## 2. Créer le compte administrateur (une seule fois)

1. Supabase → **Authentication → Users → Add user** : e-mail + mot de passe solide, cocher « Auto Confirm User ».
2. SQL Editor, en remplaçant l'e-mail :
   ```sql
   update profiles set role = 'admin'
   where id = (select id from auth.users where email = 'ton-email@exemple.com');
   ```
3. Ouvrir `votre-site/admin/`, se connecter. **Au premier passage, l'écran de double authentification s'affiche** : scanner le QR code avec Google Authenticator, Microsoft Authenticator ou Aegis, puis saisir le code à 6 chiffres.
4. Recommandé tant que l'inscription des clients n'existe pas : Supabase → Authentication → Sign In / Providers → désactiver « Allow new users to sign up ».
5. À vérifier : l'authentification multifacteur (TOTP) doit être activée dans les réglages d'authentification du projet (c'est normalement le cas par défaut).

Sans double authentification validée, **aucune action d'administration ne fonctionne**, même en appelant l'API directement : c'est la base qui l'exige, pas seulement l'écran.

## 3. Ce que fait l'administration

| Section | Fonctions |
|---|---|
| Tableau de bord | Commandes à vérifier, nouveaux messages, outils, comptes ; sauvegarde JSON (avec ou sans le contenu HTML des outils) |
| Outils | Créer/modifier : nom, adresse, catégorie, textes, listes, image, prix, durée d'accès, statut, ordre ; téléverser le **fichier HTML** (5 Mo max) ou indiquer un **lien externe https** ; filigrane optionnel. Pas de suppression : passer l'outil en « Indisponible » ou « Brouillon » |
| Catégories | Créer, modifier, masquer, supprimer |
| Commandes | Filtrer, rechercher ; **Confirmer le paiement** (moyen + référence de transaction, une même référence ne sert qu'une fois) ; Annuler |
| Clients | Liste avec recherche ; fiche : accès, commandes ; donner un accès (avec date d'expiration), retirer un accès, suspendre/réactiver un compte |
| Messages | Lire, marquer lu, archiver, répondre par e-mail |
| Réglages du site | Nom, titre et texte d'accueil, texte du pied de page, sections affichées, WhatsApp, e-mail, instructions de paiement. Un champ vide rétablit le texte par défaut |
| Journal | Les 200 dernières actions sensibles (non modifiable depuis le site) |

Les listes sont limitées : 1 000 clients, 300 commandes, 300 messages, 200 lignes de journal par affichage (la sauvegarde, elle, récupère tout).

## 4. Brancher et héberger (Vercel pour tester, Netlify pour la production)

Dans tous les cas : `site/js/config.js` (URL + clé publique `anon`/`publishable`, jamais la clé `service_role`). Aucun autre réglage ne change d'un hébergeur à l'autre, et Supabase accepte les requêtes depuis n'importe quelle adresse.

| | Vercel (tests) | Netlify (production) |
|---|---|---|
| Fichier de configuration lu | `vercel.json` (à la racine) | `netlify.toml` + `site/_headers` |
| Réglages dans le tableau de bord | Framework : « Other » ; pas de commande de build ; dossier de sortie `site` (déjà indiqué dans `vercel.json`) ; ne pas changer le « Root Directory » | Dossier à publier : `site` (déjà indiqué dans `netlify.toml`) |
| Mise en ligne | Import d'un dépôt Git ou ligne de commande `vercel` | Glisser-déposer ou dépôt Git |
| Usage commercial | **Interdit sur l'offre gratuite « Hobby »** : tests privés seulement | Autorisé sur l'offre gratuite, mais limité par un système de crédits (voir ci-dessous) |

Chaque hébergeur ignore le fichier de l'autre : les deux configurations peuvent rester dans le projet. `vercel.json` et `site/_headers` contiennent exactement les mêmes protections (CSP, anti-iframe, `noindex` et pas de cache pour `/admin/`) ; si vous modifiez l'un, **modifiez l'autre**.

**Vérifier après la première mise en ligne** (sur chaque hébergeur) : ouvrir le site, touche F12 → onglet Console : aucune erreur « Refused to… » ; ou dans un terminal `curl -I https://votre-adresse/` : la ligne `content-security-policy` doit apparaître. Si elle manque, la configuration n'est pas lue.

**Chaque adresse est un site distinct** : la session administrateur d'un hébergeur n'est pas reconnue sur l'autre (reconnexion et code de double authentification à refaire ; le compte et l'application d'authentification restent les mêmes).

**À prévoir à l'étape connexion des clients** : dans Supabase → Authentication → URL Configuration, ajouter les adresses de test (Vercel) et de production (Netlify) dans les adresses de redirection autorisées, sinon les liens de réinitialisation de mot de passe échoueront.

Si Supabase est derrière un domaine personnalisé, l'ajouter dans `connect-src` de `site/_headers` **et** de `vercel.json`.

## 5. Ce qui est fonctionnel, provisoire, restant

| Élément | État |
|---|---|
| Site public (accueil, catalogue, fiche, contact) modifiable depuis l'admin | Fonctionnel |
| Administration : toutes les sections ci-dessus | Fonctionnel (tests ci-dessous) |
| Confirmation de paiement manuelle (Mobile Money) et création des accès | Fonctionnel côté administrateur |
| **Création de compte et commande côté client** | **Pas encore fait** : tant que les clients ne peuvent pas s'inscrire ni commander, les sections « Commandes » et « Clients » restent presque vides. Vous pouvez déjà donner un accès à un compte créé dans Supabase |
| Boutons « Acheter » / « Obtenir » des fiches | Désactivés (`FEATURES.auth` = false) jusqu'à l'étape suivante |
| Aperçu d'un outil HTML dans l'admin | Volontairement absent : il se fera sur le sous-domaine des outils (étape de distribution), pour que le code d'un outil ne s'exécute jamais avec la session administrateur |
| Notification par e-mail des messages et commandes | Non incluse : tout se lit dans l'admin |
| Pages légales, distribution des outils aux clients, espace client | Étapes suivantes |

## 6. Tests réalisés

Dans Chrome headless, avec la politique de sécurité réelle (`_headers`) :

- **Administration : 111 contrôles sur 111** contre la **vraie API PostgREST** et le vrai `schema.sql` (Postgres local) : connexion, refus des comptes non admin, activation et reprise de la double authentification, création/modification d'outils avec téléversement, validations, catégories, réglages visibles sur le site public, confirmation/annulation de paiements, doublon de référence refusé, accès accordés/retirés, suspension, messages, journal, sauvegarde, texte piégé non exécuté, accès API directs refusés (admin sans 2FA, client), mobile 390 px sans défilement horizontal.
- **Site public : 70 contrôles sur 70** (non-régression).
- **Base : 90 contrôles de sécurité sur 90**, installation neuve et migration v0.1 → v0.2 relancée deux fois.

**Non testé** : un déploiement réel sur Vercel ou Netlify (la configuration Vercel suit la documentation officielle et est identique à celle de Netlify, mais n'a pas été essayée en ligne) ; un vrai projet Supabase. Le service d'authentification (GoTrue) était **simulé** : la vraie validation des codes TOTP, l'envoi d'e-mails et les règles d'authentification de votre projet n'ont pas été éprouvés. Safari, Firefox, lecteurs d'écran et réseau mobile lent non plus.
