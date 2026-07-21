# Dashboard GLPI RioSaúde - critérios dos indicadores

## Diagnóstico inicial

- Versão informada e adotada: GLPI 10.0.18.
- API esperada: REST clássica do GLPI em `{GLPI_BASE_URL}/apirest.php`.
- API REST habilitada: precisa ser validada no ambiente real acessando `/apirest.php/initSession`; o projeto inclui a Edge Function `glpi-dashboard` para testar a conexão sem expor credenciais.
- Autenticação preferencial: `App-Token` + `User-Token`.
- Alternativa suportada: login e senha via Basic Auth, somente se autorizado.
- OAuth: não adotado para o MVP em GLPI 10.0.18.
- Permissões do usuário de API: somente leitura para chamados, usuários, grupos, categorias, entidades, localizações, SLAs e relacionamentos de chamados.
- Consumo de dados: o front-end consulta o cache próprio em PostgreSQL/Supabase. O GLPI é acessado apenas pela Edge Function.
- Atualização: sincronização incremental por data de modificação, paginação e cache. Intervalo padrão de 1 minuto, configurável para 30 segundos ou 5 minutos.

## Endpoints GLPI usados

- `GET /apirest.php/initSession`
- `GET /apirest.php/killSession`
- `GET /apirest.php/Ticket`
- Planejados para enriquecimento em produção: `Ticket/{id}/Ticket_User`, `Ticket/{id}/ITILFollowup`, `Ticket/{id}/ITILSolution`, `User`, `Group`, `ITILCategory`, `Entity`, `Location` e objetos de SLA conforme configuração do GLPI.

## Identificação dos dados

- Chamados: `Ticket.id`.
- Técnicos: usuário atribuído ao chamado, preferencialmente relação `Ticket_User` tipo técnico; no MVP é usado o campo expandido disponível em `Ticket`.
- Grupos técnicos: grupo atribuído ao chamado.
- Categorias: `itilcategories_id`.
- Status: códigos GLPI `1 Novo`, `2 Atribuído`, `3 Planejado`, `4 Pendente`, `5 Solucionado`, `6 Fechado`.
- Datas: abertura `date`, modificação `date_mod`, solução `solvedate`, fechamento `closedate`, prazo SLA `time_to_resolve`.
- Tempo de atendimento: solução menos atribuição quando `assigned_at` estiver disponível; caso contrário, solução menos abertura.
- Tempo de solução: solução menos abertura.
- Tempo de fechamento: fechamento menos abertura.

## Fórmulas

- Chamados abertos: chamados cujo status esteja em `Novo`, `Atribuído`, `Planejado` ou `Pendente`.
- Chamados pendentes: chamados atualmente no status `Pendente`.
- Chamados finalizados: chamados com `solved_at` ou `closed_at` dentro do período filtrado.
- Chamados atendidos por técnico no Dashboard Geral: regra configurável. O padrão inicial é chamado solucionado pelo técnico no dia atual.
- Chamados atendidos hoje no Dashboard Diário: chamados atribuídos a um técnico entre `00:00:00` e `23:59:59` em `America/Sao_Paulo`.
- Tempo médio de primeira resposta: soma de `first_response_at - opened_at` dividida pela quantidade de chamados com as duas datas válidas.
- Tempo médio de solução: soma de `solved_at - opened_at` dividida pela quantidade de chamados solucionados com datas válidas.
- Tempo médio de fechamento: soma de `closed_at - opened_at` dividida pela quantidade de chamados fechados com datas válidas.
- SLA vencido: chamado não finalizado cujo prazo de solução esteja no passado.
- SLA próximo do vencimento: chamado não finalizado cujo prazo esteja dentro da janela configurada por `GLPI_SLA_WARNING_MINUTES`.

Valores indisponíveis são exibidos como “Não disponível” e não entram em médias.
