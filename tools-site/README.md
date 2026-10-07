# Lanceur d'outils (tools-site)

Ce dossier se déploie **comme un site séparé**, sur un sous-domaine (ex. `outils.mondomaine.mg`).
Il ouvre les outils HTML des clients sur une origine différente du site principal : un outil n'a ainsi
ni accès à la session du client, ni aux données du site, et garde son propre stockage.

1. Déployer ce dossier (Netlify : nouveau site, dossier `tools-site` ; Vercel : nouveau projet, racine `tools-site`).
2. Dans `config.js`, mettre l'adresse du site principal dans `PLATFORM_ORIGINS`, puis redéployer.
3. Dans `site/js/config.js` du site principal, mettre l'adresse de ce lanceur dans `TOOLS_ORIGIN`.

Ne pas ajouter de politique de sécurité de contenu (CSP) à ce site : les outils sont des pages HTML autonomes
avec scripts et styles intégrés, qu'elle bloquerait. Ne pas activer non plus `Cross-Origin-Opener-Policy` sur le
site principal : elle couperait la liaison entre les deux fenêtres.
