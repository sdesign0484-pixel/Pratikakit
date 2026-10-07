-- ============================================================
-- TESTS DE SÉCURITÉ — tout est annulé à la fin (ROLLBACK).
-- À lancer sur un projet de DÉVELOPPEMENT (jamais sur la production).
-- Chaque ligne affiche PASS ou FAIL.
-- ============================================================
\set ON_ERROR_STOP on
\pset format unaligned
\pset tuples_only on
begin;

create schema tst;
grant usage on schema tst to anon, authenticated;
create table tst.results (n serial, name text, ok boolean, detail text);
grant all on tst.results to anon, authenticated;
grant usage on all sequences in schema tst to anon, authenticated;

-- vérifie une condition
create function tst.chk(p_name text, p_cond boolean) returns void language plpgsql as $$
begin insert into tst.results(name, ok) values (p_name, coalesce(p_cond, false)); end $$;
-- vérifie qu'une commande échoue avec un message contenant p_expect
create function tst.throws(p_name text, p_sql text, p_expect text) returns void language plpgsql as $$
begin
  begin
    execute p_sql;
    insert into tst.results(name, ok, detail) values (p_name, false, 'aucune erreur levée');
  exception when others then
    insert into tst.results(name, ok, detail) values (p_name, position(p_expect in sqlerrm) > 0, sqlerrm);
  end;
end $$;
grant execute on all functions in schema tst to anon, authenticated;

-- jeu d'essai (en tant que propriétaire)
insert into auth.users (id, email, raw_user_meta_data) values
 ('00000000-0000-0000-0000-00000000000a', 'alice@test', '{"full_name":"Alice Test","phone":"0340000001"}'),
 ('00000000-0000-0000-0000-00000000000b', 'bob@test',   '{"full_name":"Bob Test","phone":"pas-un-numero","role":"admin"}'),
 ('00000000-0000-0000-0000-0000000000ad', 'admin@test', '{"full_name":"Admin"}');
update profiles set role='admin' where id='00000000-0000-0000-0000-0000000000ad';

insert into tools (id, slug, name, price_amount, status, access_duration_days) values
 ('10000000-0000-0000-0000-000000000001', 'outil-payant',  'Outil payant',  20000, 'available', null),
 ('10000000-0000-0000-0000-000000000002', 'outil-gratuit', 'Outil gratuit', 0,     'available', null),
 ('10000000-0000-0000-0000-000000000003', 'outil-brouillon','Brouillon',    5000,  'draft',     null),
 ('10000000-0000-0000-0000-000000000004', 'outil-externe', 'Outil externe', 10000, 'available', 30),
 ('10000000-0000-0000-0000-000000000005', 'bientot',       'Bientôt',       8000,  'coming_soon', null);
insert into tool_assets (tool_id, distribution_type, html_content, watermark) values
 ('10000000-0000-0000-0000-000000000001', 'html_standalone', '<html><body><h1>SECRET</h1></body></html>', true),
 ('10000000-0000-0000-0000-000000000002', 'html_standalone', '<html><body>gratuit</body></html>', false);
insert into tool_assets (tool_id, distribution_type, external_url) values
 ('10000000-0000-0000-0000-000000000004', 'external_url', 'https://exemple.mg/outil');

-- 0. Profils créés par le trigger ; le rôle des métadonnées est ignoré ; téléphone invalide -> null
select tst.chk('trigger: 3 profils créés', (select count(*) from profiles) = 3);
select tst.chk('trigger: role=admin des métadonnées ignoré', (select role from profiles where id='00000000-0000-0000-0000-00000000000b') = 'client');
select tst.chk('trigger: téléphone mal formé mis à null, inscription OK', (select phone from profiles where id='00000000-0000-0000-0000-00000000000b') is null);

select tst.chk('trigger: e-mail copié dans le profil', (select email from profiles where id='00000000-0000-0000-0000-00000000000a') = 'alice@test');
update auth.users set email = 'Alice2@Test' where id = '00000000-0000-0000-0000-00000000000a';
select tst.chk('e-mail du profil synchronisé (en minuscules) quand le compte change', (select email from profiles where id='00000000-0000-0000-0000-00000000000a') = 'alice2@test');
update auth.users set email = 'alice@test' where id = '00000000-0000-0000-0000-00000000000a';
select tst.chk('html_size calculé par la base', (select html_size from tool_assets where tool_id='10000000-0000-0000-0000-000000000001') = octet_length('<html><body><h1>SECRET</h1></body></html>'));

