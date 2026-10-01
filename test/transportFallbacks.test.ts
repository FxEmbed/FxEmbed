import { runWithTransports } from '../packages/atmosphere/src/transports/run-with-fallbacks.js';

describe('runWithTransports', () => {
  it('stops after a non-retriable failure', async () => {
    const calls: number[] = [];
    const failure = new Error('not found');

    const result = runWithTransports<'bluesky', string>(
      { kind: 'public' },
      [{ kind: 'public' }],
      async (_transport, index) => {
        calls.push(index);
        return { ok: false, retriable: false, err: failure };
      }
    );

    await expect(result).rejects.toBe(failure);
    expect(calls).toEqual([0]);
  });

  it('tries the next transport after a retriable failure', async () => {
    const calls: number[] = [];

    const result = await runWithTransports<'bluesky', string>(
      { kind: 'public' },
      [{ kind: 'public' }],
      async (_transport, index) => {
        calls.push(index);
        return index === 0
          ? { ok: false, retriable: true, err: new Error('temporarily unavailable') }
          : { ok: true, value: 'fallback response' };
      }
    );

    expect(result).toBe('fallback response');
    expect(calls).toEqual([0, 1]);
  });
});
