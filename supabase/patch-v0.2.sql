-- ============================================================
-- PATCH v0.1 → v0.2 — à exécuter UNE FOIS dans le SQL Editor si
-- schema.sql v0.1 est déjà installé. Sans danger si relancé.
-- Ajoute : e-mail dans les profils, taille du fichier HTML, réglages
-- de l'accueil modifiables depuis l'administration.
-- ============================================================

-- 1. E-mail dans les profils (pour retrouver un client dans l'admin)
alter table profiles add column if not exists email text;
update profiles p set email = lower(u.email) from auth.users u where u.id = p.id and p.email is null;

create or replace function handle_new_user()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_phone text := nullif(left(trim(coalesce(new.raw_user_meta_data ->> 'phone', '')), 20), '');
begin
  if v_phone is not null and v_phone !~ '^[0-9+ ]{6,20}$' then
    v_phone := null;
  end if;
  insert into profiles (id, email, full_name, phone)
  values (new.id, lower(new.email), left(trim(coalesce(new.raw_user_meta_data ->> 'full_name', '')), 120), v_phone);
  return new;
end $$;

create or replace function sync_profile_email()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  update profiles set email = lower(new.email) where id = new.id;
  return new;
end $$;

drop trigger if exists on_auth_user_email_changed on auth.users;
create trigger on_auth_user_email_changed
  after update of email on auth.users
  for each row when (old.email is distinct from new.email)
  execute function sync_profile_email();

-- 2. Taille du fichier HTML (affichée dans l'admin sans le télécharger)
alter table tool_assets add column if not exists html_size integer
  generated always as (octet_length(html_content)) stored;

-- 3. Réglages de l'accueil (textes et sections affichées)
insert into site_settings (key, value) values
  ('hero_title', 'Des outils numériques simples, pour gérer votre activité.'),
  ('hero_lead', 'Retrouvez au même endroit des applications prêtes à l''emploi pour les indépendants, les entrepreneurs et les petites entreprises.'),
  ('footer_text', 'Des outils numériques pensés pour les indépendants, les entrepreneurs et les petites entreprises.'),
  ('show_categories', 'true'),
  ('show_steps', 'true')
on conflict (key) do nothing;

-- 4. Le droit d'exécution sur les nouvelles fonctions n'est pas nécessaire :
--    ce sont des fonctions de déclenchement internes.

-- ============================================================
-- Premier administrateur (si pas encore fait) :
--   update profiles set role = 'admin'
--   where id = (select id from auth.users where email = 'ton-email@exemple.com');
-- ============================================================