-- ============ VISITEUR ANONYME ============
set local role anon;
select tst.chk('anon: voit les outils publiés (pas le brouillon)', (select count(*) from tools) = 4);
select tst.chk('anon: ne voit aucun profil (droit refusé)', true);
select tst.throws('anon: ne peut pas lire tool_assets', 'select * from tool_assets', 'permission denied');
select tst.throws('anon: ne peut pas lire profiles', 'select * from profiles', 'permission denied');
select tst.throws('anon: ne peut pas lire orders', 'select * from orders', 'permission denied');
select tst.throws('anon: ne peut pas lire entitlements', 'select * from entitlements', 'permission denied');
select tst.throws('anon: ne peut pas créer de commande', $q$select create_order(array['10000000-0000-0000-0000-000000000001']::uuid[])$q$, 'permission denied');
select tst.throws('anon: ne peut pas ouvrir un outil', $q$select get_tool_payload('10000000-0000-0000-0000-000000000002')$q$, 'permission denied');
select tst.throws('anon: ne peut pas modifier un prix', $q$update tools set price_amount = 0$q$, 'permission denied');
select tst.throws('anon: ne peut pas lire rate_limits', 'select * from rate_limits', 'permission denied');
select tst.throws('anon: ne peut pas appeler admin_confirm_payment', $q$select admin_confirm_payment(gen_random_uuid(), 'mvola')$q$, 'permission denied');
select tst.chk('anon: lit les réglages publics', (select count(*) from site_settings) >= 4);

-- contact (anon)
select set_config('request.jwt.claims', '', true);
select tst.throws('contact: e-mail invalide refusé', $q$select submit_contact_message('Jean','pas-un-email','Sujet','Un message assez long.')$q$, 'INVALID_INPUT');
select tst.throws('contact: message trop court refusé', $q$select submit_contact_message('Jean','jean@test.mg','Sujet','court')$q$, 'INVALID_INPUT');
select tst.throws('contact: champ piège rempli refusé', $q$select submit_contact_message('Bot','bot@test.mg','Sujet','Un message assez long.','http://spam')$q$, 'SPAM_DETECTED');
select submit_contact_message('Jean', 'jean@test.mg', 'Bonjour', 'Un message de test suffisamment long.');
select tst.throws('contact: anon ne peut pas lire les messages', 'select * from contact_messages', 'permission denied');
reset role;
select tst.chk('contact: message enregistré', (select count(*) from contact_messages where email='jean@test.mg') = 1);
select submit_contact_message('Jean', 'jean@test.mg', 'Bonjour 2', 'Un deuxième message suffisamment long.');
select submit_contact_message('Jean', 'jean@test.mg', 'Bonjour 3', 'Un troisième message suffisamment long.');
select tst.throws('contact: 4e message/heure bloqué (limiteur)', $q$select submit_contact_message('Jean','jean@test.mg','Bonjour 4','Un quatrième message suffisamment long.')$q$, 'RATE_LIMITED');

