# GESTÃO TI

Portal estático em HTML, CSS e JavaScript, integrado ao Supabase Auth/PostgreSQL e a Edge Functions TypeScript/Deno. O GLPI nunca é consultado diretamente pelo navegador: a função `glpi-dashboard` sincroniza dados somente leitura para o cache `glpi_tickets_dashboard`.

## Requisitos

- Node.js 22 ou superior (validado com Node 24).
- npm 10 ou superior.
- Conta Supabase e Supabase CLI para migração/deploy.
- Credenciais GLPI somente leitura para validar a integração real.

## Instalação e execução local

```bash
npm install
npm run dev
```

Abra `http://localhost:8000`. O servidor HTTP usa apenas APIs nativas do Node, escuta em `0.0.0.0` e não altera a execução por scripts clássicos.

Configure o navegador copiando `config.example.js` para `config.js`. Somente `SUPABASE_URL` e uma chave pública `sb_publishable_...`/`anon` podem estar nesse arquivo. Nunca adicione `service_role` ou tokens GLPI.

## Scripts npm

| Script | Finalidade |
| --- | --- |
| `npm run dev` | Servidor local em `0.0.0.0:8000`. |
| `npm run serve` | Serve o build em `0.0.0.0:4173`. |
| `npm run lint` | ESLint, Stylelint estrutural e validação HTML. |
| `npm run typecheck` | TypeScript estrito das Edge Functions. |
| `npm test` | Testes unitários com Node Test Runner. |
| `npm run test:visual` | Playwright em desktop, notebook, tablet e celular. |
| `npm run build` | Gera `dist/` com os arquivos estáticos validados. |
| `npm run validate` | Lint, typecheck, testes e build em sequência. |

Antes de enviar alterações:

```bash
npm ci
npm run validate
npm run test:visual
git diff --check
```

## Dashboard Diário

O Dashboard Diário contém exatamente cinco indicadores, um gráfico e uma listagem:

1. Chamados abertos no plantão;
2. Em atendimento;
3. Aguardando atendimento;
4. Pendentes;
5. Chamados estourados;
6. Chamados resolvidos por técnico no plantão;
7. Últimos chamados registrados.

Ele atualiza os dados a cada 30 segundos sem recarregar a página. A execução no navegador é exclusiva e o back-end também usa lock atômico, evitando sincronizações concorrentes.

O plantão atual é calculado em `America/Sao_Paulo`: diurno das 07:00 às 19:00
e noturno das 19:00 às 07:00. O Diário exibe exclusivamente chamados vinculados
ao grupo técnico real `SUPORTE TI` (ID `1`). O Diário e o Geral oferecem modo
painel e tela cheia sem recarregar a página.

A rota `/dashboard-diario` abre somente o Diário sem login. Ela não concede
acesso direto ao banco: usa a ação sanitizada `public-dashboard` da Edge
Function, habilitada por `PUBLIC_DASHBOARD_ENABLED=true`. Títulos ficam ocultos
por padrão com `PUBLIC_DASHBOARD_SHOW_TITLE=false`.

Critérios completos: [docs/GLPI_DASHBOARD_CRITERIOS.md](docs/GLPI_DASHBOARD_CRITERIOS.md).

## Arquitetura da sincronização

```text
Navegador (30 s)
  -> Supabase Edge Function (sessão autenticada admin/gestor)
    -> lock glpi_sync_state
    -> GLPI REST somente leitura
    -> busca incremental ordenada por date_mod
    -> enriquece técnico atual via Ticket_User e atribuição via Log
    -> paginação + retry controlado + timeout
    -> upsert glpi_tickets_dashboard
    -> upsert glpi_ticket_assignments_dashboard (par chamado/técnico)
    -> cursor/saúde/log em PostgreSQL
  -> navegador lê o cache com RLS
```

O estado é apresentado como `online`, `atrasado`, `sincronizando` ou `offline`. Falhas preservam os últimos chamados válidos.

## Supabase

O projeto usa o CLI local instalado pelo npm:

```bash
npx supabase login
npx supabase link --project-ref SEU_PROJECT_REF
npx supabase migration list --linked
npx supabase db push --dry-run
npx supabase db push
```

