BEGIN;

INSERT INTO public.periodes (nom, ordre, montant_credit) VALUES ('Mise en Place', 1, 0.00);
INSERT INTO public.periodes (nom, ordre, montant_credit) VALUES ('Samedi 16 Mai 2026 - 1ère heure', 2, 0.00);
INSERT INTO public.periodes (nom, ordre, montant_credit) VALUES ('Samedi 16 Mai 2026 - Matin', 3, 0.00);
INSERT INTO public.periodes (nom, ordre, montant_credit) VALUES ('Samedi 16 Mai 2026 - Après-Midi', 4, 0.00);
INSERT INTO public.periodes (nom, ordre, montant_credit) VALUES ('Samedi 16 Mai 2026 - Soir', 5, 0.00);
INSERT INTO public.periodes (nom, ordre, montant_credit) VALUES ('Dimanche 17 Mai - 1ère heure', 6, 0.00);
INSERT INTO public.periodes (nom, ordre, montant_credit) VALUES ('Dimanche 17 Mai - Matin', 7, 0.00);
INSERT INTO public.periodes (nom, ordre, montant_credit) VALUES ('Dimanche 17 Mai - Après-Midi', 8, 0.00);
INSERT INTO public.periodes (nom, ordre, montant_credit) VALUES ('Dimanche 17 Mai 2026 - Rangement', 9, 0.00);

INSERT INTO public.postes (titre, nb_min, nb_max, periode_debut, periode_fin, description, periode_id)
            SELECT 'Préparation', 4, 8, '2026-05-15T08:00:00+02:00'::timestamptz, '2026-05-15T12:00:00+02:00'::timestamptz, 'Aménagement du secrétariat sportif (tables et chaises) et vérification des raccordements internet. 
Accueil et déchargement des prestataires (officiels / sono / écran / alimentation….)  ', id
            FROM public.periodes WHERE nom = 'Mise en Place';
INSERT INTO public.postes (titre, nb_min, nb_max, periode_debut, periode_fin, description, periode_id)
            SELECT 'Mise en place salle d’échauffement / isolement ', 6, 10, '2026-05-15T14:00:00+02:00'::timestamptz, '2026-05-15T18:00:00+02:00'::timestamptz, 'Rangements des agrès de Gym (avec la Gym)
Ajout de protection / barrières
Mise en place des tapis
Mise en place des prises sur le pan
Nettoyage', id
            FROM public.periodes WHERE nom = 'Mise en Place';
INSERT INTO public.postes (titre, nb_min, nb_max, periode_debut, periode_fin, description, periode_id)
            SELECT 'Mise en place zone public', 10, 16, '2026-05-15T14:00:00+02:00'::timestamptz, '2026-05-15T18:00:00+02:00'::timestamptz, 'Aménagement des espaces officiels (tables, chaises, barrières) pour les juges, les coachs et le médecin. Installation de la signalétique partenaires. Montage de la zone vie (tables, bancs sous l''auditorium) et de la buvette sous barnum. Sécurisation des accès par barriérage routier.
Aide au déploiement technique (câblage, caméras) et montage de la régie.', id
            FROM public.periodes WHERE nom = 'Mise en Place';
INSERT INTO public.postes (titre, nb_min, nb_max, periode_debut, periode_fin, description, periode_id)
            SELECT 'Mise en place zone compétition', 10, 16, '2026-05-15T18:00:00+02:00'::timestamptz, '2026-05-15T22:00:00+02:00'::timestamptz, '- Rangement des prises
- Installation caméra + régie vidéo (arbitrage)
- Affichage mur (départ / top - partenaires)
- Installation chronomètres
- Remise en place des tapis
- Nettoyages
- Préparation des cordes', id
            FROM public.periodes WHERE nom = 'Mise en Place';
INSERT INTO public.postes (titre, nb_min, nb_max, periode_debut, periode_fin, description, periode_id)
            SELECT 'Préparation buvette / snack', 6, 10, '2026-05-15T18:00:00+02:00'::timestamptz, '2026-05-15T20:00:00+02:00'::timestamptz, ' - Installation du matériel électrique
 - Test en charge électrique', id
            FROM public.periodes WHERE nom = 'Mise en Place';
