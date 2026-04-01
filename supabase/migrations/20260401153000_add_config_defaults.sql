-- Insert default values for the new cagnotte config keys so they can be updated via the frontend
INSERT INTO public.config (key, value)
VALUES 
    ('tarif_degaines_juge', '10'::jsonb),
    ('tarif_degaines_officiel', '15'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- Enable insert on the config table for authenticated users to allow UPSERT operations in the future if needed
CREATE POLICY "Enable insert for authenticated users" ON public.config
    FOR INSERT WITH CHECK (auth.role() = 'authenticated');
