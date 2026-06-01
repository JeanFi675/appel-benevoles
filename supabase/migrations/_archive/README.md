# Migrations archivées — Phase 2.8

Ce dossier contient les **20 migrations atomiques** de la Phase 2 (refactoring schéma) et de la Phase 3.1/3.3 (sécurisation RLS), plus le `PLAN.md` qui mappait les anomalies de `audit_db.md` aux fichiers de migration.

**Consolidation** : 2026-05-27 — toutes ces migrations ont été remplacées par `supabase/migrations/00000000000000_init.sql`, dump propre du schéma final après application séquentielle des migrations ci-dessous.

**Statut** : ces fichiers sont conservés uniquement à des fins de traçabilité historique. Ils ne sont **plus appliqués** par `supabase db push` ou `supabase db reset` (ils sont hors du chemin actif `supabase/migrations/`).

## Ordre chronologique (référence)

```
20260526120000_refactor_admin_views.sql                  Phase 2.2 — prérequis drop colonnes
20260526120100_update_debit_cagnotte_drop_auteur.sql     Phase 2.2 — prérequis drop colonnes
20260526120200_drop_unused_columns.sql                   Phase 2.2 — drop colonnes UNUSED
20260526120300_drop_unused_table_mentions.sql            Phase 2.2 — drop table UNUSED + enums orphelins
20260526130000_backfill_telephone_inconnu.sql            Phase 2.3 — backfill avant NOT NULL
20260526130100_add_not_null_constraints.sql              Phase 2.3 — NOT NULL manquants
20260526130200_add_fk_cagnotte_user.sql                  Phase 2.3 — FK H02
20260526130300_drop_juges_officiels.sql                  Phase 2.3 — D1 (drop 3 rôles)
20260526130400_alter_fk_cagnotte_benevole_cascade.sql    Phase 2.3 — D6.b
20260526130500_add_check_constraints.sql                 Phase 2.3 — CHECK métier
20260526130600_add_unique_constraints.sql                Phase 2.3 — UNIQUE + dédup
20260526130700_add_exclude_postes_overlap.sql            Phase 2.3 — EXCLUDE gist
20260526140000_enable_citext_convert_email.sql           Phase 2.4 — citext + email
20260526140100_create_role_enum.sql                      Phase 2.4 — enum role_type
20260526140200_create_tshirt_cagnotte_enums.sql          Phase 2.4 — enums tshirt + cagnotte
20260526140300_add_check_email_phone_patterns.sql        Phase 2.4 — CHECK email/téléphone
20260526150000_add_missing_indexes.sql                   Phase 2.5 — 7 index manquants
20260526160000_rename_naming_conventions.sql             Phase 2.6 — renommages
20260527100000_enable_force_rls.sql                      Phase 3.1 — FORCE RLS
20260527110000_fix_rls_policies.sql                      Phase 3.3 — policies RLS finales
```

## Pour relire l'historique

Les commits Git précédant `feat: consolidate schema into init.sql` (Phase 2.8) contiennent les changements appliqués par chaque migration ci-dessus, avec le contexte de chaque anomalie.
