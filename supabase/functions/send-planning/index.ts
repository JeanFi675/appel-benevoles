import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import nodemailer from "npm:nodemailer@6.9.7";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {

    const authHeader = req.headers.get('Authorization');
    
    if (authHeader) {
        console.log("Auth Header received:", authHeader.substring(0, 20) + "...");
    } else {
        console.error("Missing Authorization Header");
    }

    if (!authHeader) {
        return new Response(
            JSON.stringify({ error: "Missing Authorization Header" }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 }
        );
    }

    // Extraire le token du header "Bearer <token>"
    const token = authHeader.replace('Bearer ', '');

    // 1. Authentification Supabase
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseKey = Deno.env.get('SUPABASE_ANON_KEY');

    if (!supabaseUrl || !supabaseKey) {
        console.error("Missing SUPABASE_URL or SUPABASE_ANON_KEY env vars");
        throw new Error("Configuration serveur incomplète (URL/KEY manquants)");
    }

    // Créer le client avec le service role key pour les opérations admin
    const supabaseClient = createClient(
      supabaseUrl,
      supabaseKey,
      { global: { headers: { Authorization: authHeader } } }
    );

    // Valider l'utilisateur en passant directement le token JWT
    const {
      data: { user },
      error: userError
    } = await supabaseClient.auth.getUser(token);

    if (userError) {
        console.error("Auth getUser error:", userError);
    }

    if (!user) {
        console.error("Invalid Token, user not found via getUser(token)");
        throw new Error("Utilisateur non authentifié (" + (userError?.message || "Token invalide") + ")");
    }
    
    console.log("✅ User authenticated:", user.email);

    // 2. Configuration SMTP (Gmail)
    const transporter = nodemailer.createTransport({
      host: Deno.env.get("SMTP_HOST") || "smtp.gmail.com",
      port: parseInt(Deno.env.get("SMTP_PORT") || "465"),
      secure: true, // true pour port 465, false pour autres
      auth: {
        user: Deno.env.get("SMTP_USER"),
        pass: Deno.env.get("SMTP_PASS"),
      },
    });

    // 3. Récupération des données (Inscriptions + Postes + Bénévoles)
    // Etape 3a: Récupérer les profils gérés par l'utilisateur connecté
    const { data: profiles, error: profError } = await supabaseClient
        .from('benevoles')
        .select('id, prenom, nom')
        .eq('user_id', user.id); 

    if (profError) throw profError;
    // Si aucun profil géré, on essaie quand même de voir si l'user a des inscriptions directes (si applicable)
    // Mais ici la logique est stricte sur les profils gérés.
    if (!profiles || profiles.length === 0) {
         return new Response(
            JSON.stringify({ message: "Aucun profil bénévole trouvé pour ce compte." }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
        );
    }

    const profileIds = profiles.map(p => p.id);

    // Etape 3b: Récupérer les inscriptions pour ces profils
    const { data: inscriptions, error: inscError } = await supabaseClient
      .from('inscriptions')
      .select('*, postes(*), benevoles(id, prenom, nom)')
      .in('benevole_id', profileIds);

    if (inscError) throw inscError;

    if (!inscriptions || inscriptions.length === 0) {
        return new Response(
            JSON.stringify({ message: "Aucune inscription trouvée." }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
        );
    }

    // 4. Formatage des données pour l'email
    const rows = inscriptions.map(i => {
        const poste = i.postes;
        const benevole = i.benevoles;
        // Sécurité si poste ou bénévole manquant (cas rare de foreign key manquant)
        if (!poste || !benevole) return null;

        return {
            periode: poste.periode || 'Autre',
            debut: new Date(poste.periode_debut),
            fin: new Date(poste.periode_fin),
            titre: poste.titre,
            benevole: `${benevole.prenom} ${benevole.nom}`,
        };
    }).filter(r => r !== null);

    // Tri global par date
    rows.sort((a, b) => a.debut - b.debut);

    // Groupement par Période
    const groups = {};
    rows.forEach(row => {
        if (!groups[row.periode]) groups[row.periode] = [];
        groups[row.periode].push(row);
    });

    // Construction du HTML
    let htmlContent = `
      <div style="font-family: sans-serif; color: #333; max-width: 600px; margin: 0 auto;">
        <h1 style="text-align: center; border-bottom: 4px solid #000; padding-bottom: 10px;">Votre Planning Bénévole</h1>
        <p>Bonjour,</p>
        <p>Voici le récapitulatif de vos missions bénévoles :</p>
    `;

    for (const [periode, missions] of Object.entries(groups)) {
        htmlContent += `
            <div style="margin-top: 20px; border: 2px solid #000; padding: 10px; background-color: #f9f9f9;">
                <h2 style="background-color: #000; color: #fff; padding: 5px 10px; margin: -10px -10px 10px -10px; font-size: 18px; text-transform: uppercase;">${periode}</h2>
                <table style="width: 100%; border-collapse: collapse;">
        `;

        missions.forEach(m => {
            const dateStr = m.debut.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'short' });
            const timeStr = `${m.debut.toLocaleTimeString('fr-FR', {hour: '2-digit', minute:'2-digit'})} - ${m.fin.toLocaleTimeString('fr-FR', {hour: '2-digit', minute:'2-digit'})}`;
            
            htmlContent += `
                <tr style="border-bottom: 1px solid #ddd;">
                    <td style="padding: 8px;">
                        <strong style="display:block; font-size: 16px;">${m.titre}</strong>
                        <span style="font-size: 14px; color: #666;">👤 ${m.benevole}</span>
                    </td>
                    <td style="padding: 8px; text-align: right; vertical-align: top;">
                        <div style="font-weight: bold;">${dateStr}</div>
                        <div>${timeStr}</div>
                    </td>
                </tr>
            `;
        });

        htmlContent += `
                </table>
            </div>
        `;
    }

    htmlContent += `
        <div style="margin-top: 30px; text-align: center; font-size: 12px; color: #888;">
            <p>Merci pour votre engagement ! et n'oubliez pas de venir 30min avant le début de votre 1er créneau pour récupérer votre t-shirt et votre badge au QG bénévole.</p>
            <p>Ceci est un email automatique, merci de ne pas y répondre.</p>
        </div>
      </div>
    `;

    // 5. Envoi de l'email
    const info = await transporter.sendMail({
      from: '"Organisation Bénévoles" <' + (Deno.env.get("SMTP_USER") || "noreply@example.com") + '>',
      to: user.email,
      subject: "📅 Votre Planning Bénévole",
      html: htmlContent,
    });

    return new Response(
      JSON.stringify({ success: true, messageId: info.messageId }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );

  } catch (error) {
    console.error("Erreur:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
