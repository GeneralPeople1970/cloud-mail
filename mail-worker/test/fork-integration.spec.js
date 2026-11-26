import { createExecutionContext, env, fetchMock, SELF, waitOnExecutionContext } from 'cloudflare:test';
import { parseHTML } from 'linkedom';
import { beforeAll, describe, expect, it } from 'vitest';
import { notifyMailWs } from '../src/websocket/notify';

const origin = 'https://mail.example.test';
const imageUrl = new URL('https://images.example.test/photo.png');

async function api(path, options) {
	const response = await SELF.fetch(`${origin}/api/${path}`, options);
	return response.json();
}

function post(body, token) {
	return {
		method: 'POST',
		headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: token } : {}) },
		body: JSON.stringify(body),
	};
}

async function registerMailbox(email, password) {
	expect(await api('register', post({ email, password }))).toMatchObject({ code: 200 });
	return env.db.prepare('SELECT account_id, user_id FROM account WHERE email = ?').bind(email).first();
}

function receive(mailbox, subject, content = '') {
	return env.db.prepare('INSERT INTO email (account_id, user_id, subject, content) VALUES (?, ?, ?, ?) RETURNING email_id')
		.bind(mailbox.account_id, mailbox.user_id, subject, content).first('email_id');
}

async function notifyReceived(mailbox) {
	const emailId = await receive(mailbox, 'WebSocket notification');
	const email = { emailId, userId: mailbox.user_id, accountId: mailbox.account_id };
	const ctx = createExecutionContext();
	notifyMailWs(env, ctx, email);
	await waitOnExecutionContext(ctx);
	return email;
}

function nextMessage(socket) {
	return new Promise((resolve, reject) => {
		const timeout = setTimeout(() => reject(new Error('Timed out waiting for MailHub')), 2000);
		socket.addEventListener('message', event => {
			clearTimeout(timeout);
			resolve(event.data);
		}, { once: true });
	});
}

describe('fork mailbox routes', () => {
	let owner, other, ownerToken;

	beforeAll(async () => {
		const initialized = await SELF.fetch(`${origin}/api/init/${encodeURIComponent(env.jwt_secret)}`);
		expect(await initialized.text()).toBe('success');
		const domain = env.domain[0];
		const email = `owner@${domain}`;
		const password = crypto.randomUUID().slice(0, 24);
		owner = await registerMailbox(email, password);
		other = await registerMailbox(`other@${domain}`, password);
		const login = await api('login', post({ email, password }));
		expect(login.code).toBe(200);
		ownerToken = login.data.token;
	});

	it('serves signed images for shared messages without revealing another mailbox', async () => {
		const sharedId = await receive(owner, 'shared', `<img src="${imageUrl.href}">`);
		const privateId = await receive(other, 'private');
		const share = await api('emailShare/save', post({ accountId: owner.account_id }, ownerToken));
		expect(share.code).toBe(200);
		const list = await api(`emailShare/public/list?token=${encodeURIComponent(share.data.token)}`);
		expect(list.code).toBe(200);
		expect(list.data.latestEmail).toEqual({ emailId: sharedId, accountId: owner.account_id, userId: owner.user_id });
		const route = `emailShare/public/detail?token=${encodeURIComponent(share.data.token)}&emailId=`;
		const denied = await api(route + privateId);
		expect(denied.code).toBe(404);
		expect(denied.data).toBeUndefined();
		const detail = await api(route + sharedId);
		expect(detail.code).toBe(200);
		const { document } = parseHTML(detail.data.email.content);
		const src = document.querySelector('img').getAttribute('src');
		const proxy = new URL(src, origin);
		expect(proxy.origin).toBe(origin);
		expect(proxy.pathname).toBe('/proxy');
		expect(proxy.searchParams.get('url')).toBe(imageUrl.href);
		expect(src).not.toContain(ownerToken);
		expect(src).not.toContain(share.data.token);

		fetchMock.activate();
		fetchMock.disableNetConnect();
		try {
			fetchMock.get(imageUrl.origin).intercept({ path: imageUrl.pathname })
				.reply(200, 'test-image', { headers: { 'Content-Type': 'image/png' } });
			const image = await SELF.fetch(proxy.href);
			expect(image.status).toBe(200);
			expect(image.headers.get('content-type')).toBe('image/png');
			expect(await image.text()).toBe('test-image');
			fetchMock.assertNoPendingInterceptors();
			proxy.searchParams.delete('sig');
			expect((await SELF.fetch(proxy.href)).status).toBe(403);
		} finally {
			fetchMock.deactivate();
		}
	});

	it('fetches only the first message for the owner after an empty aggregate inbox cursor', async () => {
		const headers = { Authorization: ownerToken };
		const empty = await api('email/list?accountId=0&full=0', { headers });
		expect(empty.code).toBe(200);
		expect(empty.data.latestEmail.emailId).toBe(0);
		const firstId = await receive(owner, 'first message');
		await receive(other, 'different mailbox');
		const latest = await api(`email/latest?accountId=0&emailId=${empty.data.latestEmail.emailId}`, { headers });
		expect(latest.code).toBe(200);
		expect(latest.data.map(message => message.emailId)).toEqual([firstId]);
	});

	it('replies to heartbeats and delivers only the signed-in user’s inbox notification', async () => {
		const response = await SELF.fetch(`${origin}/realtime?token=${encodeURIComponent(ownerToken)}`, {
			headers: { Upgrade: 'websocket', Origin: origin },
		});
		expect(response.status).toBe(101);
		const socket = response.webSocket;
		const closed = new Promise(resolve => socket.addEventListener('close', resolve, { once: true }));
		socket.accept();
		try {
			const pong = nextMessage(socket);
			socket.send('ping');
			expect(await pong).toBe('pong');
			const notification = nextMessage(socket);
			await notifyReceived(other);
			const email = await notifyReceived(owner);
			expect(JSON.parse(await notification)).toEqual({ type: 'new_message', ...email });
		} finally {
			socket.close(1000, 'Done');
			await closed;
		}
	});
});

it('closes unauthenticated realtime subscriptions without mailbox notifications', async () => {
	const response = await SELF.fetch(`${origin}/realtime`, { headers: { Upgrade: 'websocket', Origin: origin } });
	expect(response.status).toBe(101);
	const socket = response.webSocket;
	const messages = [];
	socket.addEventListener('message', event => {
		messages.push(JSON.parse(event.data));
	});
	const closed = new Promise(resolve => socket.addEventListener('close', event => resolve(event.code), { once: true }));
	socket.accept();
	try {
		expect(await closed).toBe(4401);
		expect(messages).toEqual([{ type: 'error', code: 401 }]);
	} finally {
		socket.close();
	}
});
