// db_init.sql
-- Create database if it does not exist
DO $$
BEGIN
   IF NOT EXISTS (SELECT FROM pg_database WHERE datname = 'EobordTech-POS') THEN
      PERFORM dblink_exec('dbname=postgres', 'CREATE DATABASE "EobordTech-POS"');
   END IF;
END$$;
