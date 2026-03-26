import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import nodemailer from "npm:nodemailer@6.9.7";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');

    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing Authorization Header" }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 }
      );
    }

    const token = authHeader.replace('Bearer ', '');

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceKey) {
      throw new Error("Configuration serveur incomplète (URL/KEY manquants)");
    }

    // Client admin pour valider le token et vérifier le rôle
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    const { data: { user: caller }, error: userError } = await supabaseAdmin.auth.getUser(token);

    if (userError || !caller) {
      throw new Error("Utilisateur non authentifié (" + (userError?.message || "Token invalide") + ")");
    }

    // Vérifier que l'appelant est admin
    const { data: callerProfile, error: profileError } = await supabaseAdmin
      .from('benevoles')
      .select('role')
      .eq('user_id', caller.id)
      .single();

    if (profileError || !callerProfile || callerProfile.role !== 'admin') {
      return new Response(
        JSON.stringify({ error: "Accès refusé. Seuls les admins peuvent envoyer des relances." }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 403 }
      );
    }

    // Récupérer l'ID du bénévole à relancer
    const { benevole_id } = await req.json();

    if (!benevole_id) {
      return new Response(
        JSON.stringify({ error: "benevole_id est requis." }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    // Récupérer les infos du bénévole
    const { data: benevole, error: benevoleError } = await supabaseAdmin
      .from('benevoles')
      .select('id, email, prenom, nom')
      .eq('id', benevole_id)
      .single();

    if (benevoleError || !benevole) {
      return new Response(
        JSON.stringify({ error: "Bénévole introuvable." }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 404 }
      );
    }

    if (!benevole.email) {
      return new Response(
        JSON.stringify({ error: "Ce bénévole n'a pas d'adresse email." }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    // Configuration SMTP
    const transporter = nodemailer.createTransport({
      host: Deno.env.get("SMTP_HOST") || "smtp.gmail.com",
      port: parseInt(Deno.env.get("SMTP_PORT") || "465"),
      secure: true,
      auth: {
        user: Deno.env.get("SMTP_USER"),
        pass: Deno.env.get("SMTP_PASS"),
      },
    });

    const prenom = benevole.prenom || 'Bénévole';

    const htmlContent = `
      <div style="font-family: Arial, sans-serif; color: #333; max-width: 600px; margin: 0 auto; line-height: 1.6;">
        <p>Salut !</p>

        <p>On a bien reçu ton inscription — merci, vraiment. Ton profil est là, bien enregistré.</p>

        <p>Mais on a remarqué qu'il manque une étape : tu n'as pas encore choisi de poste. Et sans ça, impossible de te placer dans l'équipe pour le week-end.</p>

        <p>Pas de panique, c'est rapide. Il suffit de cliquer ici et de sélectionner ce qui te correspond :</p>

        <p style="text-align: center; margin: 30px 0;">
          <a href="https://jeanfi675.github.io/appel-benevoles/"
             style="background-color: #000; color: #fff; padding: 14px 28px; text-decoration: none; font-weight: bold; font-size: 16px; display: inline-block;">
            Choisir mon poste →
          </a>
        </p>

        <p>Et si tu as bloqué quelque part, ou qu'un truc n'était pas clair, réponds directement à ce mail — on arrange ça en deux minutes.</p>

        <p>Bonne journée et à très vite,</p>

        <hr style="border: none; border-top: 1px solid #ddd; margin: 30px 0;" />

        <table style="width: 100%; border-collapse: collapse;">
          <tr>
            <td style="padding-right: 15px; vertical-align: middle; width: 120px;">
              <img src="https://www.caflarochebonneville.fr/ftp/cafsignaturemail.png"
                   alt="CAF La Roche Bonneville"
                   style="max-width: 120px; display: block;" />
            </td>
            <td style="vertical-align: middle; font-size: 13px; color: #555;">
              <strong>L'équipe de bénévoles du CAF</strong><br />
              Club Alpin Français - La Roche Bonneville<br />
              84, rue du Faucigny - 74800 La Roche sur Foron
            </td>
          </tr>
        </table>
      </div>
    `;

    const info = await transporter.sendMail({
      from: '"Organisation Bénévoles" <' + (Deno.env.get("SMTP_USER") || "noreply@example.com") + '>',
      to: benevole.email,
      subject: "Il te reste une étape pour rejoindre l'équipe ;)",
      html: htmlContent,
    });

    console.log(`✅ Relance envoyée à ${benevole.email} (${info.messageId})`);

    // Mettre à jour relance_sent_at
    const now = new Date().toISOString();
    const { error: updateError } = await supabaseAdmin
      .from('benevoles')
      .update({ relance_sent_at: now })
      .eq('id', benevole_id);

    if (updateError) {
      console.error("Erreur mise à jour relance_sent_at:", updateError);
      // L'email a quand même été envoyé, on ne fait pas échouer la réponse
    }

    return new Response(
      JSON.stringify({ success: true, relance_sent_at: now, messageId: info.messageId }),
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
