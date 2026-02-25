import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '.env') });

const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
  console.log('Project URL:', supabaseUrl);
  // Log in user
  // On ne peut pas log in un utilisateur sans mdp. On va juste récupérer les profiles par RLS (non, RLS bloque anon).
  // Wait, if RLS blocks anon, we can't read.
  
  // Can we use the service role key ? Let's check if we have it in .env. No, it's not in the VITE_ prefixed env that was printed.
  // Wait, .env does have .env but the only variables dumped were VITE_APP...
}
check();
