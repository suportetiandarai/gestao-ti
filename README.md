# Dashboard GLPI RioSaúde

Dashboard gerencial para acompanhamento de chamados registrados no GLPI 10.0.18, integrado ao portal de Gestão de TI da RioSaúde.

## Objetivo

Apresentar indicadores operacionais de chamados, produtividade da equipe técnica, prazos de atendimento, pendências, SLA, evolução por período e relatórios exportáveis, sem expor credenciais do GLPI no navegador.

## Funcionalidades

- Aba GLPI com subabas: Dashboard geral, Técnicos, Chamados, Relatórios, Configurações e Monitoramento.
- Cards de indicadores, rankings, gráficos em barras, tabela detalhada, busca, ordenação e paginação.
- Filtros combináveis por período, técnico, grupo, status, categoria, prioridade, urgência, impacto, entidade, unidade, localização, tipo, requerente e SLA.
- Exportação dos resultados filtrados para PDF, CSV e Excel compatível.
- Atualização automática configurável e botão “Atualizar agora”.
- Modo demonstração explícito quando não houver dados reais sincronizados.
- Integração GLPI isolada em Supabase Edge Function, com tokens em secrets.

## Tecnologias

- Front-end existente: HTML, CSS e JavaScript.
- Autenticação e banco: Supabase Auth e PostgreSQL.
- Backend de integração: Supabase Edge Functions em TypeScript/Deno.
- Relatórios PDF: `html2pdf.js`.

## Diagnóstico GLPI

- Versão utilizada: GLPI 10.0.18.
- API: REST clássica em `{GLPI_BASE_URL}/apirest.php`.
- Autenticação recomendada: `App-Token` + `User-Token`.
- Alternativa: `GLPI_LOGIN` e `GLPI_PASSWORD`, somente se autorizada.
- OAuth: não usado no MVP.
- Permissões necessárias: usuário de API somente leitura com acesso aos chamados, usuários, grupos, categorias, entidades, localizações, SLA e relacionamentos necessários.

## Variáveis de ambiente

Copie `.env.example` e configure os valores reais apenas no ambiente local ou nos secrets do Supabase. Não publique `.env`.

Principais variáveis:

- `GLPI_BASE_URL`
- `GLPI_APP_TOKEN`
- `GLPI_USER_TOKEN`
- `GLPI_LOGIN`
- `GLPI_PASSWORD`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `DATABASE_URL`
- `REDIS_URL`

## Instalação e execução local

Este projeto atual é estático. Para testar a interface localmente, sirva a pasta com um servidor HTTP simples:

```bash
python -m http.server 8000
```

Acesse `http://localhost:8000`.

## Banco e sincronização

Execute as migrations do Supabase:

```bash
supabase db push
```

Deploy da Edge Function:

```bash
supabase functions deploy glpi-dashboard
```

Configure secrets:

```bash
supabase secrets set GLPI_BASE_URL=... GLPI_APP_TOKEN=... GLPI_USER_TOKEN=...
```

Estratégia do MVP: consulta incremental por API REST do GLPI, cache em `glpi_tickets_dashboard`, logs em `glpi_sync_logs` e atualização padrão a cada 1 minuto.

Estratégia robusta para produção: adicionar fila/Redis, job agendado no servidor, enriquecimento por subitens (`Ticket_User`, acompanhamentos e soluções), retenção histórica e métricas materializadas.

## Segurança

- Nenhum token do GLPI fica no front-end.
- A função `glpi-dashboard` exige sessão Supabase e restringe sincronização a `admin` e `gestor`.
- As tabelas GLPI têm RLS habilitado.
- `.env` e variações são ignorados pelo Git.
- A integração com GLPI é somente leitura.

## Critérios dos indicadores

Consulte [docs/GLPI_DASHBOARD_CRITERIOS.md](docs/GLPI_DASHBOARD_CRITERIOS.md).

## Testes e validação

Validações recomendadas:

```bash
supabase functions serve glpi-dashboard
supabase db push --dry-run
```

No navegador, validar:

- Login e permissões.
- Filtros por período e técnico.
- Cálculo de abertos, pendentes e finalizados.
- Paginação e busca da tabela.
- Exportação PDF, CSV e Excel.
- Modo responsivo em desktop, tablet e celular.
- Tratamento de API indisponível e tokens inválidos.

## Estrutura

```text
index.html
styles.css
glpi-dashboard.js
supabase/
  functions/
    glpi-dashboard/
      index.ts
  migrations/
    20260720090000_glpi_dashboard.sql
docs/
  GLPI_DASHBOARD_CRITERIOS.md
```

## Publicação no GitHub

Antes de publicar, confirme a conta autenticada:

```bash
gh auth status
```

Criação sugerida do repositório privado:

```bash
gh repo create dashboard-glpi-riosaude --private --source=. --remote=origin --push
```

Nunca publique tokens, senhas, URLs internas sensíveis, dados pessoais, logs reais ou backups.

## Próximas melhorias

- Enriquecer técnicos e primeira resposta com subitens do GLPI.
- Criar job agendado fora da interação do usuário.
- Adicionar Redis/fila para ambientes com alto volume.
- Criar relatórios materializados por mês e ano.
- Refinar regras de supervisor por grupo técnico.
