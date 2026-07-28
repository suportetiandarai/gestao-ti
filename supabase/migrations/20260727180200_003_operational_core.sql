create table public.system_settings (
  id uuid primary key default gen_random_uuid(),
  setting_key text not null unique,
  setting_value jsonb not null default '{}'::jsonb,
  description text,
  is_secret_reference boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.tipos_equipamento (
  id uuid primary key default gen_random_uuid(),
  nome text not null unique,
  created_at timestamptz not null default now()
);

create table public.inventario (
  id uuid primary key default gen_random_uuid(),
  nome text, tipo text not null, marca text not null, modelo text not null,
  numero_serie text, codigo_barras text, patrimonio text, origem_patrimonio text,
  status text not null default 'Não informado',
  predio text, andar text, setor text, responsavel text, observacoes text,
  status_inventario text check (status_inventario is null or status_inventario in ('validado','pendente')),
  ultima_data_inventario timestamptz,
  ultimo_inventario_por uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.inventario_historico (
  id uuid primary key default gen_random_uuid(),
  equipamento_id uuid references public.inventario(id) on delete set null,
  codigo_lido text not null,
  tipo_leitura text not null default 'codigo_barras'
    check (tipo_leitura in ('codigo_barras','numero_serie','patrimonio','identificador','manual')),
  status text not null check (status in ('encontrado','nao_encontrado','cadastrado','pendente','ignorado')),
  acao text not null,
  tecnico_id uuid not null default auth.uid() references auth.users(id) on delete restrict,
  tecnico_login text, localizacao text, observacao text,
  sessao_id uuid not null,
  created_at timestamptz not null default now()
);

create table public.plantoes (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid references auth.users(id) on delete set null,
  tecnicos_plantao text, hora_assumiu timestamptz not null, hora_largou timestamptz not null,
  emails_resp boolean not null default false, motivo_emails text,
  chamados_pend boolean not null default false, motivo_chamados text,
  forms_zerado boolean not null default false, motivo_forms text,
  forms_treinamento boolean not null default false, motivo_treinamento text,
  maquinas_func boolean not null default false, motivo_maquinas text,
  cadeiras_lugar boolean not null default false, motivo_cadeiras text,
  painel_tv boolean not null default false, motivo_tv text,
  ocorrencias boolean not null default false, motivo_ocorrencias text,
  assinatura_url text, visto_supervisao boolean not null default false,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table public.chaves (
  id uuid primary key default gen_random_uuid(),
  nome text not null unique, cor text not null, localizacao text not null,
  status text not null default 'disponivel' check (status in ('disponivel','retirada')),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.movimentacao_chaves (
  id uuid primary key default gen_random_uuid(),
  chave_id uuid not null references public.chaves(id) on delete restrict,
  usuario_id uuid references auth.users(id) on delete set null,
  tipo_movimento text not null check (tipo_movimento in ('retirada','devolucao')),
  data_hora timestamptz not null, responsavel text not null,
  assinatura_url text, foto_url text, created_at timestamptz not null default now()
);

create table public.ocorrencias (
  id uuid primary key default gen_random_uuid(),
  descricao text not null, solucao_proposta text not null, prazo date not null,
  observacao text, responsavel_abertura text not null, assinatura_abertura_url text,
  status text not null default 'Pendente',
  motivo_cancelamento text, solucao_aplicada text, quem_solucionou text,
  quem_acompanhou text, assinatura_fechamento_url text, data_finalizacao timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table public.cadastro_toner (
  id uuid primary key default gen_random_uuid(),
  modelo_toner text not null unique, impressora_compativel text,
  quantidade_atual integer not null default 0 check (quantidade_atual >= 0),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.registro_troca_toner (
  id uuid primary key default gen_random_uuid(),
  toner_id uuid not null references public.cadastro_toner(id) on delete restrict,
  usuario_id uuid references auth.users(id) on delete set null,
  foto_teste_url text, setor text, andar text, predio text, assinatura_tecnico_url text,
  created_at timestamptz not null default now()
);
create table public.chamado_simpress (
  id uuid primary key default gen_random_uuid(),
  numero_chamado text not null unique, modelo_impressora text, numero_serie text,
  setor_localizada text, status text not null default 'Aberto',
  observacao text, tecnico_acompanhante text, assinatura_tecnico_url text,
  data_resolucao timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table public.solicitacoes_cadastro (
  id uuid primary key default gen_random_uuid(),
  nome text not null, cpf text, cns text, data_nascimento date, cargo text,
  setor_andar text, email text, telefone text, numero_conselho text,
  foto_documento_url text, foto_conselho_url text,
  status text not null default 'Pendente', observacao text,
  realizado_por_nome text, realizado_por_email text, data_resolucao timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.solicitacoes_ad (
  id uuid primary key default gen_random_uuid(),
  nome_completo text not null, cpf text, email text, telefone text,
  setor text, cargo text, observacao text,
  status text not null default 'Pendente', motivo_cancelamento text,
  realizado_por_nome text, data_resolucao timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.solicitacoes_treinamento (
  id uuid primary key default gen_random_uuid(),
  nome text, colaborador text, telefone text, tema text, predio text, setor text, andar text,
  status text not null default 'Pendente', observacao text, data_resolucao timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.treinamentos (
  id uuid primary key default gen_random_uuid(),
  colaborador text not null, telefone text, tema text not null, predio text, setor text not null,
  andar text, data_hora timestamptz not null, status text not null default 'Agendado',
  solicitacao_id uuid references public.solicitacoes_treinamento(id) on delete set null,
  motivo_cancelamento text, responsavel_conclusao text, assinatura_url text, data_resolucao timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

do $$ declare t text; begin
  foreach t in array array['system_settings','inventario','plantoes','chaves','ocorrencias',
    'cadastro_toner','chamado_simpress','solicitacoes_cadastro','solicitacoes_ad',
    'solicitacoes_treinamento','treinamentos']
  loop execute format('create trigger %I before update on public.%I for each row execute function private.set_updated_at()', t || '_updated_at', t); end loop;
end $$;
