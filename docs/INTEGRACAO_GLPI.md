# Integração Supabase e GLPI

## Segurança e fluxo

A integração é somente leitura no GLPI:

```text
Navegador -> Supabase Edge Function -> GLPI REST
                         |
                         -> cache PostgreSQL protegido por RLS
```

Tokens GLPI e `SUPABASE_SERVICE_ROLE_KEY` são secrets exclusivos da Edge Function. O navegador recebe somente a URL Supabase e chave pública.

## Links de autenticação e configuração

### Supabase

- Painel principal: <https://supabase.com/dashboard>
- Tokens pessoais: <https://supabase.com/dashboard/account/tokens>
- Guia oficial do CLI: <https://supabase.com/docs/guides/local-development/cli/getting-started>
- Referência do CLI: <https://supabase.com/docs/reference/cli/introduction>

Use `npx supabase login`. Se o ambiente não oferecer um terminal interativo, abra a página de tokens, crie um PAT com nome identificável como `gestao-ti-cli` e informe-o somente no prompt seguro do CLI. Nunca cole o PAT em chat, arquivo versionado ou linha de comando com `--token`.

### GLPI

O GLPI 10.0.18 não depende de um fluxo OAuth externo. Todos os endereços abaixo devem partir do `GLPI_BASE_URL` real, sem presumir host ou rota administrativa:

```text
Página de login: <GLPI_BASE_URL>
API REST: <GLPI_BASE_URL>/apirest.php
Documentação local candidata: <GLPI_BASE_URL>/apirest.php/
```

Teste os dois formatos da API na instalação antes de publicar um link. Se a documentação local com barra final não responder, mantenha apenas o endpoint confirmado. Documentação oficial: <https://help.glpi-project.org/documentation/modules/configuration/general/api/api>.

## Preparação do GLPI

1. Entre com uma conta administradora e acesse `Configurar → Geral → API` ou `Setup → General → API`.
2. Ative a API REST, confirme a URL normalmente terminada em `/apirest.php` e salve.
3. Na mesma área, crie e ative o cliente `Dashboard Gestão TI`; limite IPs quando aplicável e gere o `App-Token`.
4. Crie ou use o usuário exclusivo `integracao.dashboard`.
5. Conceda somente leitura de chamados, usuários/técnicos, grupos, entidades, categorias, SLA/OLA, acompanhamentos necessários, datas e status.
6. Não conceda criação, alteração, exclusão ou fechamento de chamados, gestão de usuários ou configurações.
7. No perfil/preferências do usuário de integração, gere o `Token da API`/`API token`.
8. Confirme a versão real na interface administrativa ou resposta suportada da API.

Endpoints usados:

- `GET initSession`;
- `GET killSession`;
- `GET Ticket`;
- `GET User`;
- `GET Group`;
- `GET ITILCategory`.

A função não executa `POST`, `PUT`, `PATCH` ou `DELETE` no GLPI.

## Variáveis e secrets

Obrigatórios:

```env
GLPI_BASE_URL=
GLPI_APP_TOKEN=
GLPI_USER_TOKEN=
GLPI_TIMEZONE=America/Sao_Paulo
GLPI_TIMEZONE_OFFSET=-03:00
```

Opcionais:

```env
GLPI_API_URL=
GLPI_LOGIN=
GLPI_PASSWORD=
GLPI_REQUEST_TIMEOUT=15000
GLPI_SYNC_PAGE_SIZE=100
GLPI_SYNC_MAX_PAGES=10
GLPI_SYNC_MODIFIED_AFTER=
GLPI_SLA_WARNING_MINUTES=240
GLPI_RETRY_ATTEMPTS=3
GLPI_RETRY_BASE_DELAY_MS=300
GLPI_SYNC_LOCK_SECONDS=120
```

`GLPI_LOGIN`/`GLPI_PASSWORD` são alternativa ao User-Token e não devem ser usados simultaneamente sem necessidade. O certificado TLS do GLPI deve ser válido; a função não oferece opção para ignorar SSL.

Prefira o arquivo local ignorado pelo Git:

```text
supabase/.env.secrets.local
```

Preencha-o localmente, sem compartilhar seu conteúdo, e envie os secrets de uma vez:

```bash
npx supabase secrets set --env-file supabase/.env.secrets.local
npx supabase secrets list
```

`secrets list` deve ser usado apenas para confirmar nomes/digests; não registre valores. O arquivo está no `.gitignore` e não pode ser adicionado ao commit.

## Vincular e validar o Supabase

```bash
npx supabase login
npx supabase link --project-ref SEU_PROJECT_REF
npx supabase migration list --linked
npx supabase db push --dry-run
```

