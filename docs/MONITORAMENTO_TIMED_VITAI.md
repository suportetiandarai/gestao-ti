# Monitoramento TIMED/Vitai

## Arquitetura

O monitor faz parte do mesmo projeto Supabase do Gestão TI. Ele não depende do frontend, de navegador aberto, de arquivo BAT ou de computador dedicado.

```text
pg_cron (1 minuto)
  -> Edge Function timed-monitor
  -> TIMED/Vitai
  -> system_monitors + system_downtimes
  -> Google Sheets (após o fechamento da indisponibilidade)
  -> card no Dashboard Geral
```

O banco do Gestão TI é a fonte oficial. A planilha é um destino idempotente: a coluna `ID Evento` recebe o UUID do evento e impede que uma nova tentativa crie uma segunda linha.

## Regras

- URL: `https://hmandarai.vitai.care/vitai/pages/painel.do`.
- Intervalo: 1 minuto, menor intervalo nativo seguro do `pg_cron` usado pelo projeto.
- Queda: 3 falhas consecutivas; `down_at` é a primeira falha da sequência.
- Retorno: 2 respostas positivas consecutivas; `recovered_at` é a primeira resposta positiva da sequência confirmada.
- HTTP 200 a 399, 401 e 403 são acessíveis. Redirecionamento normal para autenticação não é queda.
- Timeout padrão: 15 segundos.
- Um lock no banco impede execuções concorrentes e expira em até 110 segundos.
- Uma restrição parcial permite apenas uma indisponibilidade aberta por monitor.
- Datas são armazenadas em UTC e enviadas ao Sheets em `America/Sao_Paulo`.

## Banco

`system_monitors` mantém o estado, contadores, última verificação, resposta e lock. `system_downtimes` mantém cada indisponibilidade, duração e estado da sincronização com o Sheets.

As tabelas têm RLS. Usuários autenticados podem consultá-las; somente `service_role` executa as transições e gravações. O dashboard público não recebe o histórico do monitor.

## Configuração

Secrets da Edge Function:

- `GOOGLE_SERVICE_ACCOUNT_JSON_B64`: JSON da Service Account codificado em Base64 (já adotado pelo projeto).
- `GOOGLE_TIMED_MONITOR_SPREADSHEET_ID`: opcional; o padrão é `1IlfI3FfxAf93uQPX8Pd-DaB76D2acsLqFj3-1P93vjI`.
- `GOOGLE_TIMED_MONITOR_SHEET_NAME`: opcional; se vazio, usa a primeira aba.
- `TIMED_MONITOR_URL`: opcional; possui a URL oficial como padrão.
- `TIMED_MONITOR_TIMEOUT_MS`: opcional; padrão `15000`.

O projeto também precisa manter no Vault os secrets já utilizados pelo scheduler:

- `gestao_ti_project_url`
- `gestao_ti_service_role_key`

Compartilhe a planilha com o `client_email` presente no JSON da Service Account, com permissão de Editor. Não publique nem envie a chave privada.

## Implantação

No projeto correto (`cctygrudsyoowuotlyfo`):

```powershell
npx supabase migration list
npx supabase db push --dry-run
npx supabase db push
npx supabase functions deploy timed-monitor
```

Depois confirme que existe apenas o job `gestao-ti-timed-monitor`:

```sql
select jobname, schedule, active
from cron.job
where jobname = 'gestao-ti-timed-monitor';
```

## Teste manual seguro

Use a Service Role somente em um terminal seguro e remova-a ao terminar:

```powershell
$headers = @{ Authorization = "Bearer $env:SUPABASE_SERVICE_ROLE_KEY" }
Invoke-RestMethod -Method Post `
  -Uri "https://cctygrudsyoowuotlyfo.supabase.co/functions/v1/timed-monitor" `
  -Headers $headers
Remove-Item Env:SUPABASE_SERVICE_ROLE_KEY
```

Consulte o estado sem exibir secrets:

```sql
select name, current_status, last_check_at, last_success_at,
       consecutive_failures, consecutive_successes, last_http_status
from public.system_monitors
where name = 'TIMED';

select down_at, recovered_at, duration_seconds, status, sheet_synced
from public.system_downtimes
order by down_at desc
limit 10;
```

Para testar queda e retorno sem derrubar o TIMED real, use um projeto de teste ou altere temporariamente `TIMED_MONITOR_URL` para endpoints controlados. Não faça simulação de indisponibilidade no ambiente produtivo. Valide três falhas, duas respostas positivas, uma única linha no banco e uma única linha no Sheets.

## Dashboard

Usuários autenticados veem um card compacto no Dashboard Geral com estado, última verificação, último retorno, tempo de resposta e, durante uma queda, o tempo OFF em andamento. O histórico mostra os cinco eventos mais recentes.
