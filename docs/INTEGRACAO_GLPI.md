# Integração Supabase e GLPI

## Segurança e fluxo

A integração é somente leitura no GLPI:

```text
Navegador -> Supabase Edge Function -> GLPI REST
                         |
                         -> cache PostgreSQL protegido por RLS
```

Tokens GLPI e `SUPABASE_SERVICE_ROLE_KEY` são secrets exclusivos da Edge Function. O navegador recebe somente a URL Supabase e chave pública.

## Preparação do GLPI

1. Confirme a versão real na interface administrativa ou resposta suportada da API.
2. Habilite `/apirest.php` e crie um cliente de API.
3. Crie um usuário exclusivo, sem permissão de alteração/exclusão.
4. Autorize leitura de tickets, usuários, grupos, categorias, entidades, localizações, SLA/OLA e relações necessárias.
5. Gere `App-Token` e `User-Token`.

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

Elas são aditivas, preservam dados, mantêm RLS e não recriam `glpi_tickets_dashboard`. Os prazos não receberam índices porque o dashboard atual calcula os cinco indicadores após carregar seu cache limitado; não há consulta SQL filtrando essas colunas. Crie índices somente quando esse padrão mudar.

Aplicação:

```bash
npx supabase db push
npx supabase migration list --linked
```

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
npx supabase secrets set GLPI_BASE_URL="..." GLPI_API_URL="..."
npx supabase secrets set GLPI_APP_TOKEN="..." GLPI_USER_TOKEN="..."
npx supabase secrets set GLPI_TIMEZONE_OFFSET="-03:00"
npx supabase functions deploy glpi-dashboard
```

Teste pela aplicação autenticada ou invoque a função com JWT de administrador/gestor. Não coloque JWT em histórico de shell compartilhado.

Corpo para diagnóstico somente leitura:

```json
{ "action": "test-connection" }
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

## Sincronização incremental

1. A Edge Function adquire `acquire_glpi_sync_lock`.
2. Lê `glpi_sync_state.last_cursor`.
3. Consulta páginas ordenadas por `date_mod DESC`.
4. Para ao atingir registros anteriores ao cursor.
5. Normaliza e faz `upsert` por `glpi_id`.
6. Atualiza cursor, saúde e log.
7. Encerra a sessão GLPI em `finally`.

Erros 429/5xx, falhas de rede e timeout recebem até três tentativas por padrão. Erros definitivos preservam o cache anterior e marcam a integração como `offline`. O front-end considera a sincronização atrasada após 90 segundos sem sucesso.

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
