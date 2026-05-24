import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error("Erreur: Les variables d'environnement VITE_SUPABASE_URL et VITE_SUPABASE_ANON_KEY doivent être définies.");
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function runDiagnosis() {
    console.log("=== Début du diagnostic de la suppression des périodes ===");
    
    // 1. Fetch some periods to see what we have
    const { data: periodes, error: fetchErr } = await supabase.from('periodes').select('*').limit(5);
    if (fetchErr) {
        console.error("Erreur lors de la récupération des périodes:", fetchErr);
        return;
    }
    console.log("Périodes existantes:", periodes);

    // 2. Create a test period
    console.log("\n1. Création d'une période de test...");
    const testPeriodNom = "Test Période " + Date.now();
    const { data: newPeriod, error: insertErr } = await supabase
        .from('periodes')
        .insert({ nom: testPeriodNom, ordre: 9999, montant_credit: 10.00 })
        .select()
        .single();

    if (insertErr) {
        console.error("Erreur lors de la création de la période de test:", insertErr);
        console.log("Note: Si c'est une erreur de RLS (droits insuffisants), c'est normal avec la anon key sans être connecté.");
        return;
    }
    console.log("Période de test créée avec succès:", newPeriod);

    // 3. Create a test shift linked to this period
    console.log("\n2. Création d'un poste de test lié à cette période...");
    const { data: newPoste, error: insertPosteErr } = await supabase
        .from('postes')
        .insert({
            titre: "Test Poste",
            nb_min: 1,
            nb_max: 2,
            periode_debut: new Date().toISOString(),
            periode_fin: new Date(Date.now() + 3600000).toISOString(),
            periode_id: newPeriod.id
        })
        .select()
        .single();

    if (insertPosteErr) {
        console.error("Erreur lors de la création du poste de test:", insertPosteErr);
        // Supprimer la période créée
        await supabase.from('periodes').delete().eq('id', newPeriod.id);
        return;
    }
    console.log("Poste de test créé avec succès:", newPoste);

    // 4. Simulate the exact delete logic from index.js
    console.log("\n3. Simulation du détachement des postes...");
    const { data: updateData, error: updateErr } = await supabase
        .from('postes')
        .update({ periode_id: null })
        .eq('periode_id', newPeriod.id)
        .select();

    if (updateErr) {
        console.error("Erreur lors du détachement du poste:", updateErr);
    } else {
        console.log("Postes détachés avec succès:", updateData);
    }

    console.log("\n4. Simulation de la suppression physique de la période...");
    const { data: deleteData, error: deleteErr } = await supabase
        .from('periodes')
        .delete()
        .eq('id', newPeriod.id);

    if (deleteErr) {
        console.error("Erreur lors de la suppression de la période:", deleteErr);
    } else {
        console.log("Période supprimée avec succès !", deleteData);
    }

    // Nettoyage au cas où
    await supabase.from('postes').delete().eq('id', newPoste.id);
    await supabase.from('periodes').delete().eq('id', newPeriod.id);
}

runDiagnosis().catch(err => console.error("Erreur fatale:", err));
