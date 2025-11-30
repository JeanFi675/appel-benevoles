```markdown
# Spécification Architecturale Détaillée et Stratégie de Déploiement : Système de Gestion des Bénévoles pour Compétition d'Escalade

## 1. Synthèse Exécutive

Ce rapport présente une architecture technique complète, sécurisée et économiquement viable pour répondre aux besoins spécifiques de l'organisation d'une compétition d'escalade. La demande initiale sollicite une solution permettant la gestion des bénévoles avec des contraintes fortes : hébergement gratuit, authentification par lien magique, base de données visuelle modifiable, et une logique de blocage complexe selon le remplissage des créneaux (min/max) et la disponibilité temporelle des bénévoles.

L'interface doit respecter la confidentialité des données (affichage Prénom/Initiale Nom) tout en gérant des champs spécifiques (poste, horaires, description, référent) et des questions logistiques (t-shirts). De plus, le système doit empêcher qu'un bénévole s'inscrive sur plusieurs créneaux qui se chevauchent temporellement.

L'analyse approfondie des solutions "No-Code" et "Low-Code" disponibles sur le marché (Airtable, NocoDB, Baserow) révèle des limitations critiques pour ce cas d'usage précis, notamment en matière de sécurité côté client (exposition des clés API) et de quotas sur les plans gratuits. Par conséquent, ce rapport préconise une **Architecture Headless (Sans Tête)** couplant **Supabase** (Backend-as-a-Service sur PostgreSQL) pour la logique métier et la base de données, avec **GitHub Pages** pour l'hébergement statique du frontend.

Cette approche permet de satisfaire 100% des requis : la base de données est visuelle (via l'éditeur de table de Supabase), l'hébergement est gratuit et illimité en trafic, l'authentification est gérée sans mot de passe, et la logique de blocage est assurée par le moteur transactionnel de PostgreSQL, garantissant l'intégrité des inscriptions même en cas de forte affluence.

## 2. Analyse des Contraintes et Sélection de la Stack Technologique

Pour concevoir un système pérenne et gratuit, il est impératif d'analyser les compromis entre facilité d'usage (outils visuels) et sécurité technique.

### 2.1 Évaluation des Solutions "Base de Données Visuelle"

La requête mentionne explicitement le besoin d'une "BDD visuelle et modifiable directement". Traditionnellement, des outils comme Airtable ou NocoDB sont privilégiés. Cependant, dans le cadre d'un site statique public (GitHub Pages), ces outils présentent des failles majeures.

#### 2.1.1 Le Problème de Sécurité d'Airtable et NocoDB en Frontal

Les API d'Airtable et de NocoDB (en version standard) ne sont pas conçues pour être appelées directement depuis un navigateur web sans passer par un serveur intermédiaire. Intégrer la clé API directement dans le code JavaScript hébergé sur GitHub Pages rendrait cette clé visible à n'importe quel visiteur via l'inspecteur du navigateur ("View Source").

**Risque :** Un utilisateur malveillant pourrait récupérer la clé et supprimer ou modifier l'intégralité de la base de données des bénévoles.

**Contournement habituel :** Utiliser un proxy (middleware), ce qui nécessite un hébergement serveur (ex: Heroku, DigitalOcean), violant ainsi la contrainte de "coût zéro" et de "sans maintenance serveur".

#### 2.1.2 Limitations des Plans Gratuits (Cloud)

- **NocoDB Cloud :** Bien que NocoDB soit une excellente alternative open-source à Airtable, sa version Cloud gratuite impose des limites strictes sur les connexions aux bases de données externes ou sur le nombre de lignes (souvent limité à quelques milliers ou centaines selon les versions beta), ce qui peut être bloquant pour une compétition d'escalade d'envergure nécessitant une granularité fine des postes et créneaux.

- **Airtable :** Le plan gratuit est limité à 1 000 enregistrements par base. Pour une compétition sur plusieurs jours avec des créneaux horaires multiples (par exemple : 10 postes x 8 créneaux x 3 jours = 240 slots), on atteint rapidement la limite si l'on compte aussi les bénévoles et les inscriptions.

### 2.2 La Solution Retenue : Architecture Hybride Supabase + GitHub Pages

Pour répondre à l'exigence de sécurité sans coût, Supabase s'impose comme la clé de voûte de cette architecture.

| Composant | Technologie Choisie | Justification Technique |
|-----------|---------------------|------------------------|
| **Frontend (Interface)** | GitHub Pages | Hébergement statique 100% gratuit, supporte le HTTPS, versionné via Git. Idéal pour un formulaire dynamique généré par IA ne nécessitant pas de compilation complexe (Vanilla JS ou Alpine.js). |
| **Backend / BDD** | Supabase (PostgreSQL) | Offre une base de données PostgreSQL complète avec une interface visuelle (Table Editor) similaire à un tableur. Le plan gratuit inclut 500 MB de données et 50 000 utilisateurs mensuels actifs, largement suffisant pour une compétition. |
| **Sécurité** | Row Level Security (RLS) | Contrairement à Airtable, Supabase permet d'exposer l'API publiquement car l'accès aux données est restreint au niveau de la ligne dans la base de données. Un utilisateur ne peut modifier que ses propres inscriptions. |
| **Authentification** | Supabase Auth (Magic Link) | Gère l'envoi de liens de connexion par email, évitant aux bénévoles de créer un mot de passe. Répond parfaitement à la contrainte "pas de compte" classique. |

Cette stack permet de conserver l'aspect "visuel" pour l'organisateur (via le dashboard Supabase qui ressemble à Excel/Airtable) tout en offrant une sécurité de niveau entreprise pour le frontend public.

## 3. Modélisation des Données (Schema Database)

La structure de la base de données est cruciale pour permettre les fonctionnalités demandées : tri par période, gestion des postes, respect de la vie privée (Prénom/Initiale), et **vérification des conflits temporels** entre créneaux.

### 3.1 Table `postes` (Les Créneaux de Bénévolat)

Cette table contient la définition de l'offre de bénévolat. Elle est conçue pour être lue publiquement mais modifiée uniquement par l'organisateur.

- `id` (uuid, primary key, default gen_random_uuid())
- `titre` (text) : Ex: "Juge de bloc", "Assureur", "Buvette"
- `periode_debut` (timestamptz) : Date et heure de début
- `periode_fin` (timestamptz) : Date et heure de fin
- `referent_id` (uuid, foreign key vers benevoles.id, nullable) : Référence au bénévole responsable du poste
- `description` (text) : Ex: "Doit savoir assurer en tête", "Prévoir vêtements chauds"
- `nb_min` (int) : Seuil d'alerte (pour l'organisateur)
- `nb_max` (int) : Critique. Définit le plafond pour le blocage automatique
- `categorie` (text) : Pour grouper l'affichage (ex: "Qualifications Samedi", "Finales Dimanche")

### 3.2 Table `benevoles` (Profils Utilisateurs)

Cette table stocke les informations personnelles. La sécurité est primordiale ici. Elle est liée à la table interne `auth.users` de Supabase.

- `id` (uuid, primary key, foreign key vers auth.users.id) : Assure que seul l'utilisateur connecté peut accéder à son profil
- `email` (text) : Récupéré automatiquement
- `prenom` (text) : "Affichage prénom"
- `nom` (text) : Stocké en entier pour l'admin, mais tronqué pour l'affichage public
- `telephone` (text) : Pour les urgences (visible admin uniquement)
- `taille_tshirt` (text) : "Question extra"

### 3.3 Table `inscriptions` (Liaison)

- `id` (uuid, primary key)
- `poste_id` (uuid, foreign key vers postes.id)
- `benevole_id` (uuid, foreign key vers benevoles.id)
- `created_at` (timestamptz) : Pour gérer l'ordre d'inscription en cas de litige

**Contrainte unique :** Une combinaison (poste_id, benevole_id) doit être unique pour éviter les doublons.

### 3.4 Vue Sécurisée pour l'Affichage Public (`public_planning`)

Pour satisfaire l'exigence "Affichage prénom/initiale nom" sans exposer les données complètes (RGPD), il est impératif de créer une Vue SQL. Le frontend interrogera cette vue et non la table benevoles directement.

```sql
CREATE VIEW public_planning AS
SELECT 
  p.id as poste_id,
  p.titre,
  p.periode_debut,
  p.periode_fin,
  p.nb_max,
  p.nb_min,
  p.categorie,
  p.description,
  -- Référent formaté
  CASE 
    WHEN p.referent_id IS NOT NULL THEN 
      (SELECT prenom || ' ' || substring(nom from 1 for 1) || '.' 
       FROM benevoles 
       WHERE id = p.referent_id)
    ELSE NULL
  END as referent_nom,
  count(i.id) as inscrits_actuels,
  array_agg(
    b.prenom || ' ' || substring(b.nom from 1 for 1) || '.'
  ) FILTER (WHERE b.id IS NOT NULL) as liste_benevoles_anonymisee
