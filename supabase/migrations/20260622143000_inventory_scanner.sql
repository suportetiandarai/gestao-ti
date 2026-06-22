-- Inventario por leitor de codigo de barras e trilha de auditoria.
alter table public.inventario
  add column if not exists nome text,
  add column if not exists codigo_barras text,
  add column if not exists origem_patrimonio text,
  add column if not exists responsavel text,
  add column if not exists observacoes text,
  add column if not exists status_inventario text,
  add column if not exists ultima_data_inventario timestamptz,
  add column if not exists ultimo_inventario_por uuid references public.profiles(id) on delete set null;

alter table public.inventario
  drop constraint if exists inventario_status_inventario_check;
alter table public.inventario
  add constraint inventario_status_inventario_check
  check (status_inventario is null or status_inventario in ('validado', 'pendente'));

create unique index if not exists inventario_codigo_barras_unique
  on public.inventario (lower(btrim(codigo_barras)))
  where nullif(btrim(codigo_barras), '') is not null;
create unique index if not exists inventario_numero_serie_unique
  on public.inventario (lower(btrim(numero_serie)))
  where nullif(btrim(numero_serie), '') is not null;
create unique index if not exists inventario_patrimonio_unique
  on public.inventario (lower(btrim(patrimonio)))
  where nullif(btrim(patrimonio), '') is not null;

create table if not exists public.inventario_historico (
  id uuid primary key default gen_random_uuid(),
  equipamento_id uuid references public.inventario(id) on delete set null,
  codigo_lido text not null,
  tipo_leitura text not null default 'codigo_barras'
    check (tipo_leitura in ('codigo_barras', 'numero_serie', 'patrimonio', 'identificador', 'manual')),
  status text not null
    check (status in ('encontrado', 'nao_encontrado', 'cadastrado', 'pendente', 'ignorado')),
  acao text not null,
  tecnico_id uuid not null default auth.uid() references public.profiles(id) on delete restrict,
  localizacao text,
  observacao text,
  sessao_id uuid not null,
  created_at timestamptz not null default now()
);

create index if not exists inventario_historico_equipamento_idx
  on public.inventario_historico (equipamento_id, created_at desc);
create index if not exists inventario_historico_tecnico_idx
  on public.inventario_historico (tecnico_id, created_at desc);
create index if not exists inventario_historico_sessao_idx
  on public.inventario_historico (sessao_id, created_at desc);

create or replace function public.buscar_equipamento_inventario(p_codigo text)
returns setof public.inventario
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select i.*
  from public.inventario i
  where nullif(btrim(p_codigo), '') is not null
    and (
      lower(btrim(i.codigo_barras)) = lower(btrim(p_codigo))
      or lower(btrim(i.numero_serie)) = lower(btrim(p_codigo))
      or lower(btrim(i.patrimonio)) = lower(btrim(p_codigo))
      or i.id::text = btrim(p_codigo)
    )
  order by case
    when lower(btrim(i.codigo_barras)) = lower(btrim(p_codigo)) then 1
    when lower(btrim(i.numero_serie)) = lower(btrim(p_codigo)) then 2
    when lower(btrim(i.patrimonio)) = lower(btrim(p_codigo)) then 3
    else 4
  end
  limit 1;
$$;

revoke all on function public.buscar_equipamento_inventario(text) from public, anon;
grant execute on function public.buscar_equipamento_inventario(text) to authenticated;

alter table public.inventario enable row level security;
alter table public.inventario_historico enable row level security;
grant select, insert, update on table public.inventario to authenticated;
grant select, insert on table public.inventario_historico to authenticated;
grant update, delete on table public.inventario_historico to authenticated;
revoke all on table public.inventario, public.inventario_historico from anon;

drop policy if exists authenticated_operational_access on public.inventario;
drop policy if exists inventario_select_authenticated on public.inventario;
drop policy if exists inventario_insert_authenticated on public.inventario;
drop policy if exists inventario_update_authenticated on public.inventario;
drop policy if exists inventario_delete_admin on public.inventario;

create policy inventario_select_authenticated on public.inventario
  for select to authenticated using (true);
create policy inventario_insert_authenticated on public.inventario
  for insert to authenticated
  with check (
    (select private.is_admin())
    or (ultimo_inventario_por is null or ultimo_inventario_por = (select auth.uid()))
  );
create policy inventario_update_authenticated on public.inventario
  for update to authenticated using (true) with check (true);
create policy inventario_delete_admin on public.inventario
  for delete to authenticated using ((select private.is_admin()));

create or replace function private.protect_inventory_update()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if coalesce(current_setting('request.jwt.claim.role', true), '') = 'service_role'
     or private.is_admin() then
    return new;
  end if;

  if new.id is distinct from old.id
     or new.created_at is distinct from old.created_at
     or new.nome is distinct from old.nome
     or new.tipo is distinct from old.tipo
     or new.marca is distinct from old.marca
     or new.modelo is distinct from old.modelo
     or new.numero_serie is distinct from old.numero_serie
     or new.codigo_barras is distinct from old.codigo_barras
     or new.patrimonio is distinct from old.patrimonio
     or new.origem_patrimonio is distinct from old.origem_patrimonio
     or new.predio is distinct from old.predio
     or new.andar is distinct from old.andar
     or new.setor is distinct from old.setor
     or new.responsavel is distinct from old.responsavel
     or new.observacoes is distinct from old.observacoes then
    raise exception 'Perfil operacional não pode editar os dados cadastrais do equipamento';
  end if;

  if new.ultimo_inventario_por is distinct from old.ultimo_inventario_por
     and new.ultimo_inventario_por is distinct from (select auth.uid()) then
    raise exception 'O técnico do inventário deve ser o usuário autenticado';
  end if;
  return new;
end;
$$;

drop trigger if exists protect_inventory_update_trigger on public.inventario;
create trigger protect_inventory_update_trigger
before update on public.inventario
for each row execute function private.protect_inventory_update();

drop policy if exists historico_select_own_or_admin on public.inventario_historico;
drop policy if exists historico_insert_own on public.inventario_historico;
drop policy if exists historico_update_admin on public.inventario_historico;
drop policy if exists historico_delete_admin on public.inventario_historico;

create policy historico_select_own_or_admin on public.inventario_historico
  for select to authenticated
  using (tecnico_id = (select auth.uid()) or (select private.is_admin()));
create policy historico_insert_own on public.inventario_historico
  for insert to authenticated
  with check (tecnico_id = (select auth.uid()));
create policy historico_update_admin on public.inventario_historico
  for update to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));
create policy historico_delete_admin on public.inventario_historico
  for delete to authenticated using ((select private.is_admin()));

-- Cadastro de novos tipos fica restrito ao administrador; ambos os perfis podem consultar.
drop policy if exists authenticated_operational_access on public.tipos_equipamento;
drop policy if exists tipos_select_authenticated on public.tipos_equipamento;
drop policy if exists tipos_manage_admin on public.tipos_equipamento;
create policy tipos_select_authenticated on public.tipos_equipamento
  for select to authenticated using (true);
create policy tipos_manage_admin on public.tipos_equipamento
  for all to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));

-- Força o PostgREST/Supabase API a recarregar o schema depois das novas tabelas/funções.
-- Evita o erro "Could not find the table ... in the schema cache" logo após aplicar a migration.
notify pgrst, 'reload schema';