Antes do `db push`, confirme que o `project-ref` corresponde ao `SUPABASE_URL` autorizado. As migrações do dashboard são aditivas, não desativam RLS e não apagam chamados.

Quando a rede não permitir a conexão PostgreSQL do CLI, execute
`node scripts/prepare-glpi-sql.mjs` e siga o procedimento controlado pelo SQL
Editor descrito em `docs/INTEGRACAO_GLPI.md`. Esse caminho exige reconciliar o
histórico de migrações antes do próximo `db push`.

Publique a função:

```bash
npx supabase functions deploy glpi-dashboard
```

Configure secrets sem gravar valores no repositório. Preencha localmente
`supabase/.env.secrets.local` (já ignorado pelo Git) e digite os valores somente
nesse arquivo ou em um prompt seguro:

```bash
npx supabase secrets set --env-file supabase/.env.secrets.local
npx supabase secrets list
```

Na área administrativa, `GLPI > Configurações > Conectar serviços` apresenta o
estado do Supabase e do GLPI, links oficiais e testes sanitizados. A tela nunca
recebe os valores dos tokens; informa apenas se cada secret está configurado.

Consulte todas as variáveis em `.env.example`. `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` são fornecidos pelo runtime da Edge Function; a service role nunca pertence ao navegador.

## Validação GLPI

Na aba `GLPI > Configurações`, use `Testar conexão com o GLPI`. A ação valida sessão, leitura de chamados, usuários, grupos e categorias, campos operacionais, status observados, duração e encerramento da sessão. Nenhuma escrita é feita no GLPI.

Guia completo: [docs/INTEGRACAO_GLPI.md](docs/INTEGRACAO_GLPI.md).

## Validação visual

Na primeira execução:

```bash
npx playwright install chromium
npm run test:visual
```

Os testes cobrem 1920×1080, 1366×768, 768×1024 e 390×844, verificando cinco cards, único gráfico, ausência dos componentes removidos, overflow e responsividade do Dashboard Geral. Relatórios e traces de falha ficam em `playwright-report/` e `test-results/`.

## Produção

1. Execute `npm ci` e `npm run validate`.
2. Revise `npx supabase db push --dry-run` no projeto vinculado.
3. Faça backup conforme a política institucional.
4. Aplique migrações e valide as novas colunas.
5. Configure secrets no Supabase.
6. Publique `glpi-dashboard`.
7. Teste a conexão pela aplicação autenticada.
8. Execute uma sincronização incremental e valide `glpi_sync_state`/`glpi_sync_logs`.
9. Publique o conteúdo de `dist/` em servidor HTTPS com rewrite de SPA quando usar `/dashboard/publico/{token}`.

## Rollback

O rollback é manual e deve ocorrer somente após interromper a função e confirmar que nenhum consumidor usa as novas colunas. Os comandos exatos e a ordem segura estão em [docs/INTEGRACAO_GLPI.md](docs/INTEGRACAO_GLPI.md#rollback).

## Solução de problemas

- `UNABLE_TO_GET_ISSUER_CERT_LOCALLY`: configure a CA corporativa; em Node moderno, use temporariamente `NODE_OPTIONS=--use-system-ca`. Não desative `strict-ssl`.
- Dashboard offline: confira `config.js`, sessão Supabase, RLS, migrações e logs da função. Dados fictícios só são carregados quando o modo demonstração é ativado explicitamente na configuração local.
- Sincronização 409: outra execução possui o lock; aguarde a expiração configurada.
- GLPI 401/403: valide App-Token, User-Token, IP autorizado e perfil somente leitura.
- Campos ausentes: confira a versão real do GLPI e o payload retornado por `test-connection`.
- Datas incorretas: valide `GLPI_TIMEZONE_OFFSET` e o fuso configurado no GLPI.

## CI

`.github/workflows/validate.yml` executa `npm ci`, lint, typecheck, testes, build e Playwright em `push` e `pull_request`. Os testes estruturais usam dados fictícios e não dependem de tokens GLPI/Supabase.