FROM postes p
LEFT JOIN inscriptions i ON p.id = i.poste_id
LEFT JOIN benevoles b ON i.benevole_id = b.id
GROUP BY p.id;
```

**Note technique :** Cette vue calcule dynamiquement le remplissage, formate les noms (Ex: "Thomas D.") et affiche le référent de manière anonymisée.

## 4. Logique Métier : Les Blocages Complexes

### 4.1 Blocage par Capacité Maximale (nb_max)

L'exigence de "blocage complexe selon remplissage" ne peut pas être gérée uniquement côté client (Javascript). Si deux bénévoles cliquent sur le dernier créneau disponible simultanément ("Race Condition"), un simple contrôle JS échouera.

#### Implémentation par Triggers PostgreSQL

La solution robuste consiste à utiliser un Trigger (Déclencheur) `BEFORE INSERT`. C'est une fonction qui s'exécute dans la base de données avant d'accepter une nouvelle inscription.

**Algorithme du Trigger :**

1. Verrouiller la ligne du poste concerné (pour éviter les écritures concurrentes)
2. Compter le nombre d'inscriptions existantes pour ce poste
3. Comparer ce nombre à `nb_max`
4. Si `count >= nb_max`, lever une exception (Erreur SQL) qui remontera jusqu'au frontend
5. Le frontend intercepte l'erreur et affiche "Désolé, ce créneau vient d'être pris"

**Preuve de concept SQL :**

```sql
CREATE OR REPLACE FUNCTION check_capacity() RETURNS TRIGGER AS $$
DECLARE
  current_count INT;
  max_capacity INT;
