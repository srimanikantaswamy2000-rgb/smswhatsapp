-- 040_ai_base_url
--
-- Optional OpenAI-compatible gateway base URL on ai_configs (e.g.
-- https://api.aicredits.in/v1). Null means the provider's default
-- endpoint. Only the OpenAI adapter honours it; Anthropic ignores it.
-- Plain text by design: it is an endpoint, not a secret.

ALTER TABLE ai_configs ADD COLUMN IF NOT EXISTS base_url TEXT;
