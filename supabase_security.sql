-- Enable RLS on all tables
ALTER TABLE benevoles ENABLE ROW LEVEL SECURITY;
ALTER TABLE postes ENABLE ROW LEVEL SECURITY;
ALTER TABLE periodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE inscriptions ENABLE ROW LEVEL SECURITY;

-- Policies for 'benevoles'
-- Users can view their own profile
CREATE POLICY "Users can view own profile" ON benevoles
  FOR SELECT USING (auth.uid() = id);

-- Users can update their own profile
CREATE POLICY "Users can update own profile" ON benevoles
  FOR UPDATE USING (auth.uid() = id);

-- Admins can view all profiles
CREATE POLICY "Admins can view all profiles" ON benevoles
  FOR SELECT USING (
    auth.uid() IN (SELECT id FROM benevoles WHERE role = 'admin')
  );

-- Admins can update all profiles (to change roles)
CREATE POLICY "Admins can update all profiles" ON benevoles
  FOR UPDATE USING (
    auth.uid() IN (SELECT id FROM benevoles WHERE role = 'admin')
  );

-- Policies for 'postes'
-- Everyone can view postes (public)
CREATE POLICY "Public can view postes" ON postes
  FOR SELECT USING (true);

-- Only admins can insert/update/delete postes
CREATE POLICY "Admins can manage postes" ON postes
  FOR ALL USING (
    auth.uid() IN (SELECT id FROM benevoles WHERE role = 'admin')
  );

-- Policies for 'periodes'
-- Everyone can view periodes (public)
CREATE POLICY "Public can view periodes" ON periodes
  FOR SELECT USING (true);

-- Only admins can manage periodes
CREATE POLICY "Admins can manage periodes" ON periodes
  FOR ALL USING (
    auth.uid() IN (SELECT id FROM benevoles WHERE role = 'admin')
  );

-- Policies for 'inscriptions'
-- Users can view their own inscriptions
CREATE POLICY "Users can view own inscriptions" ON inscriptions
  FOR SELECT USING (auth.uid() = benevole_id);

-- Users can insert their own inscriptions
CREATE POLICY "Users can insert own inscriptions" ON inscriptions
  FOR INSERT WITH CHECK (auth.uid() = benevole_id);

-- Users can delete their own inscriptions
CREATE POLICY "Users can delete own inscriptions" ON inscriptions
  FOR DELETE USING (auth.uid() = benevole_id);

-- Admins can view all inscriptions
CREATE POLICY "Admins can view all inscriptions" ON inscriptions
  FOR SELECT USING (
    auth.uid() IN (SELECT id FROM benevoles WHERE role = 'admin')
  );
