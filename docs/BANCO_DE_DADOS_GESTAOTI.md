# Banco de dados GestaoTI

```text
auth.users 1---1 user_profiles
glpi_groups 1---N glpi_tickets
glpi_tickets 1---N glpi_ticket_technicians N---1 glpi_technicians
glpi_tickets 1---N glpi_ticket_solutions N---1 glpi_technicians
glpi_tickets 1---N glpi_ticket_events
glpi_tickets 1---N private.glpi_ticket_raw_payloads
glpi_groups 1---N dashboard_shift_snapshots
```

Tabelas operacionais armazenam campos estruturados. Payload bruto é opcional,
privado, tem expiração e não participa dos cards, gráfico ou rota pública.

Funções centrais:

- `get_current_shift`: limites do plantão.
- `refresh_ticket_classification`: status e atraso.
- `get_shift_tickets`: página de até 100 registros autorizados.
- `rebuild_shift_snapshot`: indicadores, gráfico e hash.
- `acquire_glpi_sync_lock` e `finish_glpi_sync`: lock com expiração.

IDs do GLPI são únicos. O snapshot é único por grupo e intervalo. Os índices
compostos cobrem grupo/abertura, grupo/solução, status, atraso, cursor e relações
atuais.

As migrações `20260727180000` a `20260727180900` compõem o bootstrap completo.
A migração `20260728110000_011_restore_auth_helper_privileges.sql` restaura
somente `USAGE` no schema privado e `EXECUTE` nos três helpers usados pelas
policies RLS, após a revogação defensiva global:

A migração `20260728113000_012_sync_log_idempotency.sql` consolida o log por
`execution_id` e impede que uma execução deixe simultaneamente linhas
`running` e `success`.
extensões, perfis, operação, GLPI, sync, dashboard, funções, índices, RLS e cron.