BEGIN
  SELECT nb_max INTO max_capacity FROM postes WHERE id = NEW.poste_id;
  SELECT count(*) INTO current_count FROM inscriptions WHERE poste_id = NEW.poste_id;
  
  IF current_count >= max_capacity THEN
    RAISE EXCEPTION 'Ce créneau est complet.';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_check_capacity
  BEFORE INSERT ON inscriptions
  FOR EACH ROW
  EXECUTE FUNCTION check_capacity();
```

### 4.2 Blocage par Conflit Temporel

**Exigence critique :** Un bénévole ne peut pas s'inscrire sur deux postes dont les périodes se chevauchent (même partiellement).

#### Détection des Chevauchements Temporels

Deux créneaux se chevauchent si :
- Le début du créneau A est avant la fin du créneau B **ET**
- La fin du créneau A est après le début du créneau B

**Formule SQL :**
```sql
(periode_debut_A < periode_fin_B) AND (periode_fin_A > periode_debut_B)
```

#### Implémentation par Trigger

```sql
CREATE OR REPLACE FUNCTION check_time_conflict() RETURNS TRIGGER AS $$
DECLARE
  conflict_count INT;
  poste_debut TIMESTAMPTZ;
  poste_fin TIMESTAMPTZ;
BEGIN
  -- Récupérer les horaires du poste sur lequel on tente de s'inscrire
  SELECT periode_debut, periode_fin 
  INTO poste_debut, poste_fin
  FROM postes 
  WHERE id = NEW.poste_id;
  
  -- Vérifier si le bénévole a déjà une inscription qui chevauche cette période
  SELECT count(*) INTO conflict_count
  FROM inscriptions i
  JOIN postes p ON i.poste_id = p.id
  WHERE i.benevole_id = NEW.benevole_id
    AND i.id != NEW.id  -- Exclure l'inscription actuelle en cas d'UPDATE
    AND (
      (p.periode_debut < poste_fin) AND (p.periode_fin > poste_debut)
    );
  
  IF conflict_count > 0 THEN
    RAISE EXCEPTION 'Vous êtes déjà inscrit(e) sur un créneau qui chevauche cette période.';
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_check_time_conflict
  BEFORE INSERT OR UPDATE ON inscriptions
  FOR EACH ROW
  EXECUTE FUNCTION check_time_conflict();
