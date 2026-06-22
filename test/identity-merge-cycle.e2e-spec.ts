/**
 * identity_of merge cycle-guard. Survivor resolution is single-hop, so a
 * mutual A↔B identity_of would leave BOTH entities with mergedInto set — and
 * both then vanish from retrieval (`WHERE mergedInto IS NONE`). The ingest
 * link path must reject a self-merge and any link that would close a cycle.
 */
import type { AppFixture } from './app-fixture';
import { createApp } from './app-fixture';

describe('identity_of merge cycle-guard', () => {
  let f: AppFixture;
  const auth = () => ({ Authorization: `Bearer ${f.apiKey}` });
  const src = { vertical: 'rent' };

  beforeAll(async () => {
    f = await createApp();
  });

  afterAll(async () => {
    if (f) await f.close();
  });

  it('allows a first identity_of merge, then rejects the reverse (cycle)', async () => {
    const a = { vertical: 'rent', id: 'merge_a' };
    const b = { vertical: 'rent', id: 'merge_b' };

    const first = await f.http
      .post('/v1/ingest/link')
      .set(auth())
      .send({ from: a, to: b, kind: 'identity_of', source: src });
    expect(first.status).toBe(201);

    // Reverse link would make a→b and b→a both merged → cycle. Reject.
    const reverse = await f.http
      .post('/v1/ingest/link')
      .set(auth())
      .send({ from: b, to: a, kind: 'identity_of', source: src });
    expect(reverse.status).toBe(400);
  });

  it('rejects a self-merge', async () => {
    const x = { vertical: 'rent', id: 'merge_self' };
    const res = await f.http
      .post('/v1/ingest/link')
      .set(auth())
      .send({ from: x, to: x, kind: 'identity_of', source: src });
    expect(res.status).toBe(400);
  });

  it('leaves a non-identity edge (related_to) untouched by the guard', async () => {
    const p = { vertical: 'rent', id: 'rel_p' };
    const q = { vertical: 'rent', id: 'rel_q' };
    const r1 = await f.http
      .post('/v1/ingest/link')
      .set(auth())
      .send({ from: p, to: q, kind: 'related_to', source: src });
    expect(r1.status).toBe(201);
    const r2 = await f.http
      .post('/v1/ingest/link')
      .set(auth())
      .send({ from: q, to: p, kind: 'related_to', source: src });
    expect(r2.status).toBe(201);
  });
});
