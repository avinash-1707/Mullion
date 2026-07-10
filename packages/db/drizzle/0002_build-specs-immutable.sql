-- build_specs is a frozen, content-hashed artifact (02 §2.5) — enforce
-- immutability in the DB, not just by convention (DB-audit B3). Drizzle
-- doesn't model triggers, hence this hand-written migration.
CREATE FUNCTION reject_build_spec_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'build_specs is immutable (id=%)', OLD.id;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER build_specs_immutable
  BEFORE UPDATE OR DELETE ON build_specs
  FOR EACH ROW EXECUTE FUNCTION reject_build_spec_mutation();