```

**Avantage :** Cette vérification est atomique et garantie au niveau de la base de données, indépendamment du comportement du frontend.

## 5. Stratégie d'Authentification "Sans Compte"

L'utilisateur demande "pas de compte (seed par mail)". Cela correspond techniquement à l'authentification "Passwordless" ou "Magic Link".

### 5.1 Le Flux Utilisateur

1. Le bénévole arrive sur le site Github Pages
2. Il entre son email dans un champ simple
3. Supabase envoie un email contenant un lien unique via son service Auth intégré
4. Le bénévole clique sur le lien
5. Il est redirigé vers le site, connecté, avec un Token d'accès sécurisé (JWT) stocké dans le navigateur
6. À la première connexion, un formulaire lui demande ses infos (Nom, Prénom, T-shirt). Aux connexions suivantes, ces infos sont pré-remplies

### 5.2 Configuration Supabase Auth

Dans le dashboard Supabase :
- **Authentication > Providers > Email** : Activer "Enable Email provider"
- **Authentication > Email Templates** : Personnaliser le template du Magic Link avec les couleurs et polices du projet
- **Authentication > URL Configuration** : Définir l'URL de redirection vers le site GitHub Pages

**Note importante :** Le plan gratuit de Supabase inclut l'envoi de Magic Links via son infrastructure email interne, suffisant pour les besoins d'une compétition (limite raisonnable de plusieurs centaines d'emails par jour).

## 6. Architecture Frontend et Génération par IA

Le code doit être "généré par IA" et hébergé sur Github Pages. L'architecture doit être simple pour faciliter la génération et la maintenance.

### 6.1 Stack Frontend Minimaliste

Évitons les frameworks complexes (React, Next.js) qui nécessitent des étapes de "build" complexes.

- **Framework JS :** Alpine.js (via CDN) - librairie ultra-légère pour gérer la logique dynamique
- **CSS :** Tailwind CSS (via CDN) avec configuration personnalisée
- **Client Supabase :** supabase-js via CDN

### 6.2 Charte Graphique : Style Neo-Brutaliste

**Palette de couleurs :**
```css
:root {
  --black: #000000;
  --ice: #8bbfd5;
  --white: #ffffff;
}
```

**Typographies :**
- **Body :** 'Space Grotesk' (Google Fonts)
- **Titres :** 'Inter' (Google Fonts)

**Caractéristiques du style neo-brutaliste :**
- Bordures noires épaisses (3-5px)
- Ombres portées dures (pas de blur) : `box-shadow: 5px 5px 0px #000000`
- Boutons avec effet 3D écrasé au clic
- Pas de dégradés, couleurs plates
- Typographie grasse et contrastée
- Espaces généreux entre les éléments

### 6.3 Logique d'Affichage des Conflits Temporels (Frontend)

Bien que la vérification définitive soit côté serveur (trigger), le frontend doit **anticiper visuellement** les conflits pour améliorer l'UX.

**Algorithme côté client (Alpine.js) :**

1. Récupérer toutes les inscriptions du bénévole connecté
2. Pour chaque poste affiché, vérifier s'il chevauche une inscription existante
3. Si chevauchement détecté :
   - Griser le bouton "S'inscrire"
   - Afficher un badge "Conflit horaire" avec fond noir et texte blanc
   - Désactiver le clic

**Exemple de fonction JavaScript :**

```javascript
function hasTimeConflict(posteDebut, posteFin, userInscriptions) {
  return userInscriptions.some(inscription => {
    const inscriptionDebut = new Date(inscription.poste.periode_debut);
    const inscriptionFin = new Date(inscription.poste.periode_fin);
    const debut = new Date(posteDebut);
    const fin = new Date(posteFin);
    
    return (debut < inscriptionFin) && (fin > inscriptionDebut);
  });
}
```

### 6.4 Stratégie de Prompting pour l'IA

Pour obtenir le code souhaté, voici la structure de prompt recommandée :

---

**Prompt Suggéré :**