INSERT INTO public.postes (titre, nb_min, nb_max, periode_debut, periode_fin, description, periode_id)
            SELECT 'Photographe', 1, 1, '2026-05-16T09:00:00+02:00'::timestamptz, '2026-05-16T13:30:00+02:00'::timestamptz, 'Photos des compétiteurs', id
            FROM public.periodes WHERE nom = 'Samedi 16 Mai 2026 - Matin';
INSERT INTO public.postes (titre, nb_min, nb_max, periode_debut, periode_fin, description, periode_id)
            SELECT 'Accueil compétiteurs', 2, 3, '2026-05-16T06:30:00+02:00'::timestamptz, '2026-05-16T09:00:00+02:00'::timestamptz, 'Pointage des athlètes avant l''ouverture des qualifications', id
            FROM public.periodes WHERE nom = 'Samedi 16 Mai 2026 - 1ère heure';
INSERT INTO public.postes (titre, nb_min, nb_max, periode_debut, periode_fin, description, periode_id)
            SELECT 'Service Médical / Aide au médecin + Consignes', 2, 2, '2026-05-16T06:30:00+02:00'::timestamptz, '2026-05-16T09:00:00+02:00'::timestamptz, 'Savoir pratiquer les premiers secours (de préférence médecin)

Garder les affaires personnelles des compétiteurs

Tirage des lots de tombola', id
            FROM public.periodes WHERE nom = 'Samedi 16 Mai 2026 - 1ère heure';
INSERT INTO public.postes (titre, nb_min, nb_max, periode_debut, periode_fin, description, periode_id)
            SELECT 'Assurage', 12, 18, '2026-05-16T08:30:00+02:00'::timestamptz, '2026-05-16T13:30:00+02:00'::timestamptz, 'Assurage des compétiteurs qui vont grimper en tête.

ATTENTION :  Afin d''assurer la sécurité, il est indispensable de posséder une excellente maîtrise de l''assurage, y compris en assurant de manière dynamique un grimpeur plus léger que soi (jeunes âgés de 14 à 19 ans). Un contrôle sera effectué avant la compétition. ', id
            FROM public.periodes WHERE nom = 'Samedi 16 Mai 2026 - Matin';
INSERT INTO public.postes (titre, nb_min, nb_max, periode_debut, periode_fin, description, periode_id)
            SELECT 'Booster', 2, 3, '2026-05-16T08:30:00+02:00'::timestamptz, '2026-05-16T13:30:00+02:00'::timestamptz, 'Assurer les ordres de passages des compétiteurs et s''assurer qu''il soit prêt avant leurs passage pour ne pas perdre de temps', id
            FROM public.periodes WHERE nom = 'Samedi 16 Mai 2026 - Matin';
INSERT INTO public.postes (titre, nb_min, nb_max, periode_debut, periode_fin, description, periode_id)
            SELECT 'Streaming', 1, 2, '2026-05-16T08:30:00+02:00'::timestamptz, '2026-05-16T13:30:00+02:00'::timestamptz, 'Cadreurs et titreur pour renseigner les noms et résultats des compétiteurs', id
            FROM public.periodes WHERE nom = 'Samedi 16 Mai 2026 - Matin';
INSERT INTO public.postes (titre, nb_min, nb_max, periode_debut, periode_fin, description, periode_id)
            SELECT 'Snack / Buvette', 5, 7, '2026-05-16T06:30:00+02:00'::timestamptz, '2026-05-16T09:00:00+02:00'::timestamptz, 'Préparation et vente de choses délicieuses :)', id
            FROM public.periodes WHERE nom = 'Samedi 16 Mai 2026 - 1ère heure';
INSERT INTO public.postes (titre, nb_min, nb_max, periode_debut, periode_fin, description, periode_id)
            SELECT 'Surveillance Pan d’échauffement', 2, 3, '2026-05-16T06:30:00+02:00'::timestamptz, '2026-05-16T09:00:00+02:00'::timestamptz, '', id
            FROM public.periodes WHERE nom = 'Samedi 16 Mai 2026 - 1ère heure';
INSERT INTO public.postes (titre, nb_min, nb_max, periode_debut, periode_fin, description, periode_id)
            SELECT 'Secrétariat sportif', 1, 1, '2026-05-16T08:30:00+02:00'::timestamptz, '2026-05-16T13:30:00+02:00'::timestamptz, 'Aide à la saisie des résultats et suivi des enregistrements', id
            FROM public.periodes WHERE nom = 'Samedi 16 Mai 2026 - Matin';
