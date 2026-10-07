-- ============================================================
-- PLATEFORME D'OUTILS NUMÉRIQUES — SCHÉMA SUPABASE v0.2
-- ------------------------------------------------------------
-- À exécuter dans Supabase → SQL Editor, sur un NOUVEAU projet
-- (séparé de TR Academy). Prévu pour un projet vierge : ce n'est
-- pas un script de migration.
--
-- Principes :
--  1. Le navigateur ne décide JAMAIS d'un prix, d'un statut de
--     paiement ou d'un accès : tout passe par des fonctions
--     serveur qui vérifient l'utilisateur.
--  2. Les contenus des outils (tool_assets) ne sont lisibles que
--     par un admin, ou via get_tool_payload() après contrôle de
--     l'autorisation.
--  3. Un admin n'est reconnu que si son compte a le rôle 'admin'
--     ET si sa session est en double authentification (aal2).
-- ============================================================

-- ------------------------------------------------------------
-- 0. Utilitaires
-- ------------------------------------------------------------
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- ------------------------------------------------------------
-- 1. PROFILS (1 ligne par compte Supabase Auth)
-- ------------------------------------------------------------
create table profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  email      text,   -- copie de l'e-mail du compte, lisible seulement par le titulaire et l'admin
  full_name  text not null default '' check (char_length(full_name) <= 120),
  phone      text check (phone is null or phone ~ '^[0-9+ ]{6,20}$'),
  role       text not null default 'client' check (role in ('client', 'admin')),
  status     text not null default 'active' check (status in ('active', 'suspended')),
  created_at timestamptz not null default now()
);

-- Création automatique du profil à l'inscription. Le rôle n'est
-- JAMAIS lu depuis les métadonnées envoyées par le navigateur.
create or replace function handle_new_user()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_phone text := nullif(left(trim(coalesce(new.raw_user_meta_data ->> 'phone', '')), 20), '');
begin
  if v_phone is not null and v_phone !~ '^[0-9+ ]{6,20}$' then
    v_phone := null;  -- numéro mal formé : on n'empêche pas l'inscription
  end if;
  insert into profiles (id, email, full_name, phone)
  values (new.id, lower(new.email), left(trim(coalesce(new.raw_user_meta_data ->> 'full_name', '')), 120), v_phone);
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- Garde la copie de l'e-mail à jour si le compte change d'adresse.
create or replace function sync_profile_email()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  update profiles set email = lower(new.email) where id = new.id;
  return new;
end $$;

create trigger on_auth_user_email_changed
  after update of email on auth.users
  for each row when (old.email is distinct from new.email)
  execute function sync_profile_email();

-- Est-ce un admin réel ? Rôle 'admin' + compte actif + session 2FA (aal2).
create or replace function is_admin()
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce((auth.jwt() ->> 'aal') = 'aal2', false)
     and exists (
       select 1 from profiles p
       where p.id = auth.uid() and p.role = 'admin' and p.status = 'active'
     );
$$;

-- ------------------------------------------------------------
-- 2. CATALOGUE (informations COMMERCIALES, publiques)
-- ------------------------------------------------------------
create table categories (
  id            uuid primary key default gen_random_uuid(),
  slug          text unique not null check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name          text not null,
  description   text,
  display_order integer not null default 0,
  is_published  boolean not null default true,
  created_at    timestamptz not null default now()
);