```
Agis comme un développeur web expert spécialisé en design neo-brutaliste.

Crée un fichier HTML unique pour un système de gestion de bénévoles pour une compétition d'escalade.

STACK TECHNIQUE :
- Alpine.js pour la logique (via CDN)
- Tailwind CSS pour le style (via CDN)
- Supabase client (via CDN)
- Fonts: 'Space Grotesk' (body) et 'Inter' (titres) via Google Fonts

CHARTE GRAPHIQUE NEO-BRUTALISTE :
- Couleurs: noir (#000000), ice (#8bbfd5), blanc (#ffffff)
- Bordures noires épaisses (4px)
- Ombres dures sans blur: box-shadow: 6px 6px 0px #000000
- Boutons avec effet 3D écrasé au clic
- Typographie grasse et contrastée
- Espaces généreux

FONCTIONNALITÉS :

1. AUTHENTIFICATION :
   - Si non connecté : formulaire avec champ email pour Magic Link
   - Bouton "Recevoir le lien de connexion" (style brutal, fond ice, bordure noire)
   - Si connecté : afficher "Bienvenue [Prénom]" + bouton "Se déconnecter"

2. FORMULAIRE PROFIL (première connexion) :
   - Champs: Prénom, Nom, Téléphone, Taille T-shirt (XS, S, M, L, XL, XXL)
   - Sauvegarder dans table 'benevoles'

3. AFFICHAGE DES POSTES :
   - Récupérer depuis la vue 'public_planning'
   - Grouper par 'categorie' puis trier par 'periode_debut'
   - Pour chaque poste, afficher:
     * Titre (typo Inter, bold, taille 24px)
     * Horaire formaté (ex: "Sam 16 mai - 08h00 à 12h00")
     * Description dans un encadré
     * Référent si présent: "Référent: [Prénom I.]"
     * Barre de progression: [inscrits_actuels / nb_max]
       - Verte si < 70% de remplissage
       - Orange si 70-90%
       - Rouge si > 90%
     * Liste des bénévoles inscrits (Prénom I.)
     * Bouton "Je m'inscris" (disabled si complet OU conflit horaire)

4. LOGIQUE DE CONFLIT TEMPOREL :
   - Récupérer les inscriptions du bénévole connecté
   - Pour chaque poste, vérifier si la période chevauche une inscription existante
   - Si conflit détecté:
     * Griser le bouton
     * Afficher badge "⚠️ Conflit horaire" (fond noir, texte blanc)
     * Empêcher le clic

5. GESTION DES INSCRIPTIONS :
   - Au clic sur "Je m'inscris": INSERT dans table 'inscriptions'
   - Gérer les erreurs du trigger (capacité max ou conflit temporel)
   - Afficher message d'erreur dans un toast (fond noir, texte ice)
   - Si succès: afficher toast de confirmation et rafraîchir la liste

6. ÉTATS DES BOUTONS :
   - Complet: gris clair, texte gris foncé, curseur "not-allowed"
   - Conflit: gris avec bordure orange, badge visible
   - Disponible: fond ice, texte noir, bordure noire 4px, ombre dure
   - Hover: décaler l'ombre (effet de mouvement)
   - Active: réduire l'ombre (effet d'enfoncement)

SUPABASE CONFIG (utiliser des placeholders) :
- Project URL: 'https://YOUR_PROJECT.supabase.co'
- Anon Key: 'YOUR_ANON_KEY'

CONTRAINTES :
- Fichier HTML unique (tout inline)
- Responsive (mobile-first avec Tailwind)
- Accessibilité (ARIA labels sur boutons)
- Gestion d'erreur robuste (try/catch sur toutes les requêtes Supabase)
```

---

## 7. Guide de Déploiement et Configuration

### 7.1 Configuration de la "BDD Visuelle" (Supabase)

1. **Créer un projet Supabase** (gratuit) sur https://supabase.com
2. **SQL Editor** : Coller le script SQL complet (tables + triggers + vue)
3. **Table Editor** : Créer les créneaux initiaux
   - Double-cliquer pour éditer directement (comme Excel)
   - Ajouter des postes, modifier les horaires, ajuster nb_max/nb_min
4. **Créer des bénévoles référents** : Insérer manuellement quelques profils dans `benevoles` pour pouvoir les lier comme référents

### 7.2 Sécurité : Row Level Security (RLS)

**Règles critiques à appliquer dans Supabase :**

#### Table `postes` :
```sql
-- Lecture publique
CREATE POLICY "Lecture publique des postes"
  ON postes FOR SELECT
  USING (true);

-- Écriture admin uniquement (via service_role key, pas via frontend)
```

#### Table `benevoles` :
```sql
-- Lecture : uniquement son propre profil
CREATE POLICY "Lecture de son profil"
  ON benevoles FOR SELECT
  USING (auth.uid() = id);

-- Insertion : création automatique à la première connexion
CREATE POLICY "Création de son profil"
  ON benevoles FOR INSERT
  WITH CHECK (auth.uid() = id);

-- Mise à jour : uniquement son propre profil
CREATE POLICY "Mise à jour de son profil"
  ON benevoles FOR UPDATE
  USING (auth.uid() = id);
```

#### Table `inscriptions` :
```sql
-- Lecture publique (ou via vue anonymisée)
CREATE POLICY "Lecture publique des inscriptions"
  ON inscriptions FOR SELECT
  USING (true);

-- Insertion : uniquement pour soi-même
CREATE POLICY "Inscription pour soi-même"
  ON inscriptions FOR INSERT
  WITH CHECK (auth.uid() = benevole_id);

-- Suppression : uniquement ses propres inscriptions
CREATE POLICY "Suppression de ses inscriptions"
  ON inscriptions FOR DELETE
  USING (auth.uid() = benevole_id);
```

