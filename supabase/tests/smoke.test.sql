-- Humo: pgTAP corre contra la base local con las migraciones aplicadas.
begin;
create extension if not exists pgtap with schema extensions;

select plan(2);

select has_schema('public', 'existe el esquema public');
select ok(
  exists (select 1 from supabase_migrations.schema_migrations),
  'hay al menos una migración aplicada'
);

select * from finish();
rollback;
