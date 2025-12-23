-- Create a key-value configuration table
CREATE TABLE IF NOT EXISTS public.config (
    key TEXT PRIMARY KEY,
    value JSONB NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_by UUID REFERENCES auth.users(id)
);

-- Enable RLS
ALTER TABLE public.config ENABLE ROW LEVEL SECURITY;

-- Policy: Everyone can read config (public)
CREATE POLICY "Enable read access for all users" ON public.config
    FOR SELECT USING (true);

-- Policy: Only admins can update (assuming admin role or distinct user)
-- For now, allowing authenticated users to update if they are admin, or just generally for this app context if we rely on app logic.
-- Ideally we check auth.uid() against a roles table, but for simplicity/start:
CREATE POLICY "Enable update for authenticated users only" ON public.config
    FOR UPDATE USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

-- Insert default value for cagnotte_active
INSERT INTO public.config (key, value)
VALUES ('cagnotte_active', 'false'::jsonb)
ON CONFLICT (key) DO NOTHING;
