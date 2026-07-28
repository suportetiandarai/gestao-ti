# Integração dos dashboards Google Sheets

## Escopo

Esta integração mantém três fluxos independentes:

- TIMED: planilha `1EVGXL_NUV_koXR1mH_X4z_YqVmsaLytCX84ONYTzD9I`;
- Treinamentos: planilha `1vcNxK3VQ4TwIxdHWWPCQcyYY6nS1MfRLFw9c8lxza_U`.
- Active Directory: planilha `1_j13tglIFAWDcvLx2dsMGLugThdrrzbjKHYNt9H5Qj4`.

Somente registros com data a partir de `28/07/2026 00:00`, no fuso
`America/Sao_Paulo`, são importados. Linhas vermelhas da planilha de
Treinamentos são ignoradas.

## Fluxo seguro

```text
Google Sheets
  → google-sheets-sync (protegida por chave privada exclusiva do agendamento)
  → tabelas normalizadas e snapshot no Supabase
  → google-sheets-dashboard-public (somente leitura)
  → /dashboard-timed/, /dashboard-treinamentos/ ou /dashboard-ad/
```

O navegador nunca recebe a conta de serviço, nunca consulta o Google
diretamente e não consegue iniciar uma sincronização.

O portal `https://suportetiandarai.github.io/solicitacoes/` envia os três
formulários para a Edge Function `google-sheets-intake`. A função valida origem,
campos e tamanho e encaminha os dados para um Google Apps Script protegido por
segredo. O Apps Script executa pela conta proprietária das planilhas, preserva
os avisos de duplicidade por CPF e salva os anexos TIMED nas pastas existentes
do Google Drive.

## Campos públicos

TIMED:

- data e hora da solicitação;
- nome;
- cargo;
- setor;
- status operacional.

Treinamentos:

- data e hora da solicitação;
- nome;
- setor/andar;
- cargo;
- tema;
- status operacional.

Active Directory:

- data da solicitação;
- nome;
- status operacional.

Não são publicados e-mail, telefone, CPF, CNS, documentação profissional,
motivo da pendência, observações internas, links do Drive ou qualquer token.

## Regras de status

TIMED:

- `CADASTRADO` ou `REALIZADO`: Realizado;
- `PENDENTE`: Pendente;
- célula em branco: Não realizado.

Treinamentos:

- verde: Realizado;
- amarelo: Agendado;
- branco: Não agendado;
- vermelho: ignorado.

Active Directory:

- `REALIZADO`: Realizado;
- `PENDENTE`: Pendente;
- célula em branco: Não realizado.

## Operação

A sincronização é executada por um único job do `pg_cron`, a cada minuto.
TIMED, Treinamentos e Active Directory possuem locks, logs e estados
independentes. O job autentica com `GOOGLE_SHEETS_SYNC_KEY`, armazenada tanto
como secret da Edge Function quanto no Vault, sem usar uma sessão de usuário.
O dashboard verifica o snapshot a cada 30 segundos e usa `ETag`,
`If-None-Match` e resposta `304 Not Modified`.

O estado é `Online` até três minutos após o último sucesso, `Sincronização
atrasada` entre três e quinze minutos e `Indisponível` após quinze minutos. O
status faz parte do `ETag`, portanto a transição é exibida mesmo quando os dados
da planilha não mudaram.

Rotas públicas:

- `/dashboard-timed/`;
- `/dashboard-treinamentos/`.
- `/dashboard-ad/`.

## Secrets

O JSON da conta de serviço deve permanecer em
`supabase/.temp/google-sheets-service-account.json` ou outro arquivo dentro de
`supabase/.temp/`, que é ignorado pelo Git. Configure no Supabase somente:

```text
GOOGLE_SERVICE_ACCOUNT_JSON_B64
GOOGLE_SHEETS_SYNC_KEY
```

Os IDs das planilhas, nomes das abas e data de corte podem ser configurados
como secrets/variáveis com os nomes documentados no `.env.example`.

O endpoint de entrada também exige:

```text
GOOGLE_APPS_SCRIPT_WEBAPP_URL
GOOGLE_APPS_SCRIPT_SHARED_SECRET
```

Os valores acima são privados. Nenhum deles pode ser incluído no portal
estático, no navegador ou em arquivos versionados.