-- ============ ALICE (client connecté, session normale aal1) ============
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","aal":"aal1","role":"authenticated"}', true);
set local role authenticated;
select tst.chk('alice: voit son profil seulement', (select count(*) from profiles) = 1);
select tst.throws('alice: ne peut pas se mettre admin', $q$update profiles set role='admin' where id = auth.uid()$q$, 'permission denied');
select tst.throws('alice: ne peut pas modifier l''e-mail de son profil', $q$update profiles set email='x@y.z' where id = auth.uid()$q$, 'permission denied');
select tst.throws('alice: ne peut pas changer son statut', $q$update profiles set status='active' where id = auth.uid()$q$, 'permission denied');
update profiles set full_name = 'Alice Modifiée' where id = auth.uid();
select tst.chk('alice: peut modifier son nom', (select full_name from profiles where id = auth.uid()) = 'Alice Modifiée');
select tst.chk('alice: tool_assets vide pour elle (RLS)', (select count(*) from tool_assets) = 0);
select tst.throws('alice: ne peut pas insérer une commande "paid" directement', $q$insert into orders (reference, user_id, status, total_amount) values ('X', auth.uid(), 'paid', 0)$q$, 'permission denied');
select tst.throws('alice: ne peut pas s''attribuer un accès', $q$insert into entitlements (user_id, tool_id, source) values (auth.uid(), '10000000-0000-0000-0000-000000000001', 'manual')$q$, 'permission denied');
select tst.throws('alice: ne peut pas insérer un paiement', $q$insert into payments (order_id, method, amount) values (gen_random_uuid(), 'mvola', 0)$q$, 'permission denied');
update tools set price_amount = 1;
select tst.chk('alice: tentative de modifier un prix sans effet (RLS)', (select price_amount from tools where slug='outil-payant') = 20000);
select tst.throws('alice: accès refusé avant achat', $q$select get_tool_payload('10000000-0000-0000-0000-000000000001')$q$, 'ACCESS_DENIED');
select tst.throws('alice: brouillon non achetable', $q$select create_order(array['10000000-0000-0000-0000-000000000003']::uuid[])$q$, 'TOOL_NOT_PURCHASABLE');
select tst.throws('alice: "bientôt disponible" non achetable', $q$select create_order(array['10000000-0000-0000-0000-000000000005']::uuid[])$q$, 'TOOL_NOT_PURCHASABLE');
select tst.throws('alice: outil gratuit non commandable', $q$select create_order(array['10000000-0000-0000-0000-000000000002']::uuid[])$q$, 'TOOL_NOT_PURCHASABLE');
select tst.throws('alice: panier vide refusé', $q$select create_order(array[]::uuid[])$q$, 'INVALID_CART');
select tst.throws('alice: outil payant non "réclamable" gratuitement', $q$select claim_free_tool('10000000-0000-0000-0000-000000000001')$q$, 'TOOL_NOT_FREE');
select tst.throws('alice: ne peut pas appeler admin_confirm_payment', $q$select admin_confirm_payment(gen_random_uuid(), 'mvola')$q$, 'FORBIDDEN');

-- achat : le prix vient de la base
create temp table t_ref (ref text);
grant all on t_ref to authenticated;
insert into t_ref select create_order(array['10000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000004']::uuid[]);
select tst.chk('alice: commande créée, référence CMD-XXXXXXXX', (select ref ~ '^CMD-[0-9A-F]{8}$' from t_ref));
select tst.chk('alice: total calculé par le serveur (30 000)', (select total_amount from orders limit 1) = 30000);
select tst.chk('alice: commande en attente de paiement', (select status from orders limit 1) = 'awaiting_payment');
select tst.chk('alice: aucune autorisation tant que non payé', (select count(*) from entitlements) = 0);
select tst.throws('alice: toujours pas d''accès à l''outil payant', $q$select get_tool_payload('10000000-0000-0000-0000-000000000001')$q$, 'ACCESS_DENIED');
select tst.chk('alice: voit ses lignes de commande', (select count(*) from order_items) = 2);

-- gratuit
select claim_free_tool('10000000-0000-0000-0000-000000000002');
select tst.chk('alice: obtient l''outil gratuit', (select count(*) from my_tools() where access_state='active') = 1);
select tst.chk('alice: reçoit le HTML gratuit', (get_tool_payload('10000000-0000-0000-0000-000000000002') ->> 'html') like '%gratuit%');

-- ============ BOB (autre client) ============
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b","aal":"aal1","role":"authenticated"}', true);
select tst.chk('bob: ne voit pas les commandes d''Alice', (select count(*) from orders) = 0);
select tst.chk('bob: ne voit pas les lignes d''Alice', (select count(*) from order_items) = 0);
select tst.chk('bob: ne voit pas les autorisations d''Alice', (select count(*) from entitlements) = 0);
select tst.chk('bob: ne voit pas le profil d''Alice', (select count(*) from profiles) = 1);
select tst.throws('bob: pas d''accès à l''outil gratuit d''Alice', $q$select get_tool_payload('10000000-0000-0000-0000-000000000002')$q$, 'ACCESS_DENIED');

