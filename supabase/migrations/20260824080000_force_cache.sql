-- Force cache refresh by DDL
CREATE TABLE IF NOT EXISTS _force_cache (id uuid PRIMARY KEY);
DROP TABLE _force_cache;
NOTIFY pgrst, 'reload schema';
