import { env, createExecutionContext, waitOnExecutionContext, SELF } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';
import worker from '../src';

describe('mail-worker', () => {
	it('responds with the frontend HTML for non-API requests (unit style)', async () => {
		const request = new Request('http://example.com/');
		const ctx = createExecutionContext();
		const response = await worker.fetch(request, env, ctx);
		await waitOnExecutionContext(ctx);

		expect(response.status).toBe(200);
		expect(response.headers.get('content-type')).toContain('text/html');
		const body = await response.text();
		expect(body).toContain('<title>Cloud Mail</title>');
	});

	it('rejects unknown API routes (integration style)', async () => {
		// /api/ prefix is stripped by the worker, then dispatched to the Hono app.
		// An unknown route has no handler, so it must not return the SPA HTML.
		const response = await SELF.fetch('http://example.com/api/does-not-exist');
		const body = await response.text();
		expect(body).not.toContain('<title>Cloud Mail</title>');
	});

	it('exposes the D1 and KV bindings from the test config', () => {
		expect(env.db).toBeDefined();
		expect(env.kv).toBeDefined();
	});
});