create table tools (
  id                   uuid primary key default gen_random_uuid(),
  slug                 text unique not null check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name                 text not null,
  short_description    text not null default '',
  long_description     text,
  category_id          uuid references categories(id) on delete set null,
  image_url            text check (image_url is null or image_url ~ '^https://'),
  problems_solved      jsonb not null default '[]' check (jsonb_typeof(problems_solved) = 'array'),
  features             jsonb not null default '[]' check (jsonb_typeof(features) = 'array'),
  price_amount         integer not null default 0 check (price_amount >= 0),  -- en Ariary, 0 = gratuit
  currency             text not null default 'MGA',
  access_duration_days integer check (access_duration_days is null or access_duration_days > 0), -- null = permanent
  status               text not null default 'draft'
                         check (status in ('draft', 'available', 'coming_soon', 'unavailable')),
  display_order        integer not null default 0,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
create index tools_category_idx on tools (category_id);
create trigger tools_updated before update on tools
  for each row execute function set_updated_at();

-- ------------------------------------------------------------
-- 3. DISTRIBUTION (séparée de la fiche commerciale, PRIVÉE)
-- ------------------------------------------------------------
create table tool_assets (
  tool_id           uuid primary key references tools(id) on delete cascade,
  distribution_type text not null check (distribution_type in ('html_standalone', 'external_url')),
  html_content      text check (html_content is null or octet_length(html_content) <= 5000000),
  html_size         integer generated always as (octet_length(html_content)) stored,  -- taille affichée dans l'admin sans télécharger le fichier
  external_url      text check (external_url is null or external_url ~ '^https://'),
  watermark         boolean not null default false,
  updated_at        timestamptz not null default now()
);
create trigger tool_assets_updated before update on tool_assets
  for each row execute function set_updated_at();

-- ------------------------------------------------------------
-- 4. COMMANDES, LIGNES, PAIEMENTS
--    - Une commande créée n'est PAS un paiement confirmé.
--    - payments ne contient que des paiements VÉRIFIÉS par un admin.
--    - "Paiement en attente" = commande 'awaiting_payment' sans paiement.
-- ------------------------------------------------------------
create table orders (
  id           uuid primary key default gen_random_uuid(),
  reference    text unique not null,
  user_id      uuid not null references profiles(id),
  status       text not null default 'awaiting_payment'
                 check (status in ('awaiting_payment', 'paid', 'cancelled')),
  total_amount integer not null check (total_amount >= 0),
  currency     text not null default 'MGA',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index orders_user_idx on orders (user_id);
create trigger orders_updated before update on orders
  for each row execute function set_updated_at();

create table order_items (
  id         uuid primary key default gen_random_uuid(),
  order_id   uuid not null references orders(id) on delete cascade,
  tool_id    uuid not null references tools(id),
  unit_price integer not null check (unit_price >= 0),  -- prix figé au moment de la commande
  unique (order_id, tool_id)
);

create table payments (
  id              uuid primary key default gen_random_uuid(),
  order_id        uuid not null references orders(id),
  method          text not null check (method in ('mvola', 'orange_money', 'airtel_money', 'autre')),
  amount          integer not null check (amount >= 0),
  currency        text not null default 'MGA',
  transaction_ref text,
  note            text,
  confirmed_by    uuid references profiles(id),
  created_at      timestamptz not null default now()
);
-- Une même référence de transaction ne peut valider qu'un seul paiement.
create unique index payments_txref_unique
  on payments (method, upper(trim(transaction_ref))) where transaction_ref is not null;

-- ------------------------------------------------------------
-- 5. AUTORISATIONS D'ACCÈS (qui peut utiliser quel outil)
--    Une ligne par (utilisateur, outil). L'état affiché (actif,
--    expiré, pas encore actif, révoqué) est calculé, jamais saisi.
-- ------------------------------------------------------------
create table entitlements (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references profiles(id) on delete cascade,
  tool_id    uuid not null references tools(id),
  source     text not null check (source in ('purchase', 'free', 'manual')),
  order_id   uuid references orders(id) on delete set null,
  status     text not null default 'active' check (status in ('active', 'revoked')),
  starts_at  timestamptz not null default now(),
  expires_at timestamptz,
  granted_by uuid references profiles(id),
  note       text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, tool_id),
  check (expires_at is null or expires_at > starts_at)
);
create trigger entitlements_updated before update on entitlements
  for each row execute function set_updated_at();

-- ------------------------------------------------------------
-- 6. CONTACT, RÉGLAGES, AUDIT, LIMITEUR
-- ------------------------------------------------------------
create table contact_messages (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid references profiles(id) on delete set null,
  name       text not null,
  email      text not null,
  subject    text not null,
  message    text not null,
  status     text not null default 'new' check (status in ('new', 'read', 'archived')),
  created_at timestamptz not null default now()
);

-- Réglages PUBLICS uniquement (nom du site, numéro WhatsApp, consignes de
-- paiement). Ne jamais y stocker de secret.
create table site_settings (
  key        text primary key,
  value      text not null default '',
  updated_at timestamptz not null default now()
);
insert into site_settings (key, value) values
  ('site_name', 'À définir'),
  ('hero_title', 'Des outils numériques simples, pour gérer votre activité.'),
  ('hero_lead', 'Retrouvez au même endroit des applications prêtes à l''emploi pour les indépendants, les entrepreneurs et les petites entreprises.'),
  ('footer_text', 'Des outils numériques pensés pour les indépendants, les entrepreneurs et les petites entreprises.'),
  ('show_categories', 'true'),
  ('show_steps', 'true'),
  ('whatsapp_number', ''),
  ('contact_email', ''),
  ('payment_instructions', '');

