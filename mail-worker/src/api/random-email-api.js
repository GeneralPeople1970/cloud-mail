import app from '../hono/hono';
import result from '../model/result';
import randomEmailService from '../service/random-email-service';
import userContext from '../security/user-context';

app.get('/randomEmail/quota', async (c) => {
	const data = await randomEmailService.quota(c, userContext.getUserId(c));
	return c.json(result.ok(data));
});

app.post('/randomEmail/generate', async (c) => {
	const data = await randomEmailService.generate(c, await c.req.json(), userContext.getUserId(c));
	return c.json(result.ok(data));
});

app.get('/randomEmail/list', async (c) => {
	const data = await randomEmailService.list(c, c.req.query());
	return c.json(result.ok(data));
});

app.get('/randomEmail/latest', async (c) => {
	const list = await randomEmailService.latest(c, c.req.query());
	return c.json(result.ok(list));
});
