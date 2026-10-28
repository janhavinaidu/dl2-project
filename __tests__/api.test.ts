import { getSpeciesInfo } from '../src/api';

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

test('fetches species info for an encoded species name', async () => {
  const fetchMock = jest.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ summary: 'Summary.', fun_fact: 'Fact.' }),
  });
  globalThis.fetch = fetchMock as unknown as typeof fetch;

  const info = await getSpeciesInfo("Abbott's Babbler");

  expect(info).toEqual({ summary: 'Summary.', fun_fact: 'Fact.' });
  expect(fetchMock.mock.calls[0][0]).toContain(
    '/species?name=Abbott%27s+Babbler',
  );
});

test('surfaces the server error detail', async () => {
  globalThis.fetch = jest.fn().mockResolvedValue({
    ok: false,
    status: 503,
    json: async () => ({ detail: 'GROQ_API_KEY is not set on the server' }),
  }) as unknown as typeof fetch;

  await expect(getSpeciesInfo('ABBOTTS BABBLER')).rejects.toThrow(
    'GROQ_API_KEY is not set on the server',
  );
});
