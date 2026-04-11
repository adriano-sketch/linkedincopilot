-- LinkedIn ≠ email: cold outreach funciona bem em fim de semana.
-- Altera o default da coluna extension_status.active_days para os 7 dias.
-- Usuários existentes podem continuar com o valor anterior (apenas o default muda).
ALTER TABLE public.extension_status
  ALTER COLUMN active_days SET DEFAULT ARRAY['mon','tue','wed','thu','fri','sat','sun'];
