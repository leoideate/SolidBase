-- Constraints Drizzle cannot express. See ARD F07, F14, F16, T06.
CREATE EXTENSION IF NOT EXISTS btree_gist;
--> statement-breakpoint
-- No overlapping time for a worker (open entries extend to infinity).
ALTER TABLE "work_entries" ADD CONSTRAINT "work_entries_no_overlap"
  EXCLUDE USING gist (
    "worker_id" WITH =,
    tstzrange("start_at", coalesce("end_at", 'infinity'::timestamptz), '[)') WITH &&
  ) WHERE ("status" <> 'void');
--> statement-breakpoint
-- Defence in depth for approval locking: entries of an approved timesheet cannot change.
CREATE OR REPLACE FUNCTION forbid_change_when_approved() RETURNS trigger AS $$
DECLARE ts_status text;
BEGIN
  SELECT status INTO ts_status FROM timesheets WHERE id = COALESCE(OLD.timesheet_id, NEW.timesheet_id);
  IF ts_status = 'approved' THEN
    RAISE EXCEPTION 'timesheet_locked' USING ERRCODE = 'P0001';
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.timesheet_id <> OLD.timesheet_id THEN
    SELECT status INTO ts_status FROM timesheets WHERE id = NEW.timesheet_id;
    IF ts_status = 'approved' THEN
      RAISE EXCEPTION 'timesheet_locked' USING ERRCODE = 'P0001';
    END IF;
  END IF;
  RETURN COALESCE(NEW, OLD);
END $$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER work_entries_locked
  BEFORE INSERT OR UPDATE OR DELETE ON "work_entries"
  FOR EACH ROW EXECUTE FUNCTION forbid_change_when_approved();
--> statement-breakpoint
-- Approved versions are immutable.
CREATE OR REPLACE FUNCTION forbid_approved_version_change() RETURNS trigger AS $$
BEGIN
  IF OLD.approved_at IS NOT NULL THEN
    RAISE EXCEPTION 'version_locked' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER timesheet_versions_locked
  BEFORE UPDATE OR DELETE ON "timesheet_versions"
  FOR EACH ROW EXECUTE FUNCTION forbid_approved_version_change();
--> statement-breakpoint
-- Audit, revision and export history are append-only.
CREATE OR REPLACE FUNCTION forbid_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'append_only' USING ERRCODE = 'P0001';
END $$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER audit_log_append_only BEFORE UPDATE OR DELETE ON "audit_log"
  FOR EACH ROW EXECUTE FUNCTION forbid_mutation();
--> statement-breakpoint
CREATE TRIGGER entry_revisions_append_only BEFORE UPDATE OR DELETE ON "entry_revisions"
  FOR EACH ROW EXECUTE FUNCTION forbid_mutation();
--> statement-breakpoint
CREATE TRIGGER exports_append_only BEFORE UPDATE OR DELETE ON "exports"
  FOR EACH ROW EXECUTE FUNCTION forbid_mutation();
