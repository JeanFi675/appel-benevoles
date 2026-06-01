# Configuration Auth — Supabase

> Source de vérité : ce document. Toute modification de la config Auth (Dashboard Supabase ou `supabase/config.toml`) doit être reflétée ici.
>
> **Dernière mise à jour** : 2026-05-27 (Phase 3.7 du refactoring de production).

---

## Contexte applicatif

L'application **appel-benevoles** utilise un seul flux d'authentification :

- **Email OTP** via `supabase.auth.signInWithOtp({ email })` (voir [src/js/services/auth.js:43-64](../src/js/services/auth.js)).
- Le mail envoyé contient à la fois un **code à 6 chiffres** (saisi par l'utilisateur dans l'UI) et un magic link cliquable. En pratique, le flux utilisateur final est la **saisie du code OTP** ; le magic link sert de fallback (instabilité historique sur iOS/Apple Mail).
- **Aucun mot de passe utilisateur** n'est jamais saisi côté frontend (pas de `signInWithPassword`).
- **Aucun provider OAuth** n'est utilisé (pas de `signInWithOAuth`).
- Les comptes sont créés :
  - Soit automatiquement à la 1ère demande d'OTP (signup ouvert).
  - Soit par un admin via l'Edge Function `create-benevole` (Service Role Key).

Conséquence directe : la majorité des paramètres de la couche Auth liés aux mots de passe et aux providers tiers sont **sans effet en pratique**, mais sont configurés en défense en profondeur pour les comptes admin créés via dashboard ou Service Role.

---

## 1. Durée de session JWT (T1)

| Paramètre                       | Valeur retenue              | Source            |
| ------------------------------- | --------------------------- | ----------------- |
| `jwt_expiry` (access token)     | **3600 secondes (1 heure)** | défaut Supabase   |
| `enable_refresh_token_rotation` | `true`                      | défaut + sécurité |
| `refresh_token_reuse_interval`  | `10` secondes               | défaut            |

**Décision** : conserver 3600s.

**Justification métier** :

- L'app est utilisée par sessions ponctuelles (consultation du planning, inscription/désinscription d'un poste). Une session d'1h couvre largement le cas d'usage.
- Une durée plus courte forcerait des reconnexions agaçantes pendant les périodes d'usage actif (admins en journée d'événement).
- Une durée plus longue augmenterait la fenêtre d'exposition d'un token volé.
- Le mécanisme de **refresh token rotation** est actif → un refresh token n'est utilisable qu'une fois, ce qui limite l'impact d'un vol de session.

**Local** (`supabase/config.toml`) : `jwt_expiry = 3600` ✅
**Prod** (Dashboard `Authentication → Sessions`) : à vérifier qu'on est bien à 3600.

---

## 2. Providers Auth activés (T2)

| Provider                                                                    | Statut cible  | Justification                                                                                 |
| --------------------------------------------------------------------------- | ------------- | --------------------------------------------------------------------------------------------- |
| **Email (OTP / Magic Link)**                                                | ✅ Activé     | Seul mode d'auth utilisé par l'app                                                            |
| **Phone (SMS)**                                                             | ❌ Désactivé  | Non utilisé, surface d'attaque inutile                                                        |
| **Anonymous sign-ins**                                                      | ❌ Désactivé  | Non utilisé, risque RLS                                                                       |
| **Tous les providers OAuth** (Apple, Google, GitHub, Facebook, Azure, etc.) | ❌ Désactivés | Aucun appel `signInWithOAuth` dans le code                                                    |
| **Web3 (Solana, etc.)**                                                     | ❌ Désactivé  | Hors scope                                                                                    |
| **Third-party (Firebase, Auth0, AWS Cognito, Clerk)**                       | ❌ Désactivés | Hors scope                                                                                    |
| **Passkey / WebAuthn**                                                      | ❌ Désactivé  | Non utilisé                                                                                   |
| **MFA (TOTP, Phone, WebAuthn)**                                             | ❌ Désactivé  | Non utilisé. Pourrait être activé pour les comptes admin en Phase ultérieure (hors scope 3.7) |

**Local** (`supabase/config.toml`) : conforme ✅ (tous les providers OAuth ont `enabled = false`).
**Prod** (Dashboard `Authentication → Sign In / Providers`) : à vérifier que seul **Email** est activé.

---

## 3. Redirect URLs (T3)

L'app appelle `signInWithOtp` avec `emailRedirectTo: window.location.origin + window.location.pathname` (voir [src/js/services/auth.js:47](../src/js/services/auth.js)).

### Configuration prod cible

| Champ Dashboard   | Valeur cible                                             |
| ----------------- | -------------------------------------------------------- |
| **Site URL**      | `https://jeanfi675.github.io/appel-benevoles/`           |
| **Redirect URLs** | `https://jeanfi675.github.io/appel-benevoles/index.html` |
|                   | `https://jeanfi675.github.io/appel-benevoles/**`         |

