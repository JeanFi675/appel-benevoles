-- Migration: passe les vues admin en security_invoker (corrige le lint Supabase 0010_security_definer_view)
--
-- Purpose:
--   Les vues étaient owned by `postgres` sans l'option `security_invoker`, donc elles
--   s'exécutaient avec les droits du créateur (bypass RLS) — signalé ERROR par le
--   database linter Supabase (security_definer_view).
--
--   On force `security_invoker = true` sur les 3 vues admin : elles n'ont aucune raison
--   de contourner la RLS, l'admin ayant déjà un accès complet via les policies
--   `*_admin_all` / `*_admin_select`. La RLS s'applique désormais à l'appelant réel
--   (défense en profondeur : un non-admin n'obtiendrait que ses propres lignes).
--
--   NOTE — public_planning est volontairement LAISSÉE en SECURITY DEFINER :
--   c'est la couche d'anonymisation publique. Elle agrège `count(inscriptions)` et la
--   liste « Prénom + Initiale » pour des appelants `anon` / bénévoles non-admin qui
--   n'ont, par conception, aucun droit RLS de lecture sur `inscriptions`. La passer en
--   security_invoker renverrait nb_inscrits_actuels = 0 (anon) ou seulement les
--   inscriptions du bénévole connecté → planning faussé. L'ERROR de lint sur cette vue
--   est donc un faux positif assumé (accès anonyme déjà borné aux colonnes anonymisées).

ALTER VIEW public.admin_benevoles    SET (security_invoker = true);
ALTER VIEW public.admin_inscriptions SET (security_invoker = true);
ALTER VIEW public.admin_periodes     SET (security_invoker = true);

-- ----------------------------------------------------------------------------
-- Hardening public_planning : retrait de l'accès `anon`.
--
-- public_planning expose, pour le référent de chaque poste, des données NON
-- anonymisées : referent_nom (nom complet), referent_email, referent_telephone
-- (via les helpers SECURITY DEFINER get_benevole_full_name/email/phone).
-- Le GRANT `anon` hérité des défauts PostgREST permettait à quiconque, muni de
-- la clé anon (publique, embarquée dans le bundle JS), de scraper ces coordonnées
-- sans authentification via l'API REST.
--
-- Aucune page ne lit cette vue en anonyme : index.html (planning.js) la charge
-- dans loadInitialData() gardé par `if (!this.user) return`, et besoins.html
-- (admin-timeline.js) redirige vers index.html si pas de session. Les deux seuls
-- consommateurs sont donc `authenticated` → la révocation `anon` ne casse rien.
--
-- La vue reste volontairement SECURITY DEFINER (cf. note plus haut) : le bypass
-- RLS est nécessaire pour agréger les compteurs globaux côté bénévole non-admin.
REVOKE ALL ON public.public_planning FROM anon;