create table audit_log (
  id         bigint generated always as identity primary key,
  actor_id   uuid,
  action     text not null,
  target     text,
  details    jsonb,
  created_at timestamptz not null default now()
);

create table rate_limits (
  id  bigint generated always as identity primary key,
  key text not null,
  at  timestamptz not null default now()
);
create index rate_limits_key_idx on rate_limits (key, at);

-- Catégories de départ (modifiables ensuite depuis l'admin)
insert into categories (slug, name, display_order) values
  ('gestion-activite', 'Gestion d''activité', 0),
  ('entrepreneuriat-pme', 'Entrepreneuriat & PME', 1),
  ('productivite', 'Productivité', 2),
  ('creation-contenu', 'Création de contenu', 3),
  ('autres', 'Autres', 9);

-- ============================================================
-- 7. FONCTIONS INTERNES (non appelables depuis le navigateur)
-- ============================================================
create or replace function check_rate_limit(p_key text, p_max integer, p_window interval)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare v_n integer;
begin
  if random() < 0.02 then
    delete from rate_limits where at < now() - interval '1 day';
  end if;
  select count(*) into v_n from rate_limits where key = p_key and at > now() - p_window;
  if v_n >= p_max then
    raise exception 'RATE_LIMITED';
  end if;
  insert into rate_limits (key) values (p_key);
end $$;

create or replace function log_audit(p_action text, p_target text, p_details jsonb default null)
returns void language sql security definer set search_path = public, pg_temp as $$
  insert into audit_log (actor_id, action, target, details) values (auth.uid(), p_action, p_target, p_details);
$$;

-- Filigrane (nom + téléphone) injecté dans le HTML AVANT sa sortie de la base.
-- Dissuasif seulement : il n'empêche pas de copier un fichier livré au navigateur.
create or replace function build_watermark(p_html text, p_label text)
returns text language plpgsql immutable set search_path = public, pg_temp as $$
declare
  v_label text;
  v_block text;
  v_pos   integer;
begin
  if p_html is null then return null; end if;
  -- JSON échappé, '<' et '>' neutralisés pour ne jamais fermer la balise <script>
  v_label := replace(replace(to_json(coalesce(p_label, ''))::text, '<', '\u003c'), '>', '\u003e');
  v_block := $wm$<style>.pf-wm{position:fixed;inset:0;pointer-events:none;z-index:2147483647;overflow:hidden}.pf-wm span{position:absolute;white-space:nowrap;user-select:none;font:300 12px system-ui,sans-serif;color:rgba(128,128,128,.16);transform:rotate(-28deg)}</style><div class="pf-wm" id="pfWm" aria-hidden="true"></div><script>(function(){var l=document.getElementById('pfWm');if(!l)return;var t=$wm$
             || v_label ||
             $wm$;[[5,5],[5,55],[28,25],[28,75],[51,5],[51,55],[74,25],[74,75]].forEach(function(p){var s=document.createElement('span');s.textContent=t;s.style.top=p[0]+'%';s.style.left=p[1]+'%';l.appendChild(s)})})();</script>$wm$;
  -- insertion avant le DERNIER </body> (minuscules, sinon majuscules, sinon à la fin)
  v_pos := position('>ydob/<' in reverse(p_html));
  if v_pos > 0 then
    v_pos := length(p_html) - v_pos - 5;
    return substr(p_html, 1, v_pos - 1) || v_block || substr(p_html, v_pos);
  end if;
  v_pos := position('>YDOB/<' in reverse(p_html));
  if v_pos > 0 then
    v_pos := length(p_html) - v_pos - 5;
    return substr(p_html, 1, v_pos - 1) || v_block || substr(p_html, v_pos);
  end if;
  return p_html || v_block;
end $$;

-- ============================================================
-- 8. FONCTIONS CLIENT (utilisateur connecté)
--    Les erreurs sont des codes courts à traduire dans l'interface :
--    NOT_AUTHENTICATED, ACCOUNT_SUSPENDED, RATE_LIMITED, INVALID_CART,
--    TOOL_NOT_PURCHASABLE, TOOL_NOT_FREE, ALREADY_OWNED, TOO_MANY_PENDING,
--    ACCESS_DENIED, ACCESS_REVOKED, ACCESS_NOT_STARTED, ACCESS_EXPIRED,
--    TOOL_UNAVAILABLE
-- ============================================================

-- Crée une commande à partir d'une liste d'outils. Les PRIX viennent de la
-- table tools, jamais du navigateur. Retourne la référence (ex. CMD-7F3K9A2B)
-- que le client indique dans son message de paiement.
create or replace function create_order(p_tool_ids uuid[])
returns text language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid   uuid := auth.uid();
  v_ids   uuid[];
  v_cnt   integer;
  v_total integer;
  v_order uuid;
  v_ref   text;
begin
  if v_uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if not exists (select 1 from profiles where id = v_uid and status = 'active') then
    raise exception 'ACCOUNT_SUSPENDED';
  end if;

  select array_agg(distinct x) into v_ids from unnest(p_tool_ids) x;
  if v_ids is null or cardinality(v_ids) > 20 then raise exception 'INVALID_CART'; end if;

  perform check_rate_limit('order:' || v_uid, 10, interval '1 hour');

  select count(*), coalesce(sum(price_amount), 0) into v_cnt, v_total
  from tools where id = any (v_ids) and status = 'available' and price_amount > 0;
  if v_cnt <> cardinality(v_ids) then raise exception 'TOOL_NOT_PURCHASABLE'; end if;

  if exists (
    select 1 from entitlements e
    where e.user_id = v_uid and e.tool_id = any (v_ids) and e.status = 'active'
      and e.starts_at <= now() and (e.expires_at is null or e.expires_at > now())
  ) then raise exception 'ALREADY_OWNED'; end if;

  if (select count(*) from orders where user_id = v_uid and status = 'awaiting_payment') >= 5 then
    raise exception 'TOO_MANY_PENDING';
  end if;

  loop
    v_ref := 'CMD-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
    begin
      insert into orders (reference, user_id, total_amount) values (v_ref, v_uid, v_total)
      returning id into v_order;
      exit;
    exception when unique_violation then
      null;  -- référence déjà prise : on en génère une autre
    end;
  end loop;

  insert into order_items (order_id, tool_id, unit_price)
  select v_order, t.id, t.price_amount from tools t where t.id = any (v_ids);

  return v_ref;
end $$;

-- Obtient un outil GRATUIT (prix = 0) sans commande.
create or replace function claim_free_tool(p_tool_id uuid)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid  uuid := auth.uid();
  v_days integer;
  v_exp  timestamptz;
  v_st   text;
begin
  if v_uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if not exists (select 1 from profiles where id = v_uid and status = 'active') then
    raise exception 'ACCOUNT_SUSPENDED';
  end if;
  perform check_rate_limit('claim:' || v_uid, 30, interval '1 hour');

  select access_duration_days into v_days
  from tools where id = p_tool_id and status = 'available' and price_amount = 0;
  if not found then raise exception 'TOOL_NOT_FREE'; end if;

  v_exp := case when v_days is null then null else now() + make_interval(days => v_days) end;

  -- Une autorisation révoquée par un admin n'est jamais rétablie par ce biais.
  insert into entitlements (user_id, tool_id, source, starts_at, expires_at)
  values (v_uid, p_tool_id, 'free', now(), v_exp)
  on conflict (user_id, tool_id) do update
    set source = 'free', starts_at = now(), expires_at = excluded.expires_at
    where entitlements.status = 'active'
      and entitlements.expires_at is not null and entitlements.expires_at <= now();

  select status into v_st from entitlements where user_id = v_uid and tool_id = p_tool_id;
  if v_st = 'revoked' then raise exception 'ACCESS_REVOKED'; end if;
end $$;

-- Liste des outils du client avec l'état de son accès (calculé côté serveur).
create or replace function my_tools()
returns table (
  tool_id uuid, slug text, name text, short_description text, image_url text,
  tool_status text, distribution_type text, source text,
  starts_at timestamptz, expires_at timestamptz, access_state text
)
language sql stable security definer set search_path = public, pg_temp as $$
  select t.id, t.slug, t.name, t.short_description, t.image_url,
         t.status, ta.distribution_type, e.source, e.starts_at, e.expires_at,
         case
           when e.status = 'revoked' then 'revoked'
           when e.starts_at > now() then 'not_started'
           when e.expires_at is not null and e.expires_at <= now() then 'expired'
           else 'active'
         end
  from entitlements e
  join tools t on t.id = e.tool_id
  left join tool_assets ta on ta.tool_id = t.id
  where e.user_id = auth.uid()
  order by e.created_at desc;
$$;

-- Ouvre un outil : vérifie l'autorisation puis renvoie le HTML (filigrané si
-- demandé) ou l'URL externe. C'est le SEUL chemin d'accès au contenu pour un client.
create or replace function get_tool_payload(p_tool_id uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid   uuid := auth.uid();
  v_prof  profiles%rowtype;
  v_ent   entitlements%rowtype;
  v_tool  tools%rowtype;
  v_asset tool_assets%rowtype;
  v_html  text;
begin
  if v_uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  select * into v_prof from profiles where id = v_uid;
  if not found or v_prof.status <> 'active' then raise exception 'ACCOUNT_SUSPENDED'; end if;

  perform check_rate_limit('launch:' || v_uid, 30, interval '10 minutes');

  select * into v_ent from entitlements where user_id = v_uid and tool_id = p_tool_id;
  if not found then raise exception 'ACCESS_DENIED'; end if;
  if v_ent.status = 'revoked' then raise exception 'ACCESS_REVOKED'; end if;
  if v_ent.starts_at > now() then raise exception 'ACCESS_NOT_STARTED'; end if;
  if v_ent.expires_at is not null and v_ent.expires_at <= now() then raise exception 'ACCESS_EXPIRED'; end if;

  select * into v_tool from tools where id = p_tool_id;
  if not found or v_tool.status <> 'available' then raise exception 'TOOL_UNAVAILABLE'; end if;

  select * into v_asset from tool_assets where tool_id = p_tool_id;
  if not found then raise exception 'TOOL_UNAVAILABLE'; end if;

  if v_asset.distribution_type = 'external_url' then
    if v_asset.external_url is null then raise exception 'TOOL_UNAVAILABLE'; end if;
    return jsonb_build_object('type', 'external_url', 'name', v_tool.name, 'url', v_asset.external_url);
  end if;

  if v_asset.html_content is null then raise exception 'TOOL_UNAVAILABLE'; end if;
  v_html := v_asset.html_content;
  if v_asset.watermark then
    v_html := build_watermark(
      v_html,
      trim(both ' ·' from coalesce(nullif(v_prof.full_name, ''), '') || ' · ' || coalesce(v_prof.phone, ''))
    );
  end if;
  return jsonb_build_object('type', 'html_standalone', 'name', v_tool.name, 'html', v_html);
end $$;

-- Formulaire de contact (visiteurs connectés ou non). Le message est ENREGISTRÉ ;
-- la notification par e-mail à l'admin n'est pas incluse dans cette version.
create or replace function submit_contact_message(
  p_name text, p_email text, p_subject text, p_message text, p_hp text default ''
) returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if coalesce(p_hp, '') <> '' then raise exception 'SPAM_DETECTED'; end if;  -- champ piège anti-robot
  p_name := trim(coalesce(p_name, ''));
  p_email := lower(trim(coalesce(p_email, '')));
  p_subject := trim(coalesce(p_subject, ''));
  p_message := trim(coalesce(p_message, ''));
  if char_length(p_name) not between 1 and 120
     or char_length(p_email) > 254 or p_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'
     or char_length(p_subject) not between 1 and 200
     or char_length(p_message) not between 10 and 5000 then
    raise exception 'INVALID_INPUT';
  end if;
  perform check_rate_limit('contact:global', 60, interval '1 hour');
  perform check_rate_limit('contact:' || p_email, 3, interval '1 hour');
  insert into contact_messages (user_id, name, email, subject, message)
  values (auth.uid(), p_name, p_email, p_subject, p_message);
end $$;

-- ============================================================
-- 9. FONCTIONS ADMIN (rôle admin + session 2FA exigés dans chacune)
-- ============================================================

-- Confirme qu'un paiement a été REÇU (vérifié par l'admin sur son compte
-- Mobile Money) : enregistre le paiement, passe la commande à 'paid' et crée
-- les autorisations d'accès.
create or replace function admin_confirm_payment(
  p_order_id uuid, p_method text, p_transaction_ref text default null, p_note text default null
) returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare v_order orders%rowtype;
begin
  if not is_admin() then raise exception 'FORBIDDEN'; end if;
  select * into v_order from orders where id = p_order_id for update;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;
  if v_order.status <> 'awaiting_payment' then raise exception 'ORDER_NOT_PAYABLE'; end if;

  insert into payments (order_id, method, amount, currency, transaction_ref, note, confirmed_by)
  values (p_order_id, p_method, v_order.total_amount, v_order.currency,
          nullif(trim(p_transaction_ref), ''), p_note, auth.uid());

  update orders set status = 'paid' where id = p_order_id;

  insert into entitlements (user_id, tool_id, source, order_id, status, starts_at, expires_at, granted_by)
  select v_order.user_id, oi.tool_id, 'purchase', p_order_id, 'active', now(),
         case when t.access_duration_days is null then null
              else now() + make_interval(days => t.access_duration_days) end,
         auth.uid()
  from order_items oi join tools t on t.id = oi.tool_id
  where oi.order_id = p_order_id
  on conflict (user_id, tool_id) do update
    set source = 'purchase', order_id = excluded.order_id, status = 'active',
        starts_at = excluded.starts_at, expires_at = excluded.expires_at,
        granted_by = excluded.granted_by;

  perform log_audit('payment_confirmed', v_order.reference,
    jsonb_build_object('order_id', p_order_id, 'method', p_method, 'transaction_ref', p_transaction_ref));
