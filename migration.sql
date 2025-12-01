-- 1. Add user_id column to link volunteers to a master user account
ALTER TABLE benevoles ADD COLUMN user_id UUID REFERENCES auth.users(id);

-- 2. Migrate existing data: existing volunteers are their own masters
UPDATE benevoles SET user_id = id WHERE user_id IS NULL;

-- 3. Make user_id mandatory
ALTER TABLE benevoles ALTER COLUMN user_id SET NOT NULL;

-- 4. Update RLS Policies for 'benevoles' table
DROP POLICY IF EXISTS "Users can view own profile" ON benevoles;
CREATE POLICY "Users can view own profiles" ON benevoles 
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own profile" ON benevoles;
CREATE POLICY "Users can update own profiles" ON benevoles 
  FOR UPDATE USING (auth.uid() = user_id);

-- Allow users to create new volunteer profiles for themselves
CREATE POLICY "Users can insert own profiles" ON benevoles 
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- 5. Update RLS Policies for 'inscriptions' table
-- Users should be able to manage inscriptions for ANY volunteer they manage

DROP POLICY IF EXISTS "Users can view own inscriptions" ON inscriptions;
CREATE POLICY "Users can view managed inscriptions" ON inscriptions 
  FOR SELECT USING (
    benevole_id IN (SELECT id FROM benevoles WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS "Users can insert own inscriptions" ON inscriptions;
CREATE POLICY "Users can insert managed inscriptions" ON inscriptions 
  FOR INSERT WITH CHECK (
    benevole_id IN (SELECT id FROM benevoles WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS "Users can delete own inscriptions" ON inscriptions;
CREATE POLICY "Users can delete managed inscriptions" ON inscriptions 
  FOR DELETE USING (
    benevole_id IN (SELECT id FROM benevoles WHERE user_id = auth.uid())
  );