INSERT INTO public.postes (titre, nb_min, nb_max, periode_debut, periode_fin, description, periode_id)
            SELECT 'Gestion et nettoyage salles', 2, 2, '2026-05-16T06:30:00+02:00'::timestamptz, '2026-05-16T09:00:00+02:00'::timestamptz, '- Sécurité et bonne gestion du parterre salle - circulation
- Nettoyer régulièrement les sanitaires', id
            FROM public.periodes WHERE nom = 'Samedi 16 Mai 2026 - 1ère heure';
INSERT INTO public.postes (titre, nb_min, nb_max, periode_debut, periode_fin, description, periode_id)
            SELECT 'Démontage des prises', 5, 10, '2026-05-16T19:00:00+02:00'::timestamptz, '2026-05-16T21:00:00+02:00'::timestamptz, '- Enlever les tapis
- Rentrer les nacelles
- Démontage des prises
- Nettoyage au karcher
- Trie des prises', id
            FROM public.periodes WHERE nom = 'Samedi 16 Mai 2026 - Soir';
INSERT INTO public.postes (titre, nb_min, nb_max, periode_debut, periode_fin, description, periode_id)
            SELECT 'Isolement / Transit / Bagagiste', 5, 7, '2026-05-17T08:00:00+02:00'::timestamptz, '2026-05-17T10:00:00+02:00'::timestamptz, 'Gestion isolement et transit (pas de contacts avec l''extérieur, filtrer les entrées, accompagnement aux toilettes)', id
            FROM public.periodes WHERE nom = 'Dimanche 17 Mai - 1ère heure';
INSERT INTO public.postes (titre, nb_min, nb_max, periode_debut, periode_fin, description, periode_id)
            SELECT 'Snack / Buvette', 10, 15, '2026-05-17T08:00:00+02:00'::timestamptz, '2026-05-17T10:00:00+02:00'::timestamptz, 'Préparation et vente de choses délicieuses :)', id
            FROM public.periodes WHERE nom = 'Dimanche 17 Mai - 1ère heure';
INSERT INTO public.postes (titre, nb_min, nb_max, periode_debut, periode_fin, description, periode_id)
            SELECT 'Gestion et nettoyage salles', 2, 2, '2026-05-17T08:00:00+02:00'::timestamptz, '2026-05-17T10:00:00+02:00'::timestamptz, '- Sécurité et bonne gestion du parterre salle - circulation
- Nettoyer régulièrement les sanitaires', id
            FROM public.periodes WHERE nom = 'Dimanche 17 Mai - 1ère heure';
INSERT INTO public.postes (titre, nb_min, nb_max, periode_debut, periode_fin, description, periode_id)
            SELECT 'Rangement', 25, 30, '2026-05-17T16:00:00+02:00'::timestamptz, '2026-05-17T19:30:00+02:00'::timestamptz, 'Remettre le gymnase comme on nous l’a laissé ;)', id
            FROM public.periodes WHERE nom = 'Dimanche 17 Mai 2026 - Rangement';
INSERT INTO public.postes (titre, nb_min, nb_max, periode_debut, periode_fin, description, periode_id)
            SELECT 'Gestion et nettoyage salles', 2, 2, '2026-05-16T09:00:00+02:00'::timestamptz, '2026-05-16T13:30:00+02:00'::timestamptz, '- Sécurité et bonne gestion du parterre salle - circulation
- Nettoyer régulièrement les sanitaires', id
            FROM public.periodes WHERE nom = 'Samedi 16 Mai 2026 - Matin';
INSERT INTO public.postes (titre, nb_min, nb_max, periode_debut, periode_fin, description, periode_id)
            SELECT 'Surveillance Pan d’échauffement', 2, 3, '2026-05-16T09:00:00+02:00'::timestamptz, '2026-05-16T13:30:00+02:00'::timestamptz, '', id
            FROM public.periodes WHERE nom = 'Samedi 16 Mai 2026 - Matin';
INSERT INTO public.postes (titre, nb_min, nb_max, periode_debut, periode_fin, description, periode_id)
            SELECT 'Snack / Buvette', 8, 15, '2026-05-16T09:00:00+02:00'::timestamptz, '2026-05-16T13:30:00+02:00'::timestamptz, 'Préparation et vente de choses délicieuses :)', id
            FROM public.periodes WHERE nom = 'Samedi 16 Mai 2026 - Matin';