end $$;

create or replace function admin_cancel_order(p_order_id uuid, p_note text default null)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare v_ref text;
begin
  if not is_admin() then raise exception 'FORBIDDEN'; end if;
  update orders set status = 'cancelled'
  where id = p_order_id and status = 'awaiting_payment' returning reference into v_ref;
  if v_ref is null then raise exception 'ORDER_NOT_PAYABLE'; end if;
  perform log_audit('order_cancelled', v_ref, jsonb_build_object('note', p_note));
end $$;

create or replace function admin_grant_access(
  p_user_id uuid, p_tool_id uuid, p_expires_at timestamptz default null, p_note text default null
) returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not is_admin() then raise exception 'FORBIDDEN'; end if;
  insert into entitlements (user_id, tool_id, source, status, starts_at, expires_at, granted_by, note)
  values (p_user_id, p_tool_id, 'manual', 'active', now(), p_expires_at, auth.uid(), p_note)
  on conflict (user_id, tool_id) do update
    set source = 'manual', status = 'active', starts_at = now(),
        expires_at = excluded.expires_at, granted_by = excluded.granted_by, note = excluded.note;
  perform log_audit('access_granted', p_user_id::text,
    jsonb_build_object('tool_id', p_tool_id, 'expires_at', p_expires_at));
