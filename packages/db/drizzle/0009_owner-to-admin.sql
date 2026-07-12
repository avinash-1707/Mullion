-- ADR-72: two-role collapse — every "owner" membership becomes "admin".
-- New rows already write "admin" (provisionPersonalOrg + creatorRole), so
-- this only rewrites history; canManage keeps accepting "owner" until this
-- has run everywhere, then the string gets dropped from the set.
UPDATE "member" SET "role" = 'admin' WHERE "role" = 'owner';--> statement-breakpoint
-- Defensive: no invitation should ever have carried "owner", but a stray
-- pre-ADR-72 row would smuggle the retired role back in at accept time.
UPDATE "invitation" SET "role" = 'admin' WHERE "role" = 'owner';
