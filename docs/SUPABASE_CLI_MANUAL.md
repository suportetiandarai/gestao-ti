# Supabase CLI — procedimento manual no Windows

Este guia descreve o procedimento seguro para validar o projeto remoto, aplicar
migrações e publicar as Edge Functions do GESTÃO TI. Execute os comandos no
PowerShell, sem enviar senhas ou tokens pelo chat.

## Projeto confirmado

- Organização: `Boot Andaraí`
- Projeto: `suporteandaraiti@gmail.com's Project`
- Ambiente: `main` / produção
- Project Reference: `ditygnxttjvlfrdpvaxe`
- URL: `https://ditygnxttjvlfrdpvaxe.supabase.co`

Antes de qualquer alteração remota, confira novamente esses dados em
<https://supabase.com/dashboard/project/ditygnxttjvlfrdpvaxe>. Se o nome,
organização ou referência forem diferentes, interrompa o procedimento.

## 1. Abrir o projeto e conferir a saúde

1. Acesse <https://supabase.com/dashboard>.
2. Selecione a organização e o projeto indicados acima.
3. Confirme a referência na URL do navegador.
4. Verifique `Reports/Observability` e resolva alertas críticos antes de aplicar
   migrações. Um projeto sem recursos pode provocar timeout no Auth, SQL Editor
   e CLI.

## 2. Abrir o PowerShell na pasta correta

```powershell
cd C:\Users\joao.monteiro\Desktop\gestao-ti
npx supabase --version
```

A versão observada durante o diagnóstico foi `2.109.1`. O projeto já mantém o
CLI como dependência de desenvolvimento; não é necessária instalação global.
Se a dependência não estiver disponível:

```powershell
npm install --save-dev supabase
npx supabase --version
```

O CLI via npm requer Node.js 20 ou mais recente.

## 3. Autenticar o CLI

```powershell
npx supabase login
```

Se o CLI solicitar um Personal Access Token:

1. Abra <https://supabase.com/dashboard/account/tokens>.
2. Crie um token com o nome `gestao-ti-cli`.
3. Cole o token diretamente no prompt do terminal.
4. Não grave o token em `.env`, documentação ou arquivo versionado.

Valide a conta:

```powershell
npx supabase projects list
```

O projeto com a referência `ditygnxttjvlfrdpvaxe` deve aparecer. Não prossiga
se ele não estiver na lista.

## 4. Vincular o projeto

```powershell
npx supabase link --project-ref ditygnxttjvlfrdpvaxe
```

Quando solicitada, digite a senha do banco diretamente no prompt. Se ela foi
esquecida, redefina-a no painel do projeto em `Database > Settings > Database
password`. O nome exato da opção pode variar conforme a versão do painel.

Confira o vínculo:

```powershell
npx supabase migration list
```

Não use `migration repair` antes de comparar cuidadosamente o histórico local e
remoto.

## 5. Falha SASL/SCRAM, `cli_login_postgres` ou bloqueio de IP

O fluxo sem senha do CLI pode falhar quando o Supavisor mantém credenciais
incorretas do papel interno `cli_login_postgres`.

1. Abra `Database > Settings > Network bans`.
2. Remova somente o IP legítimo da conexão atual, caso esteja bloqueado.
3. Repita o comando com a senha do banco.

Para não escrever a senha literalmente no histórico do PowerShell:

```powershell
$senhaSegura = Read-Host "Senha do banco Supabase" -AsSecureString
$env:SUPABASE_DB_PASSWORD = [Net.NetworkCredential]::new("", $senhaSegura).Password

try {
    npx supabase migration list --debug
    npx supabase db push --dry-run --debug
}
finally {
    Remove-Item Env:SUPABASE_DB_PASSWORD -ErrorAction SilentlyContinue
    Remove-Variable senhaSegura -ErrorAction SilentlyContinue
}
```

Não execute o push real enquanto o dry-run não concluir sem erro.

Se a rede tiver IPv6, o procedimento oficial alternativo é ignorar o pooler com
o canal beta. Confira primeiro se a opção ainda existe:

```powershell
npx supabase@beta link --help
npx supabase@beta link --project-ref ditygnxttjvlfrdpvaxe --skip-pooler
npx supabase@beta migration list
npx supabase@beta db push --dry-run
```

Se o erro do papel gerenciado persistir, abra um chamado no suporte do Supabase;
não altere privilégios do `cli_login_postgres` manualmente.

## 6. Conferir conexão direta e poolers

No topo do painel, clique em `Connect` e copie o host e a porta oficiais de cada
modo. Não copie a senha para documentação ou logs.

```powershell
Test-NetConnection HOST_DA_CONEXAO_DIRETA -Port 5432
Test-NetConnection HOST_DO_SESSION_POOLER -Port 5432
Test-NetConnection HOST_DO_TRANSACTION_POOLER -Port 6543
```