end $$;

create or replace function admin_revoke_access(p_entitlement_id uuid)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not is_admin() then raise exception 'FORBIDDEN'; end if;
  update entitlements set status = 'revoked' where id = p_entitlement_id;
  if not found then raise exception 'NOT_FOUND'; end if;
  perform log_audit('access_revoked', p_entitlement_id::text, null);
end $$;

create or replace function admin_set_account_status(p_user_id uuid, p_status text)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not is_admin() then raise exception 'FORBIDDEN'; end if;
  if p_status not in ('active', 'suspended') then raise exception 'INVALID_INPUT'; end if;
  if p_user_id = auth.uid() then raise exception 'INVALID_INPUT'; end if;
  update profiles set status = p_status where id = p_user_id;
  perform log_audit('account_' || p_status, p_user_id::text, null);
end $$;

-- ============================================================
-- 10. SÉCURITÉ D'ACCÈS (RLS + droits)
--     Supabase accorde par défaut tous les droits aux rôles anon et
--     authenticated : on les retire d'abord, puis on n'accorde que
--     le nécessaire.
-- ============================================================
revoke all on all tables    in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke all on all functions in schema public from public, anon, authenticated;

alter table profiles         enable row level security;
alter table categories       enable row level security;
alter table tools            enable row level security;
alter table tool_assets      enable row level security;
alter table orders           enable row level security;
alter table order_items      enable row level security;
alter table payments         enable row level security;
alter table entitlements     enable row level security;
alter table contact_messages enable row level security;
alter table site_settings    enable row level security;
alter table audit_log        enable row level security;
alter table rate_limits      enable row level security;  -- aucune policy : inaccessible depuis l'API