-- ============ ADMIN SANS 2FA (aal1) ============
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000ad","aal":"aal1","role":"authenticated"}', true);
select tst.chk('admin aal1: is_admin() = faux', not is_admin());
select tst.throws('admin aal1: confirmation de paiement refusée', $q$select admin_confirm_payment((select id from orders limit 1), 'mvola', 'TX1')$q$, 'FORBIDDEN');
select tst.chk('admin aal1: ne lit pas tool_assets', (select count(*) from tool_assets) = 0);
select tst.chk('admin aal1: ne voit pas les commandes', (select count(*) from orders) = 0);
select tst.throws('admin aal1: ne peut pas créer un outil', $q$insert into tools (slug, name) values ('x', 'X')$q$, 'row-level security');

-- ============ ADMIN AVEC 2FA (aal2) ============
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000ad","aal":"aal2","role":"authenticated"}', true);
select tst.chk('admin aal2: is_admin() = vrai', is_admin());
select tst.chk('admin aal2: lit tool_assets', (select count(*) from tool_assets) = 3);
select tst.chk('admin aal2: voit les brouillons', (select count(*) from tools) = 5);
select tst.chk('admin aal2: voit la commande d''Alice', (select count(*) from orders) = 1);
select tst.chk('admin aal2: lit les messages de contact', (select count(*) from contact_messages) = 3);
select tst.throws('admin: méthode de paiement invalide refusée', $q$select admin_confirm_payment((select id from orders limit 1), 'bitcoin', 'TX1')$q$, 'check constraint');
select admin_confirm_payment((select id from orders limit 1), 'mvola', ' tx-123 ', 'vérifié sur MVola');
select tst.chk('admin: commande passée à "paid"', (select status from orders limit 1) = 'paid');
select tst.chk('admin: paiement enregistré avec le bon montant', (select amount from payments limit 1) = 30000);
select tst.chk('admin: 2 autorisations créées (+1 gratuite = 3)', (select count(*) from entitlements) = 3);
select tst.throws('admin: double confirmation impossible', $q$select admin_confirm_payment((select id from orders limit 1), 'mvola', 'TX-AUTRE')$q$, 'ORDER_NOT_PAYABLE');
select tst.chk('admin: durée 30 jours appliquée à l''outil externe', (select expires_at from entitlements where tool_id='10000000-0000-0000-0000-000000000004') between now() + interval '29 days' and now() + interval '31 days');
select tst.chk('admin: journal d''audit alimenté', (select count(*) from audit_log where action='payment_confirmed') = 1);

-- anti-réutilisation d'une référence de transaction : autre commande d'Alice avec la même référence
reset role;
insert into orders (reference, user_id, total_amount) values ('CMD-TEST0001', '00000000-0000-0000-0000-00000000000a', 100);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000ad","aal":"aal2","role":"authenticated"}', true);
set local role authenticated;
select tst.throws('admin: même référence de transaction refusée (anti-doublon)', $q$select admin_confirm_payment((select id from orders where reference='CMD-TEST0001'), 'mvola', 'TX-123')$q$, 'duplicate key');

-- ============ ALICE APRÈS PAIEMENT ============
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","aal":"aal1","role":"authenticated"}', true);
select tst.chk('alice: accès actif sur 3 outils', (select count(*) from my_tools() where access_state='active') = 3);
select tst.chk('alice: HTML payant livré', (get_tool_payload('10000000-0000-0000-0000-000000000001') ->> 'html') like '%SECRET%');
select tst.chk('alice: filigrane injecté avant </body>', (get_tool_payload('10000000-0000-0000-0000-000000000001') ->> 'html') ~ 'pfWm.*Alice Modifiée.*</body>');
update profiles set full_name = '</script><b>x' where id = auth.uid();
select tst.chk('filigrane: un nom piégé ne ferme pas la balise script', position('</script><b>x' in (get_tool_payload('10000000-0000-0000-0000-000000000001') ->> 'html')) = 0);
update profiles set full_name = 'Alice Modifiée' where id = auth.uid();
select tst.chk('alice: URL externe livrée', (get_tool_payload('10000000-0000-0000-0000-000000000004') ->> 'url') = 'https://exemple.mg/outil');
select tst.throws('alice: ne peut déjà plus recommander un outil possédé', $q$select create_order(array['10000000-0000-0000-0000-000000000001']::uuid[])$q$, 'ALREADY_OWNED');
select tst.chk('alice: voit son paiement', (select count(*) from payments) = 1);
select tst.throws('alice: ne peut pas se révoquer/modifier une autorisation', $q$update entitlements set expires_at = null$q$, 'permission denied');

