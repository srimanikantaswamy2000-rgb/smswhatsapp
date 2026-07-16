-- 045_ai_reply_cap_ceiling
--
-- Raise the per-conversation auto-reply cap ceiling from 20 to 50.
--
-- 029 set CHECK (auto_reply_max_per_conversation BETWEEN 1 AND 20). A
-- sales conversation (greet → qualify → recommend → benefits → finance
-- → book a demo → confirm) easily runs 25-30 turns; at 20 the agent
-- went silent mid-negotiation and the customer thought the dealership
-- had stopped replying. The app-side clamp (MAX_AUTO_REPLIES_CEILING)
-- is now 50, and this constraint must agree or a valid save is
-- rejected by the database.
--
-- The cap is only a backstop against a runaway loop; [[HANDOFF]] is the
-- real route to a human, so a higher ceiling is safe.

ALTER TABLE ai_configs
  DROP CONSTRAINT IF EXISTS ai_configs_auto_reply_max_per_conversation_check;

ALTER TABLE ai_configs
  ADD CONSTRAINT ai_configs_auto_reply_max_per_conversation_check
  CHECK (auto_reply_max_per_conversation BETWEEN 1 AND 50);