INSERT INTO public.postes (titre, nb_min, nb_max, periode_debut, periode_fin, description, periode_id)
            SELECT 'Service Médical / Aide au médecin + Consignes', 2, 2, '2026-05-16T09:00:00+02:00'::timestamptz, '2026-05-16T13:30:00+02:00'::timestamptz, 'Savoir pratiquer les premiers secours (de préférence médecin)

Garder les affaires personnelles des compétiteurs', id
            FROM public.periodes WHERE nom = 'Samedi 16 Mai 2026 - Matin';
INSERT INTO public.postes (titre, nb_min, nb_max, periode_debut, periode_fin, description, periode_id)
            SELECT 'Photographe', 1, 1, '2026-05-16T13:30:00+02:00'::timestamptz, '2026-05-16T19:00:00+02:00'::timestamptz, 'Photos des compétiteurs', id
            FROM public.periodes WHERE nom = 'Samedi 16 Mai 2026 - Après-Midi';
INSERT INTO public.postes (titre, nb_min, nb_max, periode_debut, periode_fin, description, periode_id)
            SELECT 'Assurage', 12, 18, '2026-05-16T13:30:00+02:00'::timestamptz, '2026-05-16T19:00:00+02:00'::timestamptz, 'Assurage des compétiteurs qui vont grimper en tête.

ATTENTION :  Afin d''assurer la sécurité, il est indispensable de posséder une excellente maîtrise de l''assurage, y compris en assurant de manière dynamique un grimpeur plus léger que soi (jeunes âgés de 14 à 19 ans). Un contrôle sera effectué avant la compétition. ', id
            FROM public.periodes WHERE nom = 'Samedi 16 Mai 2026 - Après-Midi';
INSERT INTO public.postes (titre, nb_min, nb_max, periode_debut, periode_fin, description, periode_id)
            SELECT 'Booster', 2, 3, '2026-05-16T13:30:00+02:00'::timestamptz, '2026-05-16T19:00:00+02:00'::timestamptz, 'Assurer les ordres de passages des compétiteurs et s''assurer qu''il soit prêt avant leurs passage pour ne pas perdre de temps', id
            FROM public.periodes WHERE nom = 'Samedi 16 Mai 2026 - Après-Midi';
INSERT INTO public.postes (titre, nb_min, nb_max, periode_debut, periode_fin, description, periode_id)
            SELECT 'Streaming', 1, 2, '2026-05-16T13:30:00+02:00'::timestamptz, '2026-05-16T19:00:00+02:00'::timestamptz, 'Cadreurs et titreur pour renseigner les noms et résultats des compétiteurs', id
            FROM public.periodes WHERE nom = 'Samedi 16 Mai 2026 - Après-Midi';
INSERT INTO public.postes (titre, nb_min, nb_max, periode_debut, periode_fin, description, periode_id)
            SELECT 'Secrétariat sportif', 1, 1, '2026-05-16T13:30:00+02:00'::timestamptz, '2026-05-16T19:00:00+02:00'::timestamptz, 'Aide à la saisie des résultats et suivi des enregistrements', id
            FROM public.periodes WHERE nom = 'Samedi 16 Mai 2026 - Après-Midi';
INSERT INTO public.postes (titre, nb_min, nb_max, periode_debut, periode_fin, description, periode_id)
            SELECT 'Service Médical / Aide au médecin + Consignes + Tombola', 2, 2, '2026-05-16T13:30:00+02:00'::timestamptz, '2026-05-16T19:00:00+02:00'::timestamptz, 'Savoir pratiquer les premiers secours (de préférence médecin)

Garder les affaires personnelles des compétiteurs

Tirage des lots de tombola', id
            FROM public.periodes WHERE nom = 'Samedi 16 Mai 2026 - Après-Midi';
INSERT INTO public.postes (titre, nb_min, nb_max, periode_debut, periode_fin, description, periode_id)
            SELECT 'Snack / Buvette', 10, 15, '2026-05-16T13:30:00+02:00'::timestamptz, '2026-05-16T19:00:00+02:00'::timestamptz, 'Préparation et vente de choses délicieuses :)', id
            FROM public.periodes WHERE nom = 'Samedi 16 Mai 2026 - Après-Midi';
