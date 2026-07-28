create or replace function private.normalize_inventory_values()
returns trigger language plpgsql set search_path=public,pg_temp as $$
begin
  new.numero_serie:=nullif(btrim(regexp_replace(coalesce(new.numero_serie,''),'^FDRAND-','','i')),'');
  new.codigo_barras:=nullif(btrim(regexp_replace(coalesce(new.codigo_barras,''),'^FDRAND-','','i')),'');
  new.patrimonio:=nullif(btrim(coalesce(new.patrimonio,'')),'');
  if nullif(btrim(coalesce(new.status,'')),'') is null then new.status:='Não informado'; end if;
  return new;
end; $$;
create trigger normalize_inventory_values_trigger
before insert or update on public.inventario
for each row execute function private.normalize_inventory_values();

create or replace function public.buscar_equipamento_inventario(p_codigo text)
returns setof public.inventario language sql stable security invoker set search_path=public,pg_temp as $$
select i.* from public.inventario i
where nullif(btrim(p_codigo),'') is not null and (
  lower(btrim(i.codigo_barras))=lower(btrim(p_codigo))
  or lower(btrim(i.numero_serie))=lower(btrim(p_codigo))
  or lower(btrim(i.patrimonio))=lower(btrim(p_codigo))
  or i.id::text=btrim(p_codigo)
) limit 1;
$$;
revoke all on function public.buscar_equipamento_inventario(text) from public,anon;
grant execute on function public.buscar_equipamento_inventario(text) to authenticated;

create or replace function public.checar_solicitacao_detalhada(tabela_alvo text,cpf_busca text)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare cpf_normalizado text:=regexp_replace(coalesce(cpf_busca,''),'\D','','g'); resultado jsonb;
begin
  if cpf_normalizado='' then return null; end if;
  if tabela_alvo='cadastro' then
    select jsonb_build_object('status',status,'observacao',observacao,'created_at',created_at)
      into resultado from public.solicitacoes_cadastro
      where regexp_replace(coalesce(cpf,''),'\D','','g')=cpf_normalizado
      order by created_at desc limit 1;
  elsif tabela_alvo='ad' then
    select jsonb_build_object('status',status,'observacao',observacao,'created_at',created_at)
      into resultado from public.solicitacoes_ad
      where regexp_replace(coalesce(cpf,''),'\D','','g')=cpf_normalizado
      order by created_at desc limit 1;
  end if;
  return resultado;
end; $$;
create or replace function public.checar_status_solicitacao(tabela_alvo text,cpf_busca text)
returns text language sql stable security definer set search_path=public,pg_temp as $$
select public.checar_solicitacao_detalhada(tabela_alvo,cpf_busca)->>'status';
$$;
grant execute on function public.checar_solicitacao_detalhada(text,text) to anon,authenticated;
grant execute on function public.checar_status_solicitacao(text,text) to anon,authenticated;

create or replace function private.purge_operational_history()
returns void language plpgsql security definer set search_path=public,private,pg_temp as $$
begin
  delete from public.glpi_sync_logs where created_at < now()-interval '30 days';
  delete from private.glpi_ticket_raw_payloads where expires_at < now();
end; $$;
revoke all on function private.purge_operational_history() from public,anon,authenticated;
