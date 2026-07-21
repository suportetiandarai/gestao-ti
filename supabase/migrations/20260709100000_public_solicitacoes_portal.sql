-- Libera o Portal público de Solicitações para enviar pedidos ao mesmo banco do Gestão TI.
-- A leitura completa das tabelas continua protegida; o público só pode inserir e consultar
-- o status resumido da própria solicitação por CPF via RPC security definer.

grant usage on schema public to anon;

grant insert on table public.solicitacoes_cadastro to anon;
grant insert on table public.solicitacoes_ad to anon;
grant insert on table public.solicitacoes_treinamento to anon;

drop policy if exists solicitacoes_cadastro_insert_anon on public.solicitacoes_cadastro;
create policy solicitacoes_cadastro_insert_anon
on public.solicitacoes_cadastro
for insert
to anon
with check (true);

drop policy if exists solicitacoes_ad_insert_anon on public.solicitacoes_ad;
create policy solicitacoes_ad_insert_anon
on public.solicitacoes_ad
for insert
to anon
with check (true);

drop policy if exists solicitacoes_treinamento_insert_anon on public.solicitacoes_treinamento;
create policy solicitacoes_treinamento_insert_anon
on public.solicitacoes_treinamento
for insert
to anon
with check (true);

create or replace function public.checar_solicitacao_detalhada(
  tabela_alvo text,
  cpf_busca text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  cpf_normalizado text := regexp_replace(coalesce(cpf_busca, ''), '\D', '', 'g');
  resultado jsonb;
begin
  if cpf_normalizado = '' then
    return null;
  end if;

  if tabela_alvo = 'cadastro' then
    select jsonb_build_object(
      'status', s.status,
      'observacao', s.observacao,
      'created_at', s.created_at
    )
    into resultado
    from public.solicitacoes_cadastro s
    where regexp_replace(coalesce(s.cpf, ''), '\D', '', 'g') = cpf_normalizado
    order by
      case
        when upper(btrim(coalesce(s.observacao, ''))) = 'FALTA DE CNS' then 0
        else 1
      end,
      s.created_at desc nulls last
    limit 1;

    return resultado;
  end if;

  if tabela_alvo = 'ad' then
    select jsonb_build_object(
      'status', s.status,
      'observacao', s.observacao,
      'created_at', s.created_at
    )
    into resultado
    from public.solicitacoes_ad s
    where regexp_replace(coalesce(s.cpf, ''), '\D', '', 'g') = cpf_normalizado
    order by s.created_at desc nulls last
    limit 1;

    return resultado;
  end if;

  return null;
end;
$$;

grant execute on function public.checar_solicitacao_detalhada(text, text) to anon, authenticated;

create or replace function public.checar_status_solicitacao(
  tabela_alvo text,
  cpf_busca text
)
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.checar_solicitacao_detalhada(tabela_alvo, cpf_busca)->>'status';
$$;

grant execute on function public.checar_status_solicitacao(text, text) to anon, authenticated;

notify pgrst, 'reload schema';