INSERT INTO public.postes (titre, nb_min, nb_max, periode_debut, periode_fin, description, periode_id)
            SELECT 'Surveillance Pan d’échauffement', 2, 3, '2026-05-16T13:30:00+02:00'::timestamptz, '2026-05-16T19:00:00+02:00'::timestamptz, '', id
            FROM public.periodes WHERE nom = 'Samedi 16 Mai 2026 - Après-Midi';
INSERT INTO public.postes (titre, nb_min, nb_max, periode_debut, periode_fin, description, periode_id)
            SELECT 'Gestion et nettoyage salles', 2, 2, '2026-05-16T13:30:00+02:00'::timestamptz, '2026-05-16T19:00:00+02:00'::timestamptz, '- Sécurité et bonne gestion du parterre salle - circulation
- Nettoyer régulièrement les sanitaires', id
            FROM public.periodes WHERE nom = 'Samedi 16 Mai 2026 - Après-Midi';
INSERT INTO public.postes (titre, nb_min, nb_max, periode_debut, periode_fin, description, periode_id)
            SELECT 'Snack / Buvette', 10, 15, '2026-05-17T10:00:00+02:00'::timestamptz, '2026-05-17T13:15:00+02:00'::timestamptz, 'Préparation et vente de choses délicieuses :)', id
            FROM public.periodes WHERE nom = 'Dimanche 17 Mai - Matin';
INSERT INTO public.postes (titre, nb_min, nb_max, periode_debut, periode_fin, description, periode_id)
            SELECT 'Photographe', 1, 1, '2026-05-17T10:00:00+02:00'::timestamptz, '2026-05-17T13:15:00+02:00'::timestamptz, 'Photos des compétiteurs', id
            FROM public.periodes WHERE nom = 'Dimanche 17 Mai - Matin';
INSERT INTO public.postes (titre, nb_min, nb_max, periode_debut, periode_fin, description, periode_id)
            SELECT 'Service Médical / Aide au médecin + Consignes', 2, 2, '2026-05-17T10:00:00+02:00'::timestamptz, '2026-05-17T13:15:00+02:00'::timestamptz, 'Savoir pratiquer les premiers secours (de préférence médecin)

Garder les affaires personnelles des compétiteurs

Tirage des lots de tombola', id
            FROM public.periodes WHERE nom = 'Dimanche 17 Mai - Matin';
INSERT INTO public.postes (titre, nb_min, nb_max, periode_debut, periode_fin, description, periode_id)
            SELECT 'Isolement / Transit / Bagagiste', 5, 6, '2026-05-17T10:00:00+02:00'::timestamptz, '2026-05-17T13:15:00+02:00'::timestamptz, 'Gestion isolement et transit (pas de contacts avec l''exterieur, filtrer les entrées, accompagnement aux toilettes)', id
            FROM public.periodes WHERE nom = 'Dimanche 17 Mai - Matin';
INSERT INTO public.postes (titre, nb_min, nb_max, periode_debut, periode_fin, description, periode_id)
            SELECT 'Assurage', 4, 6, '2026-05-17T10:00:00+02:00'::timestamptz, '2026-05-17T13:15:00+02:00'::timestamptz, 'Assurage des compétiteurs qui vont grimper en tête.

ATTENTION :  Afin d''assurer la sécurité, il est indispensable de posséder une excellente maîtrise de l''assurage, y compris en assurant de manière dynamique un grimpeur plus léger que soi (jeunes âgés de 14 à 19 ans). Un contrôle sera effectué avant la compétition. ', id
            FROM public.periodes WHERE nom = 'Dimanche 17 Mai - Matin';
INSERT INTO public.postes (titre, nb_min, nb_max, periode_debut, periode_fin, description, periode_id)
            SELECT 'Streaming', 1, 2, '2026-05-17T10:00:00+02:00'::timestamptz, '2026-05-17T13:15:00+02:00'::timestamptz, 'Cadreurs et titreur pour renseigner les noms et résultats des compétiteurs', id
            FROM public.periodes WHERE nom = 'Dimanche 17 Mai - Matin';
INSERT INTO public.postes (titre, nb_min, nb_max, periode_debut, periode_fin, description, periode_id)
            SELECT 'Secrétariat sportif', 1, 1, '2026-05-17T10:00:00+02:00'::timestamptz, '2026-05-17T13:15:00+02:00'::timestamptz, 'Aide à la saisie des résultats et suivi des enregistrements', id
            FROM public.periodes WHERE nom = 'Dimanche 17 Mai - Matin';
