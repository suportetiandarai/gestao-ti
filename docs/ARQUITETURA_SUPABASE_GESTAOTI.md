# Arquitetura Supabase — GestaoTI

Projeto de destino: `cctygrudsyoowuotlyfo` (`sa-east-1`).

## Inventário

| Funcionalidade | Arquivos | Problema anterior | Solução nova |
|---|---|---|---|
| Auth e perfis | `auth.js`, `app.js`, `admin-users` | espera indefinida e schema-base ausente | timeout de 15 s, `user_profiles` e RLS |
| Operação | `app.js` | tabelas não possuíam bootstrap completo | migrações limpas para inventário, plantões, chaves, toner e solicitações |
| Dashboard Geral | `glpi-dashboard.js` | leitura de cache pesado | view compatível sem payload bruto |
| Dashboard Diário | `glpi-dashboard.js` | processamento no navegador | snapshot resumido e RPC paginada |
| Dashboard público | `glpi-dashboard-public` | responsabilidades excessivas | leitura exclusiva, ETag e cache HTTP |
| Sincronização GLPI | `glpi-dashboard` | cache desnormalizado e lock frágil | tabelas normalizadas, cursor incremental e lock expirável |
| Agendamento | migração `010_cron` | dependência de navegador/jobs repetidos | um cron por minuto e manutenção diária |

## Fluxo

```text
pg_cron -> glpi-dashboard -> GLPI -> cache normalizado -> snapshot
navegador público -> glpi-dashboard-public -> snapshot + get_shift_tickets
```

O navegador público nunca chama o GLPI, não inicia sincronização e não recebe
`service_role`, App-Token, User-Token, Session-Token ou payload bruto.

## Regras

- Plantões: 07:00–19:00 e 19:00–07:00 em `America/Sao_Paulo`.
- Pendente: código GLPI 4; solucionado/fechado: 5 e 6.
- Técnico individual: somente `Ticket_User.type = 2`.
- Produtividade: autor de `ITILSolution`, usando `solved_at`.
- Atraso: não finalizado, não pendente e com SLA/OLA vencido.
- Grupo: `Suporte TI`, resolvido pelo ID real.

As migrações anteriores ficam em `supabase/legacy_migrations/` apenas para
auditoria e não integram o `db push` do projeto novo.