-- Fonctions appelables
grant execute on function is_admin()                                  to anon, authenticated;
grant execute on function submit_contact_message(text, text, text, text, text) to anon, authenticated;
grant execute on function create_order(uuid[])                        to authenticated;
grant execute on function claim_free_tool(uuid)                       to authenticated;
grant execute on function my_tools()                                  to authenticated;
grant execute on function get_tool_payload(uuid)                      to authenticated;
grant execute on function admin_confirm_payment(uuid, text, text, text) to authenticated;
grant execute on function admin_cancel_order(uuid, text)              to authenticated;
grant execute on function admin_grant_access(uuid, uuid, timestamptz, text) to authenticated;
grant execute on function admin_revoke_access(uuid)                   to authenticated;
grant execute on function admin_set_account_status(uuid, text)        to authenticated;

-- profiles : chacun lit/modifie son profil, et SEULEMENT nom + téléphone
-- (pas le rôle, pas le statut).
grant select on profiles to authenticated;
grant update (full_name, phone) on profiles to authenticated;
create policy profiles_select on profiles for select to authenticated
  using (id = auth.uid() or is_admin());
create policy profiles_update_own on profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- catalogue public (lecture), écriture admin
grant select on categories, tools to anon, authenticated;
grant insert, update, delete on categories to authenticated;
grant insert, update on tools to authenticated;  -- pas de suppression : on archive (statut)
create policy categories_read on categories for select to anon, authenticated
  using (is_published or is_admin());
