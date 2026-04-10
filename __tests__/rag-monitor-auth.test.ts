import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@bull-board/api', () => ({ createBullBoard: vi.fn() }));
vi.mock('@bull-board/api/bullMQAdapter', () => ({ BullMQAdapter: vi.fn() }));
vi.mock('@bull-board/express', () => ({
  ExpressAdapter: class {
    setBasePath = vi.fn();
    getRouter = vi.fn(() => 'router');
  },
}));
vi.mock('../server/rag-bull', () => ({ getReindexQueue: async () => ({ name: 'reindex' }) }));

import express from 'express';
import { initRagMonitor } from '../server/rag-monitor';

beforeEach(() => vi.clearAllMocks());

describe('RAG monitor mounting', () => {
  it('mounts Bull Board without auth', async () => {
    const app: any = { use: vi.fn(), get: vi.fn() };

    await initRagMonitor(app as any);

    // Expect the app.use to have been called with '/admin/queues' and the router as second arg
    expect(app.use).toHaveBeenCalled();
    const call = app.use.mock.calls.find((c: any) => c[0] === '/admin/queues');
    expect(call).toBeDefined();
    // Second arg should be the router returned by serverAdapter.getRouter() which we mocked to return 'router'
    expect(call[1]).toBe('router');
  });
});