import { Scenario } from '../types';
import { estateMessages } from '../fixtures/estate.fixtures';

const ISO = (d: string) => new Date(d).toISOString();

export const estateScenarios: Scenario[] = [
  {
    id: 'estate.viewing-then-offer',
    vertical: 'estate',
    description:
      'Lead views property, then submits an offer in chat. Operator searches "who put down 720k" — should find Lara.',
    setup: [
      {
        kind: 'fact',
        entityRef: { vertical: 'estate', id: 'lara' },
        predicate: 'name',
        object: 'Lara Petrova',
        validFrom: ISO('2026-04-20'),
        confidence: 0.95,
        source: { vertical: 'estate' },
      },
      {
        kind: 'fact',
        entityRef: { vertical: 'estate', id: 'lara' },
        predicate: 'interacted_with',
        object: 'viewed property: 12 Oakridge 3-bed',
        validFrom: ISO('2026-04-30'),
        confidence: 0.9,
        source: { vertical: 'estate', eventId: 'storefront.viewing.completed' },
      },
      {
        kind: 'mention',
        text: estateMessages.laraOffer,
        contextRef: { vertical: 'estate', conversationId: 'conv_lara_offer' },
        knownEntities: [{ vertical: 'estate', id: 'lara', role: 'speaker' }],
        emittedAt: ISO('2026-05-01'),
        // laraOffer text states intent to offer + reports having
        // viewed the property. Generic `said` is suppressed.
        expectedPredicates: ['intent', 'interacted_with'],
      },
      // Distractor — different lead, different price point
      {
        kind: 'fact',
        entityRef: { vertical: 'estate', id: 'oleg' },
        predicate: 'name',
        object: 'Oleg Karpov',
        validFrom: ISO('2026-04-20'),
        source: { vertical: 'estate' },
      },
    ],
    queries: [
      {
        query: 'leads who made an offer recently',
        expectedTopEntityRef: 'estate.lara',
      },
      {
        query: 'who is interested in 12 Oakridge',
        expectedTopEntityRef: 'estate.lara',
      },
      {
        query: 'Lara Petrova',
        expectedTopEntityRef: 'estate.lara',
        expectedFactPredicate: 'name',
      },
      {
        query: 'who viewed the Oakridge property',
        expectedTopEntityRef: 'estate.lara',
        expectedFactPredicate: 'interacted_with',
      },
    ],
  },
  {
    id: 'estate.budget-and-area',
    vertical: 'estate',
    description:
      'Two leads with overlapping search criteria. Disambiguates on stated budget + preferred area — both are common operator filters that the predicate-router has to route correctly.',
    setup: [
      {
        kind: 'fact',
        entityRef: { vertical: 'estate', id: 'mateo' },
        predicate: 'name',
        object: 'Mateo Ribeiro',
        validFrom: ISO('2026-04-15'),
        source: { vertical: 'estate' },
      },
      {
        kind: 'fact',
        entityRef: { vertical: 'estate', id: 'mateo' },
        predicate: 'preference',
        object: 'budget 850k EUR; 2-bed minimum',
        validFrom: ISO('2026-04-15'),
        source: { vertical: 'estate' },
      },
      {
        kind: 'fact',
        entityRef: { vertical: 'estate', id: 'mateo' },
        predicate: 'preference',
        object: 'preferred area: Mitte',
        validFrom: ISO('2026-04-15'),
        source: { vertical: 'estate' },
      },
      {
        kind: 'fact',
        entityRef: { vertical: 'estate', id: 'mateo' },
        predicate: 'interacted_with',
        object: 'requested viewing: 47 Augustenstraße',
        validFrom: ISO('2026-04-22'),
        source: { vertical: 'estate', eventId: 'storefront.viewing.requested' },
      },
      // Distractor with overlap on first name + similar budget
      {
        kind: 'fact',
        entityRef: { vertical: 'estate', id: 'mateo_galvao' },
        predicate: 'name',
        object: 'Mateo Galvão',
        validFrom: ISO('2026-04-10'),
        source: { vertical: 'estate' },
      },
      {
        kind: 'fact',
        entityRef: { vertical: 'estate', id: 'mateo_galvao' },
        predicate: 'preference',
        object: 'budget 600k EUR; 1-bed studio',
        validFrom: ISO('2026-04-10'),
        source: { vertical: 'estate' },
      },
    ],
    queries: [
      {
        query: 'lead with 850k budget',
        expectedTopEntityRef: 'estate.mateo',
        expectedFactPredicate: 'preference',
      },
      {
        query: 'who wants Mitte area',
        expectedTopEntityRef: 'estate.mateo',
        expectedFactPredicate: 'preference',
      },
      {
        query: 'requested viewing on Augustenstraße',
        expectedTopEntityRef: 'estate.mateo',
        expectedFactPredicate: 'interacted_with',
      },
    ],
  },
];