Confirme que `supabase/.temp/project-ref` corresponde ao host de `SUPABASE_URL`. Não execute `db push` se o projeto estiver ausente, divergente ou não autorizado.

As migrações novas são:

- `20260722090000_glpi_daily_dashboard_deadlines.sql`: adiciona prazos externos/internos de atendimento e solução.
- `20260722100000_glpi_sync_state.sql`: adiciona cursor, saúde e lock atômico.
- `20260722110000_glpi_ticket_assignments.sql`: registra uma única atribuição diária por par chamado/técnico, obtida de `date_assign` ou do histórico do GLPI.

Elas são aditivas, preservam dados, mantêm RLS e não recriam `glpi_tickets_dashboard`. Os prazos não receberam índices porque o dashboard atual calcula os cinco indicadores após carregar seu cache limitado; não há consulta SQL filtrando essas colunas. Crie índices somente quando esse padrão mudar.

Aplicação:

```bash
npx supabase db push
npx supabase migration list --linked
```

Se a rede bloquear a conexão PostgreSQL usada pelo CLI, gere os arquivos para o
SQL Editor oficial com `node scripts/prepare-glpi-sql.mjs`. Execute primeiro
`supabase/.temp/glpi-dry-run.sql`; o resultado esperado é
`dry_run_rolled_back = true`, com as duas verificações seguintes iguais a
`true`. Somente depois execute `supabase/.temp/glpi-apply.sql` e valide tabelas,
colunas e RLS. Os arquivos gerados ficam em diretório ignorado pelo Git.

Aplicar pelo SQL Editor não grava a versão em
`supabase_migrations.schema_migrations`. Quando a conectividade PostgreSQL do
CLI estiver disponível, reconcilie o histórico antes de um novo `db push`; não
reaplique migrações sem comparar o schema remoto.

Validação SQL após aplicar:

```sql
select column_name, data_type
from information_schema.columns
where table_schema = 'public'
  and table_name = 'glpi_tickets_dashboard'
  and column_name in (
    'attention_due_at', 'sla_due_at',
    'internal_attention_due_at', 'internal_sla_due_at'
  );

select status, last_cursor, last_success_at, locked_until
from public.glpi_sync_state
where id = 1;
```

## Deploy da Edge Function

```bash
npx supabase secrets set --env-file supabase/.env.secrets.local
npx supabase functions deploy glpi-dashboard
```

Teste pela aplicação autenticada ou invoque a função com JWT de administrador/gestor. Não coloque JWT em histórico de shell compartilhado.

Corpo para diagnóstico somente leitura:

```json
{ "action": "test-connection" }
```

Para verificar somente presença dos secrets e URLs públicas/sanitizadas, sem iniciar uma sessão GLPI:

```json
{ "action": "configuration-status" }
```

A resposta segura contém disponibilidade, amostra de tickets, campos/status observados, versão quando fornecida pelo GLPI e tempo de execução. Tokens e detalhes técnicos não são retornados.

## Campos que devem ser confirmados no GLPI real

```text
date
date_mod
date_assign
takeintoaccount_delay_stat
time_to_own
time_to_resolve
internal_time_to_own
internal_time_to_resolve
users_id_lastupdater
status
```

`test-connection` informa quais chaves aparecem na amostra. Ausência na amostra não prova inexistência global; confirme também o schema/documentação da instância.

### Resultado validado em `os.riosaude.rio.br`

- `initSession`, perfil ativo, perfis, entidades, chamados, usuários, grupos, categorias, SLA, OLA e `killSession`: acessíveis em modo somente leitura.
- Presentes no payload de Ticket: `date`, `date_mod`, `takeintoaccount_delay_stat`, `time_to_own`, `time_to_resolve`, `internal_time_to_own`, `internal_time_to_resolve`, `users_id_lastupdater` e `status`.
- Ausente no payload de lista e item individual: `date_assign`.
- Alternativa confirmada: técnico atual em `Ticket_User.type=2`; data do evento em `Log.date_mod` com `id_search_option=5`, identificado pela própria instalação como “Técnico”.
- Grupo técnico confirmado: `SUPORTE TI`, ID `1`, pela relação `Ticket/{id}/Group_Ticket` com `type=2`. Configure `GLPI_TECH_GROUP_ID=1` e `GLPI_TECH_GROUP_NAME=Suporte TI`; o ID tem prioridade.
- Responsável pela solução: `Ticket/{id}/ITILSolution.users_id`; data da solução em `date_creation` (com `date_mod` como alternativa).
- Nome de usuário confirmado em campos separados. A ordem correta é `firstname + realname`; `display_name`/`completename` são priorizados somente quando preenchidos.
- Os códigos `2 Atribuído` e `5 Solucionado` foram observados na amostra. Os demais códigos permanecem no mapeamento central do GLPI 10, mas não foram artificialmente gerados para teste.
- A API não retornou a versão em `initSession`/`getGlpiConfig`; `10.0.18` continua sendo a versão informada pela administração, não inferida da resposta.