Registre apenas host, porta, `TcpTestSucceeded` e duração. A conexão direta do
projeto pode depender de IPv6. Em uma rede somente IPv4, use o Session Pooler
para diagnóstico. O Transaction Pooler é apropriado para clientes transitórios,
mas não é a primeira opção para migrações.

## 7. Revisar e aplicar migrações

Liste o histórico:

```powershell
npx supabase migration list
```

Faça o dry-run:

```powershell
npx supabase db push --dry-run
```

Revise todas as migrações pendentes. Interrompa se aparecer exclusão inesperada,
`DROP`, `TRUNCATE`, reset ou alteração destrutiva.

Somente depois da revisão:

```powershell
npx supabase db push
npx supabase migration list
```

Nunca execute `npx supabase db reset --linked` em produção.

## 8. Configurar secrets das Edge Functions

Crie o arquivo local ignorado pelo Git:

```text
supabase\.env.secrets.local
```

Conteúdo:

```env
GLPI_BASE_URL=
GLPI_API_URL=
GLPI_APP_TOKEN=
GLPI_USER_TOKEN=
GLPI_TIMEZONE=America/Sao_Paulo
GLPI_TIMEZONE_OFFSET=-03:00
GLPI_TECH_GROUP_NAME=Suporte TI
GLPI_TECH_GROUP_ID=
```

Preencha os valores no editor local, salve e execute:

```powershell
npx supabase secrets set --env-file supabase\.env.secrets.local
npx supabase secrets list
```

O comando de listagem deve mostrar apenas os nomes. Não exiba valores ou
digests. O arquivo já está coberto pelo `.gitignore` do projeto.

## 9. Publicar as funções

Este projeto usa duas funções distintas:

- `glpi-dashboard`: sincronização protegida e processamento do GLPI;
- `glpi-dashboard-public`: leitura pública, limitada ao cache/snapshot.

Após aplicar as migrações e conferir os secrets:

```powershell
npx supabase functions deploy glpi-dashboard
npx supabase functions deploy glpi-dashboard-public
npx supabase functions list
```

Durante o diagnóstico de 27/07/2026, `glpi-dashboard` estava publicada, mas
`glpi-dashboard-public` não aparecia na lista remota. Sem a segunda função, a
rota pública recebe HTTP 404 e exibe a integração como indisponível.

## 10. Validação pós-publicação

1. Confirme que as duas funções aparecem em `functions list`.
2. Consulte os logs sem imprimir cabeçalhos ou tokens.
3. Execute uma sincronização protegida pelo mecanismo administrativo ou job.
4. Confirme que `initSession`, consulta mínima e `killSession` concluíram.
5. Confirme a atualização de `last_success_at` e do snapshot.
6. Abra a rota pública em janela anônima.
7. Confirme que ela lê o cache e não inicia uma sincronização.

O teste só é considerado aprovado quando há uma resposta real do GLPI e o cache
é atualizado. Deploy concluído, isoladamente, não comprova a integração.

## Solução de problemas

- `401/403`: confira autenticação, políticas e secrets, sem expor seus valores.
- `404` na função: confirme o nome e publique a função ausente.
- `Invalid App-Token` ou `Invalid User-Token`: regenere o secret no GLPI e envie
  pelo arquivo local ignorado.
- Timeout no Auth, SQL Editor e CLI ao mesmo tempo: verifique CPU, memória,
  conexões e saúde do projeto antes de repetir comandos.
- `failed SASL auth`/SCRAM: verifique bloqueio de IP, use o fluxo por senha e,
  se necessário, `--skip-pooler` em rede IPv6.
- Timeout na conexão direta: teste IPv6 ou o Session Pooler por IPv4.
- Falha de DNS/SSL/timeout até o GLPI: confirme se a Edge Function hospedada
  consegue alcançar a rede do GLPI. Não exponha a instância de forma insegura.

## Links oficiais

- Painel: <https://supabase.com/dashboard>
- Personal Access Tokens: <https://supabase.com/dashboard/account/tokens>
- Instalação e uso local do CLI:
  <https://supabase.com/docs/guides/local-development/cli/getting-started>
- Referência do CLI: <https://supabase.com/docs/reference/cli/introduction>
- Migrações:
  <https://supabase.com/docs/guides/deployment/database-migrations>
- Conexão com PostgreSQL:
  <https://supabase.com/docs/guides/database/connecting-to-postgres>
- Diagnóstico SASL/SCRAM e `cli_login_postgres`:
  <https://supabase.com/docs/guides/troubleshooting/supabase-cli-failed-sasl-auth-or-invalid-scram-server-final-message>
