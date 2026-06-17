-- 0020_locale — language + script tags for facts and entities.
--
-- Phase 4.A of the must-have memory upgrade. Adds optional ISO 639-1
-- `lang` + ISO 15924 `script` fields to knowledge_fact and a
-- canonical-language hint on knowledge_entity. Nullable to preserve
-- back-compat: pre-Phase-4 facts have `lang IS NONE`, retrieval treats
-- NONE as "match any language".
--
-- The detector lives in src/ai/locale/language-detector.ts and runs
-- inside the ingest pipeline on the object text + source span. We do
-- not over-engineer the schema with code-switched per-clause tagging
-- (EMNLP 2025 consensus) on this iteration — Phase 4 first ships the
-- whole-fact tag, then a future iteration can refine to per-clause
-- when there's real demand.

DEFINE FIELD IF NOT EXISTS lang ON knowledge_fact TYPE option<string>
    ASSERT $value IS NONE OR string::len($value) >= 2;

DEFINE FIELD IF NOT EXISTS script ON knowledge_fact TYPE option<string>
    ASSERT $value IS NONE OR string::len($value) >= 4;

-- Index for the language-filtered first pass in retrieval. Entries
-- with NONE are excluded from the index automatically — the cross-
-- lingual second pass (no filter) picks them up.
DEFINE INDEX IF NOT EXISTS fact_lang_idx ON knowledge_fact
    FIELDS entityId, lang;

DEFINE FIELD IF NOT EXISTS preferredLanguage ON knowledge_entity
    TYPE option<string>
    ASSERT $value IS NONE OR string::len($value) >= 2;
