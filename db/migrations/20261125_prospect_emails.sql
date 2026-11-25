CREATE TABLE public.prospect_emails (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prospect_id uuid NOT NULL REFERENCES public.prospects(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('initial', 'follow_up_1', 'follow_up_2', 'manual')),
  subject text NOT NULL,
  body text NOT NULL,
  resend_id text UNIQUE,
  status text NOT NULL DEFAULT 'queued' CHECK (
    status IN ('queued', 'sent', 'delivered', 'bounced', 'complained', 'opened', 'clicked', 'failed')
  ),
  sent_at timestamptz,
  delivered_at timestamptz,
  opened_at timestamptz,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT prospect_emails_prospect_type_key UNIQUE (prospect_id, type)
);

CREATE INDEX idx_prospect_emails_prospect ON public.prospect_emails(prospect_id);
CREATE INDEX idx_prospect_emails_status ON public.prospect_emails(status);
CREATE INDEX idx_prospect_emails_resend
  ON public.prospect_emails(resend_id)
  WHERE resend_id IS NOT NULL;

ALTER TABLE public.prospect_emails ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.prospect_emails FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.prospect_emails TO service_role;

ALTER TABLE public.prospects
  ADD COLUMN unsubscribe_token uuid UNIQUE DEFAULT gen_random_uuid(),
  ADD COLUMN unsubscribed_at timestamptz;

CREATE INDEX idx_prospects_email ON public.prospects(LOWER(email)) WHERE email IS NOT NULL;
