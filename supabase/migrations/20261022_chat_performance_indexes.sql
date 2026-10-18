-- Speed up recent-message history reads and use the same cosine operator as
-- match_clinic_documents (embedding_vector <=> p_query_embedding).
CREATE INDEX IF NOT EXISTS idx_messages_conversation_created_at
  ON public.messages (conversation_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_knowledge_embedding_cosine
  ON public.clinic_ai_knowledge
  USING ivfflat (embedding_vector vector_cosine_ops)
  WITH (lists = 100);
