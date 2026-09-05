import app from '../hono/hono';
import result from '../model/result';
import userContext from '../security/user-context';
import emailShareService from '../service/email-share-service';

app.get('/emailShare/status', async (c) => {
	const data = await emailShareService.status(c, c.req.query(), userContext.getUserId(c));
	return c.json(result.ok(data));
});

app.get('/emailShare/list', async (c) => {
	const data = await emailShareService.list(c, c.req.query(), userContext.getUserId(c));
	return c.json(result.ok(data));
});

app.get('/emailShare/accountStatusMap', async (c) => {
	const data = await emailShareService.accountStatusMap(c, userContext.getUserId(c));
	return c.json(result.ok(data));
});

app.post('/emailShare/save', async (c) => {
	const data = await emailShareService.save(c, await c.req.json(), userContext.getUserId(c));
	return c.json(result.ok(data));
});

app.post('/emailShare/update', async (c) => {
	const data = await emailShareService.update(c, await c.req.json(), userContext.getUserId(c));
	return c.json(result.ok(data));
});

app.post('/emailShare/reset', async (c) => {
	const data = await emailShareService.reset(c, await c.req.json(), userContext.getUserId(c));
	return c.json(result.ok(data));
});

app.post('/emailShare/cancel', async (c) => {
	await emailShareService.cancel(c, await c.req.json(), userContext.getUserId(c));
	return c.json(result.ok());
});

app.delete('/emailShare/delete', async (c) => {
	await emailShareService.delete(c, c.req.query(), userContext.getUserId(c));
	return c.json(result.ok());
});

app.get('/emailShare/admin/status', async (c) => {
	const data = await emailShareService.adminStatus(c, c.req.query(), userContext.getUserId(c));
	return c.json(result.ok(data));
});

app.get('/emailShare/admin/list', async (c) => {
	const data = await emailShareService.adminList(c, c.req.query());
	return c.json(result.ok(data));
});

app.post('/emailShare/admin/save', async (c) => {
	const data = await emailShareService.adminSave(c, await c.req.json(), userContext.getUserId(c));
	return c.json(result.ok(data));
});

app.post('/emailShare/admin/batchSave', async (c) => {
	const data = await emailShareService.adminBatchSave(c, await c.req.json(), userContext.getUserId(c));
	return c.json(result.ok(data));
});

app.post('/emailShare/admin/update', async (c) => {
	const data = await emailShareService.adminUpdate(c, await c.req.json());
	return c.json(result.ok(data));
});

app.post('/emailShare/admin/reset', async (c) => {
	const data = await emailShareService.adminReset(c, await c.req.json(), userContext.getUserId(c));
	return c.json(result.ok(data));
});

app.post('/emailShare/admin/cancel', async (c) => {
	await emailShareService.adminCancel(c, await c.req.json());
	return c.json(result.ok());
});

app.delete('/emailShare/admin/delete', async (c) => {
	await emailShareService.adminDelete(c, c.req.query());
	return c.json(result.ok());
});

app.get('/emailShare/public/meta', async (c) => {
	const data = await emailShareService.publicMeta(c, c.req.query());
	return c.json(result.ok(data));
});

app.get('/emailShare/public/list', async (c) => {
	const data = await emailShareService.publicList(c, c.req.query());
	return c.json(result.ok(data));
});

app.get('/emailShare/public/latest', async (c) => {
	const data = await emailShareService.publicLatest(c, c.req.query());
	return c.json(result.ok(data));
});

app.get('/emailShare/public/detail', async (c) => {
	const data = await emailShareService.publicDetail(c, c.req.query());
	return c.json(result.ok(data));
});
