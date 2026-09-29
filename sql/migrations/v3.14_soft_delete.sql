-- ============================================================
-- v3.14: Soft Delete + Status Buckets + Audit Trail
-- Every user-facing entity gets archive fields instead of hard delete
-- ============================================================

-- ---------- STEP 1: Add soft-delete columns ----------
-- Applied to 12 user-facing tables. All columns nullable.

DO $$
DECLARE
  tbl text;
  tables text[] := ARRAY[
    'users',
    'classes',
    'scheduled_group_classes',
    'bookings',
    'trial_class_bookings',
    'group_class_sessions',
    'group_class_enrollments',
    'rooms',
    'courses',
    'course_modules',
    'teacher_availability',
    'room_bookings'
  ];
BEGIN
  FOREACH tbl IN ARRAY tables LOOP
    EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS deleted_at timestamptz', tbl);
    EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS deleted_by uuid', tbl);
    EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS deletion_reason text', tbl);
    EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS is_deleted boolean GENERATED ALWAYS AS (deleted_at IS NOT NULL) STORED', tbl);
  END LOOP;
END $$;

-- ---------- STEP 2: Partial indexes for fast "active" queries ----------
DO $$
DECLARE
  tbl text;
  tables text[] := ARRAY[
    'users', 'classes', 'scheduled_group_classes', 'bookings',
    'trial_class_bookings', 'group_class_sessions', 'group_class_enrollments',
    'rooms', 'courses', 'course_modules', 'teacher_availability', 'room_bookings'
  ];
BEGIN
  FOREACH tbl IN ARRAY tables LOOP
    EXECUTE format(
      'CREATE INDEX IF NOT EXISTS idx_%s_active ON %I (id) WHERE deleted_at IS NULL',
      tbl, tbl
    );
  END LOOP;
END $$;

-- ---------- STEP 3: Audit table for archive/reactivate events ----------
CREATE TABLE IF NOT EXISTS entity_events (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type   text NOT NULL,
  entity_id     uuid NOT NULL,
  event_type    text NOT NULL,
  event_data    jsonb NOT NULL DEFAULT '{}'::jsonb,
  actor_id      uuid,
  actor_role    text,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_entity_events_entity
  ON entity_events (entity_type, entity_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_entity_events_actor
  ON entity_events (actor_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_entity_events_type_time
  ON entity_events (event_type, created_at DESC);

-- ---------- STEP 4: Ensure `cancelled_at` exists on cancellable entities ----------
ALTER TABLE classes                  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz;
ALTER TABLE scheduled_group_classes  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz;
ALTER TABLE group_class_sessions     ADD COLUMN IF NOT EXISTS cancelled_at timestamptz;
ALTER TABLE bookings                 ADD COLUMN IF NOT EXISTS cancelled_at timestamptz;

-- ---------- STEP 5: Sanity check ----------
-- Confirm columns exist
SELECT
  table_name,
  column_name
FROM information_schema.columns
WHERE table_schema = 'public'
  AND column_name IN ('deleted_at', 'deleted_by', 'deletion_reason', 'is_deleted', 'cancelled_at')
ORDER BY table_name, column_name;
-- Expected: many rows across the 12 tables