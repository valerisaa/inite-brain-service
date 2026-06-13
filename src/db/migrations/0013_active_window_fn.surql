-- 0013_active_window_fn — fuzzy entity-name search index.
--
-- Sprint 1 of the SurrealDB feature audit. Originally bundled with
-- fn::active_window, but that function was unused by any caller at
-- ship time AND the migration runner rejects the whole file on any
-- syntax error — so a parser quirk in the function body would brick
-- every withCompany call for tenants that haven't applied 0013 yet.
-- The function is removed until a caller is wired up and the syntax
-- can be exercised end-to-end. The index — narrow, additive, no
-- dependency on any new construct — ships now.
--
-- entity_fuzzy_idx — the `prefix` analyzer (edgengram 2..15 +
-- lowercase + ascii) was declared in migration 0002 but never indexed
-- against a field. Indexed here on knowledge_entity.canonicalName with
-- BM25 so `@@`-driven fuzzy match handles typos / partials /
-- multilingual ("Marya" → "Maria Petrov") without the substring JS
-- filter that used to live in graphSearch.

DEFINE INDEX IF NOT EXISTS entity_fuzzy_idx ON knowledge_entity
  FIELDS canonicalName SEARCH ANALYZER prefix BM25;
