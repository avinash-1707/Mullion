-- Custom SQL migration file, put your code below! --

-- Data-only backfill, no DDL (ADR-66). requireEmailVerification turns on
-- with this release: every credential account created before it has
-- email_verified = false and would be locked out of sign-in. Pre-existing
-- users are pre-launch accounts, so grandfather them wholesale instead of
-- forcing an OTP round on next login.
--
-- ASSUMPTION (verified at write time, 2026-07-12): every pre-existing row is
-- a trusted internal/dev account. Blanket-verifying an ATTACKER-created,
-- never-verified credential row would let a later OAuth sign-in with that
-- email implicitly link into it — do NOT re-run this pattern post-launch;
-- scope any future backfill to rows with a completed session instead.
UPDATE "user" SET "email_verified" = true WHERE "email_verified" = false;
