-- Agrega la columna carrera (texto) a la tabla candidates para que el perfil pueda guardar la carrera universitaria.
-- Ejecutar con: psql $DATABASE_URL -f migrations/001_add_carrera_to_candidates.sql
ALTER TABLE public.candidates ADD COLUMN IF NOT EXISTS carrera TEXT;