create policy categories_admin_write on categories for all to authenticated
  using (is_admin()) with check (is_admin());
create policy tools_read on tools for select to anon, authenticated
  using (status <> 'draft' or is_admin());
create policy tools_admin_insert on tools for insert to authenticated with check (is_admin());
create policy tools_admin_update on tools for update to authenticated
  using (is_admin()) with check (is_admin());

-- contenu des outils : ADMIN SEULEMENT (aucun droit pour anon)
grant select, insert, update, delete on tool_assets to authenticated;
create policy tool_assets_admin on tool_assets for all to authenticated
  using (is_admin()) with check (is_admin());

-- commandes, lignes, paiements, autorisations : lecture de SES données,
-- AUCUNE écriture directe (tout passe par les fonctions)
grant select on orders, order_items, payments, entitlements to authenticated;
create policy orders_select on orders for select to authenticated
  using (user_id = auth.uid() or is_admin());
create policy order_items_select on order_items for select to authenticated
  using (exists (select 1 from orders o where o.id = order_id and (o.user_id = auth.uid() or is_admin())));
create policy payments_select on payments for select to authenticated
  using (exists (select 1 from orders o where o.id = order_id and (o.user_id = auth.uid() or is_admin())));
create policy entitlements_select on entitlements for select to authenticated
  using (user_id = auth.uid() or is_admin());

-- messages de contact : lecture/archivage par l'admin (insertion via la fonction)
grant select on contact_messages to authenticated;
grant update (status) on contact_messages to authenticated;
create policy contact_admin_select on contact_messages for select to authenticated using (is_admin());
create policy contact_admin_update on contact_messages for update to authenticated
  using (is_admin()) with check (is_admin());

-- réglages publics
grant select on site_settings to anon, authenticated;
grant insert, update on site_settings to authenticated;
create policy settings_read on site_settings for select to anon, authenticated using (true);
create policy settings_admin_insert on site_settings for insert to authenticated with check (is_admin());
create policy settings_admin_update on site_settings for update to authenticated
  using (is_admin()) with check (is_admin());

-- journal d'audit : lecture admin
grant select on audit_log to authenticated;
create policy audit_admin_select on audit_log for select to authenticated using (is_admin());

-- ============================================================
-- 11. ÉTAPE MANUELLE : créer le premier administrateur
-- ------------------------------------------------------------
-- 1. Créer le compte (Authentication → Users → Add user).
-- 2. Dans le SQL Editor, remplacer l'e-mail puis exécuter :
--
--    update profiles set role = 'admin'
--    where id = (select id from auth.users where email = 'ton-email@exemple.com');
--
-- 3. Se connecter, activer la double authentification (TOTP). Tant que
--    la session n'est pas en aal2, AUCUNE fonction admin ne fonctionne.
-- ============================================================