INSERT INTO public.postes (titre, nb_min, nb_max, periode_debut, periode_fin, description, periode_id)
            SELECT 'Afficheur chronos', 2, 2, '2026-05-17T10:00:00+02:00'::timestamptz, '2026-05-17T13:15:00+02:00'::timestamptz, 'Gestion du chrono pendant la compétition', id
            FROM public.periodes WHERE nom = 'Dimanche 17 Mai - Matin';
INSERT INTO public.postes (titre, nb_min, nb_max, periode_debut, periode_fin, description, periode_id)
            SELECT 'Gestion et nettoyage salles', 2, 2, '2026-05-17T10:00:00+02:00'::timestamptz, '2026-05-17T13:15:00+02:00'::timestamptz, '- Sécurité et bonne gestion du parterre salle - circulation
- Nettoyer régulièrement les sanitaires', id
            FROM public.periodes WHERE nom = 'Dimanche 17 Mai - Matin';
INSERT INTO public.postes (titre, nb_min, nb_max, periode_debut, periode_fin, description, periode_id)
            SELECT 'Service Médical / Aide au médecin + Consignes ', 2, 2, '2026-05-17T08:00:00+02:00'::timestamptz, '2026-05-17T10:00:00+02:00'::timestamptz, 'Savoir pratiquer les premiers secours (de préférence médecin)

Garder les affaires personnelles des compétiteurs', id
            FROM public.periodes WHERE nom = 'Dimanche 17 Mai - 1ère heure';
INSERT INTO public.postes (titre, nb_min, nb_max, periode_debut, periode_fin, description, periode_id)
            SELECT 'Service Médical / Aide au médecin + Consignes + Tombola', 2, 2, '2026-05-17T13:15:00+02:00'::timestamptz, '2026-05-17T16:00:00+02:00'::timestamptz, 'Savoir pratiquer les premiers secours (de préférence médecin)

Garder les affaires personnelles des compétiteurs

Tirage des lots de tombola', id
            FROM public.periodes WHERE nom = 'Dimanche 17 Mai - Après-Midi';
INSERT INTO public.postes (titre, nb_min, nb_max, periode_debut, periode_fin, description, periode_id)
            SELECT 'Zone Coach', 1, 1, '2026-05-16T13:30:00+02:00'::timestamptz, '2026-05-16T19:00:00+02:00'::timestamptz, 'Filtrer l’accès à la zone coach', id
            FROM public.periodes WHERE nom = 'Samedi 16 Mai 2026 - Après-Midi';
INSERT INTO public.postes (titre, nb_min, nb_max, periode_debut, periode_fin, description, periode_id)
            SELECT 'Zone Coach', 1, 1, '2026-05-17T10:00:00+02:00'::timestamptz, '2026-05-17T13:15:00+02:00'::timestamptz, 'Filtrer l’accès à la zone coach', id
            FROM public.periodes WHERE nom = 'Dimanche 17 Mai - Matin';
INSERT INTO public.postes (titre, nb_min, nb_max, periode_debut, periode_fin, description, periode_id)
            SELECT 'Zone Coach', 1, 1, '2026-05-16T08:30:00+02:00'::timestamptz, '2026-05-16T13:30:00+02:00'::timestamptz, 'Filtrer l’accès à la zone coach', id
            FROM public.periodes WHERE nom = 'Samedi 16 Mai 2026 - Matin';
INSERT INTO public.postes (titre, nb_min, nb_max, periode_debut, periode_fin, description, periode_id)
            SELECT 'Zone Coach  + Podium', 1, 1, '2026-05-17T13:30:00+02:00'::timestamptz, '2026-05-17T15:30:00+02:00'::timestamptz, 'Filtrer l’accès à la zone coach

Mettre en place le podium après les finales ', id
            FROM public.periodes WHERE nom = 'Dimanche 17 Mai - Après-Midi';
INSERT INTO public.postes (titre, nb_min, nb_max, periode_debut, periode_fin, description, periode_id)
            SELECT 'Photographe', 1, 1, '2026-05-17T13:30:00+02:00'::timestamptz, '2026-05-17T16:00:00+02:00'::timestamptz, 'Photos des compétiteurs', id
            FROM public.periodes WHERE nom = 'Dimanche 17 Mai - Après-Midi';
