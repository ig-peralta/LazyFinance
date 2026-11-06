import { sql } from "kysely";
import type { MigrationDatabase } from "../../migration-helpers";

export async function up(db: MigrationDatabase) {
  await sql`CREATE FUNCTION identity.resolve_external_identity(
    auth_provider text, auth_issuer text, auth_subject text,
    verified_email text, display_name text, provision boolean
  ) RETURNS TABLE (user_id uuid, email text, name text)
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
  DECLARE found_user identity."user"%ROWTYPE; normalized_email text;
  BEGIN
    IF current_setting('lazyfinance.context_kind', true) IS DISTINCT FROM 'identity-bootstrap' THEN
      RAISE EXCEPTION 'Identity bootstrap context required' USING ERRCODE = '42501';
    END IF;
    IF auth_provider IS NULL OR length(auth_provider) NOT BETWEEN 1 AND 40
      OR auth_issuer IS NULL OR length(auth_issuer) NOT BETWEEN 1 AND 512
      OR auth_subject IS NULL OR length(auth_subject) NOT BETWEEN 1 AND 256 THEN
      RAISE EXCEPTION 'Invalid verified identity' USING ERRCODE = '22023';
    END IF;
    PERFORM pg_advisory_xact_lock(hashtextextended(jsonb_build_array(auth_provider, auth_issuer, auth_subject)::text, 0));
    SELECT u.* INTO found_user FROM identity.external_identity e JOIN identity."user" u ON u.id = e.user_id
      WHERE e.provider = auth_provider AND e.issuer = auth_issuer AND e.provider_subject = auth_subject;
    IF FOUND THEN RETURN QUERY SELECT found_user.id, found_user.email::text, found_user.name::text; RETURN; END IF;
    IF NOT provision OR auth_provider = 'mock' THEN
      RAISE EXCEPTION 'Identity is not linked' USING ERRCODE = '28000';
    END IF;
    normalized_email := lower(trim(verified_email));
    IF normalized_email IS NULL OR length(normalized_email) NOT BETWEEN 1 AND 160 THEN
      RAISE EXCEPTION 'Verified email required' USING ERRCODE = '42501';
    END IF;
    INSERT INTO identity."user" (email, name)
      VALUES (normalized_email, coalesce(nullif(left(trim(display_name), 120), ''), left(normalized_email, 120)))
      RETURNING * INTO found_user;
    INSERT INTO identity.external_identity (provider, issuer, provider_subject, user_id)
      VALUES (auth_provider, auth_issuer, auth_subject, found_user.id);
    RETURN QUERY SELECT found_user.id, found_user.email::text, found_user.name::text;
  END $$;
  ALTER FUNCTION identity.resolve_external_identity(text,text,text,text,text,boolean) OWNER TO lazyfinance_identity_bootstrap;
  REVOKE ALL ON FUNCTION identity.resolve_external_identity(text,text,text,text,text,boolean) FROM PUBLIC;
  GRANT EXECUTE ON FUNCTION identity.resolve_external_identity(text,text,text,text,text,boolean) TO lazyfinance_runtime;
  `.execute(db);
}

export async function down(db: MigrationDatabase) {
  await sql`DROP FUNCTION identity.resolve_external_identity(text,text,text,text,text,boolean)`.execute(
    db,
  );
}
