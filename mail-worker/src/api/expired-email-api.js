import app from '../hono/hono';
import emailService from '../service/email-service';
import result from '../model/result';

app.get('/expiredEmail/list', async (c) => {
	const data = await emailService.expiredList(c, c.req.query());
	return c.json(result.ok(data));
});

app.delete('/expiredEmail/delete', async (c) => {
	const data = await emailService.physicsDelete(c, c.req.query());
	return c.json(result.ok(data));
});

app.delete('/expiredEmail/batchDelete', async (c) => {
	const data = await emailService.expiredBatchDelete(c, c.req.query());
	return c.json(result.ok(data));
});