### URLs à **supprimer** de la prod

| URL actuelle en prod       | Action                               | Raison                                                                                                                                                                                                                            |
| -------------------------- | ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `http://localhost:5173/**` | 🚨 **À supprimer du Dashboard prod** | DoD T3 : aucune URL `localhost` ne doit figurer dans la config prod. Le dev local utilise désormais l'instance **Supabase locale** (cf. Phase 0.3 du refactoring) et n'a plus besoin d'une redirect URL `localhost` dans la prod. |

### Configuration locale

Le `config.toml` local autorise par défaut `http://127.0.0.1:3000` et `https://127.0.0.1:3000` comme redirect URLs. Comme on accède au dev via Vite (port 5173), il faudra ajuster si nécessaire — pour l'instant, le flux OTP local fonctionne (vérifié via Inbucket `http://127.0.0.1:54324`).

---

## 4. Confirmation d'email obligatoire (T4)

| Paramètre                      | Valeur retenue |
| ------------------------------ | -------------- |
| `enable_confirmations` (email) | **`false`**    |

**Décision** : ne **pas** activer la confirmation d'email explicite.

**Justification** :

- Le flux d'auth de l'app **est** la réception d'un email contenant un code OTP. L'utilisateur ne peut pas se connecter sans recevoir et lire son email.
- Activer `enable_confirmations = true` ajouterait un second mail de confirmation post-inscription **avant** d'autoriser la connexion, ce qui :
  1. Doublerait inutilement les envois email (déjà coûteux : rate limit à 2/h en local, 4/h en prod par défaut).
  2. N'apporterait aucun gain de sécurité (l'OTP est déjà la preuve de possession de l'email).
  3. Casserait l'UX : un utilisateur qui demande un OTP attendrait deux mails.

**Local** : `enable_confirmations = false` ✅
**Prod** (Dashboard `Authentication → Sign In / Providers → Email → Confirm email`) : à vérifier que c'est désactivé.

---

## 5. Politique de mot de passe (T5)

| Paramètre                 | Valeur cible                                                        |
| ------------------------- | ------------------------------------------------------------------- |
| `minimum_password_length` | **8**                                                               |
| `password_requirements`   | **`lower_upper_letters_digits`**                                    |
| `double_confirm_changes`  | `true` (défaut)                                                     |
| `secure_password_change`  | `false` (défaut — pas pertinent vu l'absence de flow password user) |

**Décision** : appliquer **8 caractères minimum + obligation lettres maj/min + chiffres**, même si le flux utilisateur ne saisit jamais de mot de passe.

**Justification (défense en profondeur)** :

- L'app n'a pas de flux password user-facing → aucun impact UX.
- Mais des comptes admin peuvent être créés via Dashboard Supabase ou Service Role avec un password.
- Imposer une politique forte évite qu'un admin crée par mégarde un compte avec un password trivial (`123456`).
- Coût marginal nul.

**Recommandation NIST** : minimum 8 caractères, complexité optionnelle. Le réglage `lower_upper_letters_digits` est un compromis raisonnable.

**Local** (`supabase/config.toml`) : ⚠️ actuellement `minimum_password_length = 6` / `password_requirements = ""` → **à corriger**.
**Prod** (Dashboard `Authentication → Sign In / Providers → Email → Password Strength`) : à aligner sur les mêmes valeurs.

---

## Récapitulatif des actions concrètes

| #   | Action                                                                                       | Cible                                       | Responsable                       |
| --- | -------------------------------------------------------------------------------------------- | ------------------------------------------- | --------------------------------- |
| A1  | Confirmer `jwt_expiry = 3600`                                                                | Dashboard prod (`Auth → Sessions`)          | Mainteneur                        |
| A2  | Vérifier que seul le provider **Email** est activé                                           | Dashboard prod (`Auth → Providers`)         | Mainteneur                        |
| A3  | **Supprimer `http://localhost:5173/**` des Redirect URLs prod\*\*                            | Dashboard prod (`Auth → URL Configuration`) | Mainteneur                        |
| A4  | Confirmer `Confirm email = OFF`                                                              | Dashboard prod (`Auth → Providers → Email`) | Mainteneur                        |
| A5  | Aligner `minimum_password_length = 8` + `password_requirements = lower_upper_letters_digits` | Dashboard prod + `supabase/config.toml`     | Agent (local) + Mainteneur (prod) |

---

## Références

- Documentation Supabase Auth : <https://supabase.com/docs/guides/auth>
- Fichier local : [`supabase/config.toml`](../supabase/config.toml) (sections `[auth]`, `[auth.email]`, `[auth.rate_limit]`)
- Code client : [`src/js/services/auth.js`](../src/js/services/auth.js)
- Edge Function de création admin : [`supabase/functions/create-benevole/`](../supabase/functions/create-benevole/)
