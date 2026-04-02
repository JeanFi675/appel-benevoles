import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

// Charge les variables d'environnement depuis le fichier .env
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const anonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || (!serviceRoleKey && !anonKey)) {
  console.error('Erreur: Les variables d\'environnement SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY sont requises.');
  process.exit(1);
}

if (!serviceRoleKey) {
  console.error('\n⚠️ ATTENTION : Vous utilisez la clé "anon" (publique) !');
  console.error('À cause des règles de sécurité (RLS) de votre base de données, Supabase va renvoyer 0 résultat.');
  console.error('👉 Veuillez décommenter et remplir SUPABASE_SERVICE_ROLE_KEY dans votre fichier .env avant de lancer le script.\n');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey);

async function main() {
  try {
    console.log('Récupération des données depuis Supabase...');

    // 1. Récupérer toutes les adhésions du club
    const { data: adhesions, error: errorAdhesions } = await supabase
      .from('club_adhesions')
      .select('nom, prenom, mail');

    if (errorAdhesions) throw errorAdhesions;

    // 2. Récupérer tous les bénévoles inscrits
    const { data: benevoles, error: errorBenevoles } = await supabase
      .from('benevoles')
      .select('nom, prenom, email');

    if (errorBenevoles) throw errorBenevoles;

    console.log(`${adhesions.length} adhésions trouvées.`);
    console.log(`${benevoles.length} bénévoles trouvés.`);

    // 3. Filtrer les adhérents qui ne sont PAS dans les bénévoles
    const nonBenevoles = adhesions.filter(adhesion => {
      // Normaliser les données pour la comparaison (insensible à la casse)
      const adMail = (adhesion.mail || '').trim().toLowerCase();
      const adNom = (adhesion.nom || '').trim().toLowerCase();
      const adPrenom = (adhesion.prenom || '').trim().toLowerCase();

      // Ne pas insérer dans le JSON si l'email est vide
      if (!adMail) {
        return false;
      }

      // Vérifier si cet adhérent existe déjà dans les bénévoles
      const existe = benevoles.some(benevole => {
        const benEmail = (benevole.email || '').trim().toLowerCase();
        const benNom = (benevole.nom || '').trim().toLowerCase();
        const benPrenom = (benevole.prenom || '').trim().toLowerCase();

        // Correspondance par email (si présent)
        if (adMail && benEmail && adMail === benEmail) {
          return true;
        }

        // Correspondance par nom + prénom
        if (adNom && benNom && adPrenom && benPrenom && adNom === benNom && adPrenom === benPrenom) {
          return true;
        }

        return false;
      });

      // On garde l'adhérent s'il n'existe pas dans les bénévoles
      return !existe;
    });

    // 4. Écrire le résultat dans un fichier JSON
    const outputPath = path.resolve(process.cwd(), 'adherents_non_benevoles.json');
    fs.writeFileSync(outputPath, JSON.stringify(nonBenevoles, null, 2), 'utf-8');

    console.log(`\nSuccès ! ${nonBenevoles.length} adhérents qui ne sont pas bénévoles ont été exportés.`);
    console.log(`Fichier généré : ${outputPath}`);
    
  } catch (error) {
    console.error('Une erreur est survenue :', error);
  }
}

main();