#### Vue `public_planning` :
La vue hérite des permissions des tables sous-jacentes. Pas de RLS spécifique nécessaire.

### 7.3 Hébergement GitHub Pages

1. Créer un repository public sur GitHub (ex: `benevoles-escalade`)
2. Déposer le fichier `index.html` généré par l'IA
3. **Settings > Pages** : Activer GitHub Pages (Source: main branch, root)
4. L'URL devient : `https://votre-pseudo.github.io/benevoles-escalade`
5. **Configurer Supabase** :
   - Copier l'URL du site GitHub Pages
   - Dans Supabase > Authentication > URL Configuration > Site URL, coller l'URL
   - Dans Redirect URLs, ajouter `https://votre-pseudo.github.io/benevoles-escalade`

**Sécurité des clés :**
Les clés Supabase (Project URL et Anon Key) peuvent être mises directement dans le code JavaScript. La clé `anon` est conçue pour être publique, tant que les règles RLS sont bien configurées.

## 8. Analyse des Risques et Recommandations Finales

### 8.1 Gestion des Données "Extras" (T-shirt)

Pour la taille de t-shirt, une simple colonne `text` ou `enum` suffit. Si l'organisateur souhaite ajouter d'autres questions futures (ex: allergies), une colonne `jsonb` nommée `extras` peut être ajoutée à la table `benevoles`.

### 8.2 Export et Reporting

**Pour l'organisateur :**
- **Table Editor** de Supabase : Export CSV direct de toutes les tables
- **SQL Editor** : Requêtes personnalisées (ex: "Liste des bénévoles par poste avec coordonnées complètes")

**Exemple de requête utile :**
```sql
SELECT 
  p.titre as Poste,
  p.periode_debut as Debut,
  p.periode_fin as Fin,
  b.prenom as Prenom,
  b.nom as Nom,
  b.telephone as Telephone,
  b.taille_tshirt as Taille
FROM inscriptions i
JOIN postes p ON i.poste_id = p.id
JOIN benevoles b ON i.benevole_id = b.id
ORDER BY p.periode_debut, p.titre;
```

Export en CSV pour impression ou import dans Excel.

### 8.3 Maintenance et RGPD

**Après la compétition :**
```sql
-- Anonymiser les données personnelles
UPDATE benevoles 
SET nom = 'ANONYME', 
    prenom = 'ANONYME', 
    telephone = NULL, 
    email = 'anonyme@example.com';

-- Ou supprimer complètement
DELETE FROM inscriptions;
DELETE FROM benevoles;
```

Garder uniquement les statistiques dans une table d'archivage si nécessaire.

### 8.4 Limitations et Points d'Attention

**Limites du plan gratuit Supabase :**
- 500 MB de stockage (largement suffisant pour des milliers de bénévoles)
- 50 000 utilisateurs actifs/mois (dépassement improbable pour une compétition)
- 2 GB de bande passante/mois (attention si site très visité avant l'événement)

**Solutions de contournement si dépassement :**
- Optimiser les images (compresser, utiliser WebP)
- Mettre en cache les données côté client (LocalStorage)
- Migrer temporairement vers un plan payant le mois de la compétition (~25€)

## Conclusion

La demande est réalisable gratuitement et sans serveur grâce à l'architecture **Supabase + GitHub Pages**. Cette solution offre :

✅ **Gratuité réelle** (hébergement + BDD + authentification)  
✅ **Sécurité enterprise** via RLS (indispensable pour un site public)  
✅ **Logique complexe** via Triggers SQL (blocage capacité + conflits temporels)  
✅ **Interface visuelle** via le dashboard Supabase  
✅ **Design moderne** avec style neo-brutaliste personnalisé  
✅ **Respect du RGPD** via anonymisation automatique  

Le système est **moderne, résilient, et parfaitement adapté à une génération de code par IA**, car il repose sur des standards (SQL, HTML, JS, Tailwind) que les modèles de langage maîtrisent parfaitement.

**La clé du succès réside dans :**
1. La bonne configuration des **Triggers PostgreSQL** pour garantir l'intégrité des données
2. Les **règles RLS** strictes pour protéger les informations personnelles
3. L'**UX anticipative** qui détecte les conflits côté client avant validation serveur
4. Le **design brutal et épuré** qui rend l'interface intuitive et mémorable
```