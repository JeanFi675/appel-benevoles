CREATE OR REPLACE FUNCTION public.prevent_role_change()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  -- Check if the role is actually changing
  -- AND the user is authenticated
  -- AND the user is trying to change their own record (auth.uid() matches the record's user_id)
  IF NEW.role IS DISTINCT FROM OLD.role 
     AND auth.role() = 'authenticated' 
     AND auth.uid() = OLD.user_id THEN
    RAISE EXCEPTION 'You cannot change your own role.';
  END IF;
  RETURN NEW;
END;
$function$;
