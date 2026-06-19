import type { Scenario } from '../types';

const ISO = (d: string) => new Date(d).toISOString();

/**
 * Phase 4 — multilingual / cross-lingual scenarios. Each scenario
 * seeds facts in two languages on the same entity, then queries
 * across the language boundary. The cross-lingual backoff path
 * (Phase 4.B) must surface the alternate-language fact when the
 * single-language first pass would otherwise miss it.
 *
 * The runner asserts `expectedTopEntityRef` against the canonical
 * external ref of the multilingual entity. recall@1 over this set
 * is the headline "cross-lingual retrieval" metric.
 */
export const multilingualScenarios: Scenario[] = [
  {
    id: 'multilingual.ru-fact-en-query',
    vertical: 'cross',
    description:
      'A Russian-tagged status fact must surface for an English query about the same role. Tests Phase 4.B cross-lingual backoff and Phase 4.A ingest lang-tagging.',
    setup: [
      {
        kind: 'fact',
        entityRef: { vertical: 'rent', id: 'multilingual_anya' },
        predicate: 'status',
        object: 'Технический директор',
        validFrom: ISO('2026-04-01'),
        source: { vertical: 'rent', eventId: 'auth.profile_updated' },
        confidence: 0.95,
      },
      {
        kind: 'fact',
        entityRef: { vertical: 'rent', id: 'distractor_boris' },
        predicate: 'status',
        object: 'sales representative',
        validFrom: ISO('2026-04-01'),
        source: { vertical: 'rent', eventId: 'auth.profile_updated' },
        confidence: 0.9,
      },
    ],
    queries: [
      {
        query: 'Who is the CTO of this tenant',
        expectedTopEntityRef: 'rent.multilingual_anya',
        expectedFactPredicate: 'status',
      },
    ],
  },
  {
    id: 'multilingual.en-fact-ru-query',
    vertical: 'cross',
    description:
      'Mirror case: English-tagged status fact must surface for a Russian-language query. Pure detection + backoff path through the Cyrillic branch.',
    setup: [
      {
        kind: 'fact',
        entityRef: { vertical: 'rent', id: 'multilingual_charlie' },
        predicate: 'status',
        object: 'Chief Engineering Officer',
        validFrom: ISO('2026-04-01'),
        source: { vertical: 'rent', eventId: 'auth.profile_updated' },
        confidence: 0.95,
      },
      {
        kind: 'fact',
        entityRef: { vertical: 'rent', id: 'distractor_dmitry' },
        predicate: 'status',
        object: 'Менеджер по продажам',
        validFrom: ISO('2026-04-01'),
        source: { vertical: 'rent', eventId: 'auth.profile_updated' },
        confidence: 0.9,
      },
    ],
    queries: [
      {
        query: 'кто руководит инженерным отделом',
        expectedTopEntityRef: 'rent.multilingual_charlie',
        expectedFactPredicate: 'status',
      },
    ],
  },
  {
    id: 'multilingual.same-language-no-backoff',
    vertical: 'cross',
    description:
      'Baseline: when both facts AND query are Russian, the filtered first pass alone should already win. Guards against a regression where the backoff path silently steals every win.',
    setup: [
      {
        kind: 'fact',
        entityRef: { vertical: 'rent', id: 'monolingual_ekaterina' },
        predicate: 'status',
        object: 'Финансовый директор',
        validFrom: ISO('2026-04-01'),
        source: { vertical: 'rent', eventId: 'auth.profile_updated' },
        confidence: 0.95,
      },
      {
        kind: 'fact',
        entityRef: { vertical: 'rent', id: 'distractor_fyodor' },
        predicate: 'status',
        object: 'Главный инженер',
        validFrom: ISO('2026-04-01'),
        source: { vertical: 'rent', eventId: 'auth.profile_updated' },
        confidence: 0.9,
      },
    ],
    queries: [
      {
        query: 'кто финансовый директор',
        expectedTopEntityRef: 'rent.monolingual_ekaterina',
        expectedFactPredicate: 'status',
      },
    ],
  },
];
