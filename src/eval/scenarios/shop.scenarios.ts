import { Scenario } from '../types';

const ISO = (d: string) => new Date(d).toISOString();

export const shopScenarios: Scenario[] = [
  {
    id: 'shop.repeat-buyer-pattern',
    vertical: 'shop',
    description:
      'Repeat customer with multiple orders, including one return. Operator looks for "frequent buyers with returns".',
    setup: [
      {
        kind: 'fact',
        entityRef: { vertical: 'shop', id: 'maya' },
        predicate: 'name',
        object: 'Maya Tanaka',
        validFrom: ISO('2026-01-15'),
        source: { vertical: 'shop' },
      },
      {
        kind: 'fact',
        entityRef: { vertical: 'shop', id: 'maya' },
        predicate: 'tier',
        object: 'silver',
        validFrom: ISO('2026-02-01'),
        source: { vertical: 'shop' },
      },
      {
        kind: 'fact',
        entityRef: { vertical: 'shop', id: 'maya' },
        predicate: 'interacted_with',
        object: 'placed order #4101 for headphones',
        validFrom: ISO('2026-03-04'),
        source: { vertical: 'shop', eventId: 'storefront.order.created' },
      },
      {
        kind: 'fact',
        entityRef: { vertical: 'shop', id: 'maya' },
        predicate: 'interacted_with',
        object: 'returned order #4101 due to faulty hinge',
        validFrom: ISO('2026-03-09'),
        source: { vertical: 'shop' },
      },
      {
        kind: 'fact',
        entityRef: { vertical: 'shop', id: 'maya' },
        predicate: 'interacted_with',
        object: 'placed order #4187 for replacement headphones',
        validFrom: ISO('2026-03-12'),
        source: { vertical: 'shop', eventId: 'storefront.order.created' },
      },
      // Distractor
      {
        kind: 'fact',
        entityRef: { vertical: 'shop', id: 'leo' },
        predicate: 'name',
        object: 'Leo Brandt',
        validFrom: ISO('2026-01-10'),
        source: { vertical: 'shop' },
      },
    ],
    queries: [
      {
        query: 'customers who returned a recent order',
        expectedTopEntityRef: 'shop.maya',
      },
      {
        query: 'who had issues with headphones order',
        expectedTopEntityRef: 'shop.maya',
      },
    ],
    // Synthesize / faithfulness smoke. Maya has 4 facts including a
    // return + a replacement order — a synthesized "what's going on
    // with Maya?" answer should ground in the interacted_with facts
    // without inventing details. Floor 0.85 = RAGAS production
    // convention; lenient guardrails so we score the answer rather
    // than punt to "no grounded evidence".
    synthesizeQueries: [
      {
        query: 'what happened with Maya Tanaka recent orders',
        faithfulnessFloor: 0.85,
      },
    ],
  },
];
