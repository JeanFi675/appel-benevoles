# Changelog

Toutes les modifications notables apportées à `appel-benevoles` sont documentées dans ce fichier.

Le format est basé sur [Keep a Changelog 1.1.0](https://keepachangelog.com/fr/1.1.0/), et ce projet adhère au [Semantic Versioning 2.0.0](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

---

## [1.0.0] - 2026-06-02

Première version stabilisée à l'issue du **refactoring "production-hardening"** (Phases 0 à 8) et mise en production le 2026-06-02. Le projet entre en production sur cette base, hotfixes de go-live (2026-06-04/05) inclus.

### Added

- **Environnement local reproductible** : instance Supabase locale (Docker) démarrable via `supabase start`, avec bascule LOCAL ↔ PROD via `.env.local` (Phase 0.3).
- **Garde-fou anti-prod** : `scripts/check-env.js` bloque toute opération `db:push` ciblant la production hors Phase 8 + flag `--force-prod` + `PHASE=8` (Phase 0.4).
- **Hook `pre-push`** bloquant le push direct sur `master`.
- **Audit de base de données complet** : 16 livrables CSV/MD sur la structure, l'utilisation, les contraintes, les index, le nommage et la sécurité RLS (Phase 1).
- **Migration consolidée** `00000000000000_init.sql` : dump prod du 2026-05-27, source de vérité unique du schéma (Phase 2.8). Remplace 30+ migrations historiques cassées.
- **CHECK constraints renforcés** sur `benevoles` (format email/téléphone, non-vide prénom/nom, cohérence cagnotte forcée), `cagnotte_transactions` (`|montant| ≤ 100`, `montant ≠ 0`, description non vide), `postes` (`nb_max ≤ 200`), `periodes` (ordre > 0, montant ≥ 0).
- **Helpers RLS `SECURITY DEFINER`** : `auth_has_role`, `is_admin`, `is_own_benevole`, `is_referent_for_poste`, `is_referent_for_benevole` — brique unique partagée par toutes les policies (Phase 3.3.1).
- **Outillage qualité** : ESLint v10 (flat config), Prettier v3, Husky v9, lint-staged v17, knip — avec hook `pre-commit` (Phase 5.5).
- **Build Vite production** optimisé : minification, sourcemaps, code-splitting (chunks `vendor-supabase`, `vendor-alpine`, `vendor-qrcode`, `vendor`) (Phase 5.4).
- **Édition CSS dédiée** : `src/css/debit.css` et `src/css/scanner-tshirt.css` extraits du HTML (Phase 6.1).
- **Documentation complète** : [`README.md`](README.md) prod-first, [`docs/deployment.md`](docs/deployment.md), [`ARCHITECTURE.md`](ARCHITECTURE.md), [`DATABASE.md`](DATABASE.md), [`CONTRIBUTING.md`](CONTRIBUTING.md), `CHANGELOG.md` (Phase 7).
- **Question végétarien configurable par repas** : chaque repas créé dans Admin → Configuration → « Options Repas » possède désormais une case « 🥬 Proposer la question "Repas Végétarien" » (à l'ajout **et** à l'édition). Lorsqu'elle est décochée, le wizard d'inscription masque la case végé pour ce repas et force `is_vegetarien = false` à la sauvegarde. Nouvelle colonne `repas.question_vege_active` (défaut `true`, rétrocompatible) — migration `20260606100000_repas_question_vege_active.sql` (idempotente). Un badge « 🥬 Végé » / « Sans végé » récapitule l'état de chaque repas dans la liste admin.
- **Identité d'évènement paramétrable** : nouvel encart « 🏷️ Identité de l'évènement » dans Admin → Configuration permettant de saisir un **titre** et une **adresse**. Stockés dans `config.event_title` / `config.event_address` (migration `20260605130000_seed_event_identity_config.sql`, idempotente). Le titre alimente dynamiquement le header public (`x-text="eventTitle"`) et le `<title>` des pages (`document.title`), avec repli « Appel aux Bénévoles » si vide.
- **En-têtes de sécurité** : CSP et `Referrer-Policy: strict-origin-when-cross-origin` posés en `<meta>` (GitHub Pages n'autorisant pas d'en-tête HTTP custom). `connect-src` injecté au build depuis `VITE_SUPABASE_URL` (`vite.config.js`) — CSP portable, sans URL en dur. Documentés dans `docs/deployment.md` (Phase 8.2).
- **Monitoring** : section « Monitoring » de `docs/deployment.md` cartographiant les 4 flux de logs Supabase (API Gateway / Auth / Postgres / Edge Functions) — où les consulter et ce qu'on y trouve (Phase 8.3).
- **Sauvegardes automatiques** : GitHub Action planifiée (`.github/workflows/backup.yml`, cron quotidien) qui dump la prod via le Session Pooler IPv4, chiffre en GPG AES256 et archive un artifact privé (rétention 30 j). Procédure de restauration dans `docs/disaster_recovery.md` (Phase 8.4).

### Changed

- **RLS désormais `FORCE`d sur toutes les tables `public`** (Phase 3.1) : les rôles propriétaires (postgres) sont eux-mêmes soumis aux policies. Le bypass ne reste possible que via les fonctions `SECURITY DEFINER`.
- **Politiques RLS uniformisées** : ~37 policies réécrites selon la convention `<table>_<role>_<op>[_<scope>]`, sans sous-requête sur table RLS dans les expressions (Phase 3.3.2). Plus aucune récursion possible.
- **GRANTs PostgREST restaurés** explicitement après le dump (`--no-privileges`) qui les avait perdus : `GRANT ALL` à `anon`/`authenticated`/`service_role` + `DEFAULT PRIVILEGES` pour les objets futurs (Phase 3.4).
- **Architecture frontend** réorganisée selon les principes DRY/SOLID :
  - extraction des composants Alpine.js (`Alpine.data` + `Alpine.store`) dans des fichiers dédiés sous `src/js/components/` et `src/js/stores/` (Phase 5.2) ;
  - centralisation des helpers (`toast`, `confirm`) ;
  - **services SRP** (`src/js/services/`) : aucun composant Alpine n'appelle directement le client Supabase (Phase 5.3).
- **Onglet admin éclaté** : suppression de l'objet god `AdminModule`, chaque onglet est désormais un `Alpine.data` indépendant (`benevoles`, `cagnotte-forcee`, `heures`, `mailing`, `recap`, `referents`, `visual-creator`) (Phase 5.2.6+5.2.7+5.2.9).
- **Configuration Vite** : `base: "./"` pour compatibilité GitHub Pages, sourcemaps activées en prod, chunks vendor explicites (Phase 5.4).
- **Edge Function `send-relance-orphelin`** : correction de l'upsert pour utiliser la colonne réelle `user_id` (au lieu d'un `auth_user_id` inexistant) (Phase 6).
- **CLAUDE.md** mis à jour pour refléter la nouvelle architecture et la disponibilité de l'instance Supabase locale (Phase 7.7).
- **Admin → Référents — liste « Type de poste » filtrée** : la liste déroulante de sélection d'un type de poste ne propose désormais que les types ayant **au moins un créneau sans référent**. Dès que tous les créneaux d'un type sont attribués, il disparaît des propositions (le titre déjà sélectionné sur une ligne reste affiché pour ne pas vider le `<select>`). Nouvelle méthode `getAvailablePosteTitres()` dans `adminReferentsTab`.
- **Généralisation du site** : suppression de toute référence en dur à un évènement précis (championnat, escalade, compétition). Le header public, les `<title>` de pages et les libellés admin sont désormais génériques ou alimentés par `event_title`. L'app peut servir n'importe quel évènement nécessitant un appel à bénévoles.
- **Email de planning (`send-planning`) généralisé** :
  - Texte d'introduction générique alimenté par `config.event_title` (repli « l'évènement ») — plus aucune mention de championnat/escalade/compétition.
  - **QR codes conditionnels** : le QR T-shirt n'est inclus que si `tshirt_question_active` est actif, le QR cagnotte que si `cagnotte_active` est actif (Admin → Configuration). Si aucun QR n'est actif, la section et la mention dans l'intro disparaissent.
  - **Infos pratiques** : le « Lieu » provient de `config.event_address` (avec lien Google Maps dynamique, masqué si l'adresse est vide) ; « À votre arrivée » reformulé pour ne plus dépendre du QR/T-shirt ; les liens « Accéder au site » utilisent l'URL d'origine (`baseUrl`) au lieu d'un domaine en dur.
  - Suppression des sections **Covoiturage** et **Partagez vos photos** (liens propres à l'édition escalade 2026).
- **`admin-connexions.html`** : les boutons « 📧 Envoyer relance » des tableaux _Comptes orphelins_ et _Bénévoles (sans inscr.)_ sont remplacés par « 📋 Copier le mail » (copie de l'adresse dans le presse-papier). L'envoi de mail de relance individuel est retiré.

### Fixed

- **Récursion RLS sur `benevoles`** : les policies historiques (migrations 006-008) qui faisaient des `SELECT` inline sur `benevoles` dans leurs propres expressions sont remplacées par les helpers DEFINER (Phase 3.3.3).
- **Lint Lighthouse a11y/perf** : ajout de landmarks `<main>` sur toutes les pages, corrections d'accessibilité et de performance (Phase 5.6).
- **Détection de code mort** : suppression des modules et exports non utilisés détectés par `knip` (Phase 4).
- **Anomalie de chunk `html5-qrcode`** : le projet ne référence plus `html5-qrcode` ; le code QR repose entièrement sur `qrcode` (chunk `vendor-qrcode`).
- **Cohérence des conventions de nommage** propagée du SQL vers le frontend (Phase 5.0).
- **Edge Function `send-planning`** : le titre des postes s'affichait « undefined » dans l'email de planning. La requête lisait `postes.titre` (colonne inexistante) au lieu de joindre `type_postes(titre)` ; corrigé via la jointure `postes(*, type_postes(titre), …)` et le repli `'Poste'`.
- **`besoins.html` — coloration des postes pour tous les rôles** (hotfix go-live 8.5) : le taux d'occupation et le compteur d'inscrits ne s'affichaient que pour `admin` (lecture de la table `inscriptions` protégée par RLS). Dérivé désormais de `public_planning.liste_benevoles` (publique, complète), donc correct pour `benevole` et `referent`.

### Removed

- **Rôles applicatifs `juge`, `admin-juge`, `officiel`** retirés de l'enum `role_type` (consolidation Phase 2.8). Seuls `benevole`, `referent`, `admin` subsistent.
- **Table `mentions`** et ses enums `mention_platform`/`mention_status` supprimés (fonctionnalité non maintenue, exposée par une policy `ALL true` historique).
- **Fonction `check_referent_access(uuid)`** supprimée explicitement (Phase 3.3.2) — remplacée par `is_referent_for_benevole`.
- **30+ migrations historiques** archivées dans `supabase/migrations_archive_pre_refactor/` (non rejouables — la migration 006 référençait une colonne `user_id` jamais créée). La consolidation `init.sql` est désormais la source unique.
- **`AdminModule` god object** (~600 lignes) supprimé au profit de composants Alpine indépendants (Phase 5.2).
- **`src/js/utils.js` legacy** éclaté en modules ciblés (`utils/format-date.js`, etc.) (Phase 5.2).
- **Politique RLS publique permissive sur `inscriptions`** : la lecture publique passe désormais uniquement par la vue `public_planning` (anonymisée) ou la RPC `get_public_inscriptions()` `SECURITY DEFINER` (Phase 3.3.2).
- **Edge Functions `send-relance` et `send-relance-orphelin`** supprimées (plus d'envoi de mail de relance) (hotfix go-live 8.5).
- **Colonnes `relance_sent_at`** supprimées de `benevoles` et `orphan_relances` (migration `20260605120000_remove_relance_feature.sql`). La vue `admin_benevoles` et la RPC `get_auth_users_without_benevole()` ne projettent plus cette colonne. La table `orphan_relances` est conservée (stockage du téléphone des comptes orphelins).

### Security

- **`UPDATE`/`DELETE` désormais `DENY`** sur `cagnotte_transactions` (admin compris) — l'historique cagnotte est immuable, les corrections passent par transactions compensatoires.
- **`UPDATE` désormais `DENY`** sur `inscriptions` et `benevole_repas` — une inscription se supprime et se recrée plutôt que se modifier.
- **`DELETE` désormais `DENY`** sur `config` — les feature flags ne se suppriment pas en cours d'événement.
- **Trigger `trg_prevent_role_change`** : empêche tout utilisateur authentifié de modifier sa propre colonne `role` (privilege escalation).
- **`SET search_path = public`** systématique sur toutes les fonctions `SECURITY DEFINER` (anti-hijack de schéma).
- **Garde-fou prod** côté tooling : `scripts/check-env.js` + hook `pre-push` empêchent les opérations dangereuses involontaires.
- **Content-Security-Policy active** (`<meta>`) vérifiée en navigateur sans violation bloquante, et **HSTS** natif GitHub Pages (`Strict-Transport-Security: max-age=31556952`) sur HTTPS (Phase 8.2).
- **Dumps de sauvegarde chiffrés** (GPG AES256) — les backups contenant des données personnelles ne sont jamais stockés ni commités en clair (Phase 8.4).

---

[Unreleased]: https://github.com/JeanFi675/appel-benevoles/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/JeanFi675/appel-benevoles/releases/tag/v1.0.0
