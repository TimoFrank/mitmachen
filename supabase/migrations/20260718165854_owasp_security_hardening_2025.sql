begin;

-- The original broad transition draft was never applied to the linked project.
-- Its confirmed function, privilege, search_path and protected-storage changes
-- are implemented idempotently by the later reconciliation migration. Keeping
-- this version as an explicit no-op lets migration history be repaired without
-- changing login aliases, application triggers or unrelated business RLS.

commit;