INSERT INTO public.postes (titre, nb_min, nb_max, periode_debut, periode_fin, description, periode_id)
            SELECT 'Service Médical / Aide au médecin + Consignes', 2, 2, '2026-05-17T13:30:00+02:00'::timestamptz, '2026-05-17T16:00:00+02:00'::timestamptz, 'Savoir pratiquer les premiers secours (de préférence médecin)

Garder les affaires personnelles des compétiteurs

Tirage des lots de tombola', id
            FROM public.periodes WHERE nom = 'Dimanche 17 Mai - Après-Midi';
INSERT INTO public.postes (titre, nb_min, nb_max, periode_debut, periode_fin, description, periode_id)
            SELECT 'Isolement / Transit / Bagagiste + Podium', 5, 6, '2026-05-17T13:30:00+02:00'::timestamptz, '2026-05-17T16:00:00+02:00'::timestamptz, 'Gestion isolement et transit (pas de contacts avec l''exterieur, filtrer les entrées, accompagnement aux toilettes)

Mettre en place le podium après les finales', id
            FROM public.periodes WHERE nom = 'Dimanche 17 Mai - Après-Midi';
INSERT INTO public.postes (titre, nb_min, nb_max, periode_debut, periode_fin, description, periode_id)
            SELECT 'Assurage + Podium', 4, 6, '2026-05-17T13:30:00+02:00'::timestamptz, '2026-05-17T16:00:00+02:00'::timestamptz, 'Assurage des compétiteurs qui vont grimper en tête.

ATTENTION :  Afin d''assurer la sécurité, il est indispensable de posséder une excellente maîtrise de l''assurage, y compris en assurant de manière dynamique un grimpeur plus léger que soi (jeunes âgés de 14 à 19 ans). Un contrôle sera effectué avant la compétition. 

Mettre en place le podium après les finales ', id
            FROM public.periodes WHERE nom = 'Dimanche 17 Mai - Après-Midi';
INSERT INTO public.postes (titre, nb_min, nb_max, periode_debut, periode_fin, description, periode_id)
            SELECT 'Streaming + Podium', 1, 2, '2026-05-17T13:30:00+02:00'::timestamptz, '2026-05-17T16:00:00+02:00'::timestamptz, 'Cadreurs et titreur pour renseigner les noms et résultats des compétiteurs

Mettre en place le podium après les finales ', id
            FROM public.periodes WHERE nom = 'Dimanche 17 Mai - Après-Midi';
INSERT INTO public.postes (titre, nb_min, nb_max, periode_debut, periode_fin, description, periode_id)
            SELECT 'Secrétariat sportif', 1, 1, '2026-05-17T13:30:00+02:00'::timestamptz, '2026-05-17T16:00:00+02:00'::timestamptz, 'Aide à la saisie des résultats et suivi des enregistrements', id
            FROM public.periodes WHERE nom = 'Dimanche 17 Mai - Après-Midi';
INSERT INTO public.postes (titre, nb_min, nb_max, periode_debut, periode_fin, description, periode_id)
            SELECT 'Afficheur chronos + Podium', 2, 2, '2026-05-17T13:30:00+02:00'::timestamptz, '2026-05-17T16:00:00+02:00'::timestamptz, 'Gestion du chrono pendant la compétition

Mettre en place le podium après les finales ', id
            FROM public.periodes WHERE nom = 'Dimanche 17 Mai - Après-Midi';
INSERT INTO public.postes (titre, nb_min, nb_max, periode_debut, periode_fin, description, periode_id)
            SELECT 'Gestion et nettoyage salles', 2, 2, '2026-05-17T13:15:00+02:00'::timestamptz, '2026-05-17T16:00:00+02:00'::timestamptz, '- Sécurité et bonne gestion du parterre salle - circulation
- Nettoyer régulièrement les sanitaires', id
            FROM public.periodes WHERE nom = 'Dimanche 17 Mai - Après-Midi';
INSERT INTO public.postes (titre, nb_min, nb_max, periode_debut, periode_fin, description, periode_id)
            SELECT 'Snack / Buvette', 10, 15, '2026-05-17T13:15:00+02:00'::timestamptz, '2026-05-17T16:00:00+02:00'::timestamptz, 'Préparation et vente de choses délicieuses :)', id
            FROM public.periodes WHERE nom = 'Dimanche 17 Mai - Après-Midi';

COMMIT;
