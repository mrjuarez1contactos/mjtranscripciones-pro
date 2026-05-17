-- ============================================================
-- SUPABASE SETUP - MJ Transcripciones
-- Ejecutar este SQL en el SQL Editor de Supabase
-- ============================================================

-- 1. Tabla de historial de transcripciones
create table if not exists public.transcriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  file_name text not null,
  transcription text default '',
  general_summary text default '',
  business_summary text default '',
  created_at timestamptz default now() not null
);

-- 2. Habilitar Row Level Security
alter table public.transcriptions enable row level security;

-- 3. Políticas RLS (cada usuario solo accede a sus propios datos)
create policy "select_own_transcriptions" on public.transcriptions
  for select using (auth.uid() = user_id);

create policy "insert_own_transcriptions" on public.transcriptions
  for insert with check (auth.uid() = user_id);

create policy "update_own_transcriptions" on public.transcriptions
  for update using (auth.uid() = user_id);

create policy "delete_own_transcriptions" on public.transcriptions
  for delete using (auth.uid() = user_id);

-- ============================================================
-- STORAGE: Bucket "audios" (privado)
-- ============================================================

-- 4. Crear bucket privado para audios
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'audios',
  'audios',
  false,
  104857600,  -- 100 MB máximo por archivo
  array['audio/mpeg', 'audio/mp4', 'audio/m4a', 'audio/wav', 'audio/ogg', 'audio/webm', 'audio/3gpp', 'video/3gpp']
)
on conflict (id) do nothing;

-- 5. Políticas de Storage
-- Los usuarios autenticados pueden subir sus propios archivos
create policy "upload_own_audio" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'audios'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Los usuarios pueden leer sus propios archivos
create policy "read_own_audio" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'audios'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Los usuarios pueden eliminar sus propios archivos
create policy "delete_own_audio" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'audios'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- ============================================================
-- VARIABLES DE ENTORNO NECESARIAS EN VERCEL:
--   SUPABASE_URL          → Project URL de Supabase
--   SUPABASE_SERVICE_KEY  → service_role key (secreta, solo en servidor)
--   GEMINI_API_KEY        → API Key de Google Gemini
--
-- VARIABLES DE ENTORNO NECESARIAS EN EL FRONTEND (Vite):
--   VITE_SUPABASE_URL     → mismo Project URL
--   VITE_SUPABASE_ANON_KEY → anon/public key de Supabase
-- ============================================================