-- ============ BOB toujours bloqué ============
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b","aal":"aal1","role":"authenticated"}', true);
select tst.throws('bob: toujours refusé sur l''outil payant d''Alice', $q$select get_tool_payload('10000000-0000-0000-0000-000000000001')$q$, 'ACCESS_DENIED');

-- ============ RÉVOCATION / EXPIRATION / OUTIL INDISPONIBLE ============
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000ad","aal":"aal2","role":"authenticated"}', true);
select admin_revoke_access((select id from entitlements where tool_id='10000000-0000-0000-0000-000000000001'));
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","aal":"aal1","role":"authenticated"}', true);
select tst.throws('alice: accès révoqué -> ACCESS_REVOKED', $q$select get_tool_payload('10000000-0000-0000-0000-000000000001')$q$, 'ACCESS_REVOKED');
select tst.chk('alice: état "revoked" affiché', (select access_state from my_tools() where slug='outil-payant') = 'revoked');

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000ad","aal":"aal2","role":"authenticated"}', true);
select admin_revoke_access((select id from entitlements where tool_id='10000000-0000-0000-0000-000000000002'));
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","aal":"aal1","role":"authenticated"}', true);
select tst.throws('alice: accès gratuit révoqué non rétabli par claim_free_tool', $q$select claim_free_tool('10000000-0000-0000-0000-000000000002')$q$, 'ACCESS_REVOKED');
reset role;
update entitlements set status = 'active' where tool_id='10000000-0000-0000-0000-000000000002';
update entitlements set starts_at = now() - interval '40 days', expires_at = now() - interval '10 days'
 where tool_id='10000000-0000-0000-0000-000000000004';
update tools set status = 'unavailable' where id = '10000000-0000-0000-0000-000000000002';
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","aal":"aal1","role":"authenticated"}', true);
set local role authenticated;
select tst.throws('alice: accès expiré -> ACCESS_EXPIRED', $q$select get_tool_payload('10000000-0000-0000-0000-000000000004')$q$, 'ACCESS_EXPIRED');
select tst.chk('alice: état "expired" affiché', (select access_state from my_tools() where slug='outil-externe') = 'expired');
select tst.throws('alice: outil indisponible -> TOOL_UNAVAILABLE', $q$select get_tool_payload('10000000-0000-0000-0000-000000000002')$q$, 'TOOL_UNAVAILABLE');

-- ============ COMPTE SUSPENDU ============
reset role;
update profiles set status='suspended' where id='00000000-0000-0000-0000-00000000000a';
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","aal":"aal1","role":"authenticated"}', true);
set local role authenticated;
select tst.throws('alice suspendue: ne peut plus ouvrir d''outil', $q$select get_tool_payload('10000000-0000-0000-0000-000000000002')$q$, 'ACCOUNT_SUSPENDED');
select tst.throws('alice suspendue: ne peut plus commander', $q$select create_order(array['10000000-0000-0000-0000-000000000005']::uuid[])$q$, 'ACCOUNT_SUSPENDED');

-- ============ LIMITEUR DE LANCEMENTS ============
reset role;
update profiles set status='active' where id='00000000-0000-0000-0000-00000000000a';
update tools set status='available' where id = '10000000-0000-0000-0000-000000000002';
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","aal":"aal1","role":"authenticated"}', true);
set local role authenticated;
do $$ begin
  for i in 1..40 loop
    begin perform get_tool_payload('10000000-0000-0000-0000-000000000002'); exception when others then null; end;
  end loop;
end $$;
select tst.throws('limiteur: lancements en rafale bloqués', $q$select get_tool_payload('10000000-0000-0000-0000-000000000002')$q$, 'RATE_LIMITED');

reset role;
select case when ok then 'PASS' else 'FAIL' end || '  ' || name || coalesce('   [' || nullif(detail,'') || ']', '') from tst.results order by n;
select '--- ' || count(*) filter (where ok) || ' réussis, ' || count(*) filter (where not ok) || ' échoués sur ' || count(*) from tst.results;
rollback;
