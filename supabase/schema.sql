create extension if not exists pg_trgm;

drop view if exists public.vw_prestaciones_comparador;
drop function if exists public.aumentar_precios_prestador(text,numeric);
drop table if exists public.prestaciones;

create table public.prestaciones (
  id bigserial primary key,
  prestador text not null,
  ambito text,
  vigencia text,
  codigo text not null,
  descripcion text not null,
  precio numeric(14,2) not null check (precio >= 0),
  moneda text not null default 'ARS',
  archivo_origen text,
  precio_actualizado_en timestamptz default now(),
  created_at timestamptz default now(),
  search_text text generated always as (lower(coalesce(codigo,'') || ' ' || coalesce(descripcion,'') || ' ' || coalesce(prestador,'') || ' ' || coalesce(ambito,''))) stored
);

create index prestaciones_prestador_idx on public.prestaciones (prestador);
create index prestaciones_codigo_idx on public.prestaciones (codigo);
create index prestaciones_precio_idx on public.prestaciones (precio);
create index prestaciones_archivo_idx on public.prestaciones (archivo_origen);
create index prestaciones_descripcion_trgm_idx on public.prestaciones using gin (descripcion gin_trgm_ops);
create index prestaciones_search_trgm_idx on public.prestaciones using gin (search_text gin_trgm_ops);

create or replace view public.vw_prestaciones_comparador as
select
  p.*,
  min(precio) over (partition by codigo) as precio_minimo_codigo,
  case when precio = min(precio) over (partition by codigo) then true else false end as es_mas_barato_codigo,
  count(*) over (partition by codigo) as cantidad_opciones_codigo
from public.prestaciones p;

create or replace function public.aumentar_precios_prestador(p_prestador text, p_porcentaje numeric)
returns integer
language plpgsql
as $$
declare v_afectadas integer;
begin
  if p_prestador is null or length(trim(p_prestador)) = 0 then raise exception 'Debe indicar un prestador'; end if;
  if p_porcentaje is null then raise exception 'Debe indicar un porcentaje'; end if;
  update public.prestaciones
  set precio = round(precio * (1 + (p_porcentaje / 100.0)), 2), precio_actualizado_en = now()
  where prestador = p_prestador;
  get diagnostics v_afectadas = row_count;
  return v_afectadas;
end;
$$;

alter table public.prestaciones enable row level security;
create policy "lectura_publica_prestaciones" on public.prestaciones for select to anon, authenticated using (true);
create policy "actualizacion_publica_mvp_prestaciones" on public.prestaciones for update to anon, authenticated using (true) with check (true);
grant usage on schema public to anon, authenticated;
grant select, update on public.prestaciones to anon, authenticated;
grant select on public.vw_prestaciones_comparador to anon, authenticated;
grant execute on function public.aumentar_precios_prestador(text,numeric) to anon, authenticated;

-- Carga inicial: en Supabase Table Editor > prestaciones > Import data, subir supabase/seed_prestaciones.csv.
-- Alternativa CLI: psql "$DATABASE_URL" -c "\copy public.prestaciones(prestador,ambito,vigencia,codigo,descripcion,precio,moneda,archivo_origen) from 'supabase/seed_prestaciones.csv' with csv header"