## Sincronização incremental

1. A Edge Function adquire `acquire_glpi_sync_lock`.
2. Lê `glpi_sync_state.last_cursor`.
3. Consulta páginas ordenadas por `date_mod DESC`.
4. Para ao atingir registros anteriores ao cursor.
5. Enriquece técnico por `Ticket_User`, grupo responsável por `Group_Ticket`, solução por `ITILSolution` e atribuição pelo histórico quando `date_assign` está ausente.
6. Faz `upsert` por `glpi_id` e pelo par chamado/técnico.
7. Atualiza cursor, saúde e log.
8. Encerra a sessão GLPI em `finally`.

Erros 429/5xx, falhas de rede e timeout recebem até três tentativas por padrão. Erros definitivos preservam o cache anterior e marcam a integração como `offline`. O front-end considera a sincronização atrasada após 90 segundos sem sucesso.

No primeiro bootstrap, quando ainda não existe cursor, a função limita a carga a
`GLPI_SYNC_INITIAL_MAX_PAGES` (padrão `1`, com 100 chamados por página). Isso
evita tentar enriquecer todo o histórico dentro de uma única execução. Depois
do primeiro cursor, `GLPI_SYNC_MAX_PAGES` controla as páginas incrementais.

O modo demonstração é exclusivamente local e opt-in. Cache vazio, falha de RLS,
sessão ausente ou indisponibilidade do GLPI exibem `Offline • GLPI` e não criam
chamados fictícios. A sincronização inicial e o temporizador de 30 segundos não
dependem da existência prévia de registros no cache.

## Plantões e grupo operacional

O Dashboard Diário calcula o período no fuso `America/Sao_Paulo`:

- Diurno: 07:00 até 19:00 do mesmo dia.
- Noturno: 19:00 até 07:00 do dia seguinte.
- Entre 00:00 e 06:59:59, o início é 19:00 do dia anterior.

Todas as consultas visuais do Diário usam somente o grupo técnico ID `1`. Se o
ID configurado não existir ou se a busca exata por `GLPI_TECH_GROUP_NAME` falhar,
a Edge Function registra erro de configuração e o Dashboard Diário não inclui
chamados de outros grupos.

## Critérios operacionais

- Status esperados para GLPI 10: `1 Novo`, `2 Atribuído`, `3 Planejado`, `4 Pendente`, `5 Solucionado`, `6 Fechado`.
- Esses nomes são mapeados centralmente; a confirmação real depende do teste da instância.
- Primeira resposta: `date + takeintoaccount_delay_stat` enquanto esse campo for confiável.
- Alternativa, se não for confiável: sincronizar o primeiro `ITILFollowup`, `TicketTask` ou evento de histórico executado por técnico. A alternativa exige enriquecimento explícito e não deve ser inferida pela idade do ticket.

## Validação visual reproduzível

```bash
npm ci
npx playwright install chromium
npm run test:visual
```

Resoluções: 1920×1080, 1366×768, 768×1024 e 390×844. Em falha, abra `playwright-report/index.html` com `npx playwright show-report`.

## Rollback

Faça backup e interrompa novas sincronizações. Em seguida, somente se a aplicação anterior já estiver publicada:

```sql
drop function if exists public.acquire_glpi_sync_lock(integer);
drop table if exists public.glpi_sync_state;

alter table public.glpi_tickets_dashboard
  drop column if exists attention_due_at,
  drop column if exists internal_attention_due_at,
  drop column if exists internal_sla_due_at;
```

`sla_due_at` não é removida porque pertence à migração original. O rollback das novas colunas descarta apenas os prazos recém-sincronizados; o payload bruto existente continua armazenado. Revise dependências antes de executar.

## Diagnóstico de falhas

- `401/403`: sessão Supabase, papel `admin`/`gestor`, tokens ou permissões GLPI.
- `409`: lock de sincronização ativo; aguarde até `locked_until`.
- `429/5xx`: limite/indisponibilidade GLPI; verifique retry e logs.
- `offline`: consulte `glpi_sync_state.last_error_at` e `glpi_sync_logs` com perfil autorizado.
- Horários deslocados: confirme o fuso do GLPI e `GLPI_TIMEZONE_OFFSET`.
- Campos SLA/OLA vazios: confirme que o ticket possui SLA/OLA atribuído no GLPI.
