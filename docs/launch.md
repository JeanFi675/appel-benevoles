# Go-live — recette & lancement

Suivi de la mise en production (Phase 8.5). Ce document sert de **checklist de recette par rôle** et d'archive du lancement.

---

## 1. Matrice d'accès (dérivée du code)

| Page                    | Garde d'accès (code)                                                                                | Qui doit y accéder                          |
| ----------------------- | --------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| `index.html`            | Login OTP. Aucune restriction de rôle.                                                              | **Tous** (benevole, referent, admin)        |
| `admin.html`            | `admin.js:init()` → redirige vers `index.html` si le profil n'a pas `role==='admin'`                | **admin** uniquement                        |
| `admin-connexions.html` | `admin-connexions.js` → idem (redirige si pas `admin`)                                              | **admin** uniquement                        |
| `besoins.html`          | `admin-timeline.js` → redirige vers `index.html` si pas de session ; postes chargés même non-admin  | **Tout connecté** (vue enrichie pour admin) |
| `debit.html`            | `PublicApiService` + RPC publics (`get_public_benevole_info`, `debit_cagnotte_public`) via QR `?id` | **Public** (outil de stand, sans login)     |
| `scanner-tshirt.html`   | `ApiService` (session + RLS) via QR `?id`                                                           | **Opérateur connecté** (admin en pratique)  |

> ⚠️ **Rôle `referent`** : pas de page dédiée dans le frontend. Un référent se connecte sur `index.html` comme un bénévole ; c'est la **RLS** (`is_referent_for_poste`) qui lui donne en plus la visibilité des inscriptions de ses postes. **À confirmer en recette** : qu'est-ce qu'un référent voit/accède réellement de plus qu'un simple bénévole, et via quelle page.

---

## 2. Recette par rôle (à remplir par des utilisateurs réels)

> DoD 8.5 #1 : **au moins un utilisateur réel par rôle** se connecte en prod et confirme l'accès attendu. Renseigner testeur, date et résultat (✅/❌ + note).

### Rôle `benevole`

| #   | Vérification                                                   | Attendu | Testeur    | Date       | Résultat |
| --- | -------------------------------------------------------------- | ------- | ---------- | ---------- | -------- |
| 1   | Connexion par OTP (email) sur `index.html`                     | OK      | Mainteneur | 2026-06-04 | ✅       |
| 2   | Voit ses inscriptions / peut s'inscrire-désinscrire d'un poste | OK      | Mainteneur | 2026-06-04 | ✅       |
| 3   | Cagnotte famille + repas affichés correctement                 | OK      | Mainteneur | 2026-06-04 | ✅       |
| 4   | Accès à `admin.html` → **redirigé** vers `index.html`          | Refusé  | Mainteneur | 2026-06-04 | ✅       |

### Rôle `referent`

| #   | Vérification                                                                    | Attendu | Testeur    | Date       | Résultat |
| --- | ------------------------------------------------------------------------------- | ------- | ---------- | ---------- | -------- |
| 1   | Connexion par OTP sur `index.html`                                              | OK      | Mainteneur | 2026-06-04 | ✅       |
| 2   | Accès aux fonctionnalités bénévole (comme ci-dessus)                            | OK      | Mainteneur | 2026-06-04 | ✅       |
| 3   | Visibilité des inscriptions de **ses** postes (préciser où : `index`/`besoins`) | OK      | Mainteneur | 2026-06-04 | ✅       |
| 4   | Accès à `admin.html` → **redirigé** vers `index.html`                           | Refusé  | Mainteneur | 2026-06-04 | ✅       |

### Rôle `admin`

| #   | Vérification                                                                | Attendu | Testeur    | Date       | Résultat |
| --- | --------------------------------------------------------------------------- | ------- | ---------- | ---------- | -------- |
| 1   | Connexion par OTP sur `index.html`                                          | OK      | Mainteneur | 2026-06-04 | ✅       |
| 2   | Accès à `admin.html` (tableau de bord, onglets bénévoles/référents/mailing) | OK      | Mainteneur | 2026-06-04 | ✅       |
| 3   | Accès à `admin-connexions.html` (diagnostic comptes Auth)                   | OK      | Mainteneur | 2026-06-04 | ✅       |
| 4   | Accès à `besoins.html` (timeline / besoins, vue complète)                   | OK      | Mainteneur | 2026-06-04 | ✅       |
| 5   | `scanner-tshirt.html?id=<benevole>` fonctionne (lecture + maj T-shirt)      | OK      | Mainteneur | 2026-06-04 | ✅       |

### Outils de stand (public, sans login)

| #   | Vérification                                                                  | Attendu | Testeur    | Date       | Résultat |
| --- | ----------------------------------------------------------------------------- | ------- | ---------- | ---------- | -------- |
| 1   | `debit.html?id=<token>` charge les infos bénévole et permet un débit cagnotte | OK      | Mainteneur | 2026-06-04 | ✅       |

---

## 3. Validation croisée (sign-off 8.5 #1)

> À compléter une fois la recette ci-dessus remplie pour les 3 rôles.

| Rôle     | Validé par | Date       | Verdict |
| -------- | ---------- | ---------- | ------- |
| benevole | Mainteneur | 2026-06-04 | ✅ 4/4  |
| referent | Mainteneur | 2026-06-04 | ✅ 4/4  |
| admin    | Mainteneur | 2026-06-04 | ✅ 5/5  |

**Conclusion :** ✅ Les 3 rôles (benevole, referent, admin) se connectent et accèdent à leurs pages respectives ; les redirections de protection (`admin.html`/`admin-connexions.html` → `index.html` pour non-admin) fonctionnent ; l'outil de stand public `debit.html` fonctionne. Validé le 2026-06-04 par le mainteneur.

> ⚠️ **Défaut relevé pendant la recette (n'affecte pas l'accès)** : sur `besoins.html`, la couleur de remplissage des postes selon le nombre d'inscrits ne s'affiche que pour le rôle `admin` ; elle devrait être identique pour tous les rôles. Suivi : voir `audit/notes.md` (2026-06-04) et le plan.

---

## 4. Email d'annonce (8.5 #4)

> Archive de l'email d'annonce envoyé aux utilisateurs clés (capture / contenu).

_(à compléter)_
