alter table public.google_sheet_requests
  add column if not exists pending_reason text;

comment on column public.google_sheet_requests.pending_reason is
  'Motivo operacional da pendência da solicitação TIMED, lido da coluna R.';

notify pgrst,'reload schema';
