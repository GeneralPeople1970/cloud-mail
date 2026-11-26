import { env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import app from '../src/hono/webs';
import KvConst from '../src/const/kv-const';
import settingService from '../src/service/setting-service';

function requestInit(bindings = env) {
	return app.request(`/init/${encodeURIComponent(bindings.jwt_secret)}`, {}, bindings);
}

async function initialize(bindings = env) {
	const response = await requestInit(bindings);
	expect(response.status).toBe(200);
	expect(await response.text()).toBe('success');
}

async function seedLegacyShare() {
	const { db } = env;
	await db.batch([
		db.prepare(`CREATE TABLE email_share_link (
			share_link_id INTEGER PRIMARY KEY AUTOINCREMENT, account_id INTEGER NOT NULL, account_email TEXT NOT NULL,
			owner_user_id INTEGER NOT NULL, created_by_user_id INTEGER NOT NULL, link_type TEXT NOT NULL, token_hash TEXT NOT NULL,
			expire_time DATETIME, status INTEGER NOT NULL DEFAULT 0, create_time DATETIME, update_time DATETIME
		)`),
		db.prepare('CREATE UNIQUE INDEX idx_email_share_account_type ON email_share_link(account_id, link_type)'),
		db.prepare(`INSERT INTO email_share_link VALUES (
			21, 7, 'legacy@example.com', 42, 43, 'admin', 'original-hash', '2030-02-01', 1, '2025-04-01', '2025-05-01'
		)`),
	]);
}

describe('upstream and fork database migrations', () => {
	it('initializes an empty database before creating the admin and refreshing KV', async () => {
		await initialize({ ...env, password: crypto.randomUUID() });

		const cached = await env.kv.get(KvConst.SETTING, { type: 'json' });
		expect(cached).toMatchObject({
			autoRefresh: 2, loginVerify: 1, loginVerifyCount: 1,
			randomEmailLength: 10, randomEmailMode: 'letters,numbers', loginDarkenFactor: 0,
		});
		const adminQuery = env.db.prepare('SELECT user_id, password, salt FROM user WHERE email = ?').bind(env.admin);
		const admin = await adminQuery.first();
		expect(admin).not.toBeNull();
		expect(await env.db.prepare('SELECT user_id FROM account WHERE email = ?').bind(env.admin).first('user_id')).toBe(admin.user_id);
		await initialize({ ...env, password: crypto.randomUUID() });
		expect(await adminQuery.first()).toEqual(admin);
		expect(await env.db.prepare("SELECT name FROM sqlite_master WHERE name = 'idx_email_user_create_time'").first('name')).toBe('idx_email_user_create_time');
	});

	it('upgrades and reopens a populated fork without changing its settings, grants or links', async () => {
		await initialize();
		const cached = await env.kv.get(KvConst.SETTING, { type: 'json' });
		await env.kv.put(KvConst.SETTING, JSON.stringify({ ...cached, autoRefresh: 0 }));
		expect((await settingService.query({ env })).autoRefresh).toBe(1);

		const { db } = env;
		await db.batch([
			db.prepare('DROP INDEX idx_email_user_create_time'),
			db.prepare('ALTER TABLE setting DROP COLUMN login_verify'),
			db.prepare('ALTER TABLE setting DROP COLUMN login_verify_count'),
			db.prepare("UPDATE setting SET auto_refresh = 0, random_email_length = 18, sidebar_menu_config = 'inbox,debug'"),
			db.prepare('UPDATE role SET random_email_count = 8 WHERE role_id = 1'),
			db.prepare("INSERT INTO random_email_record (user_id, address) VALUES (42, 'kept@example.com')"),
			db.prepare(`INSERT INTO email_share_link (account_email, share_address, owner_user_id, created_by_user_id, link_type, source_type, token_hash, open_count)
				VALUES ('kept@example.com', 'kept@example.com', 42, 42, 'user', 'address', 'test-hash', 3)`),
		]);
		await initialize();
		expect(await env.kv.get(KvConst.SETTING, { type: 'json' })).toMatchObject({ autoRefresh: 1, loginVerify: 1, loginVerifyCount: 1 });

		await db.batch([
			db.prepare('UPDATE setting SET login_verify = 2'),
			db.prepare('ALTER TABLE setting DROP COLUMN login_verify_count'),
		]);
		await initialize();
		expect(await env.kv.get(KvConst.SETTING, { type: 'json' })).toMatchObject({
			autoRefresh: 1, loginVerify: 2, loginVerifyCount: 1, randomEmailLength: 18, sidebarMenuConfig: 'inbox,debug',
		});
		expect(await db.prepare('SELECT random_email_count FROM role WHERE role_id = 1').first('random_email_count')).toBe(8);
		expect(await db.prepare('SELECT address FROM random_email_record WHERE user_id = 42').first('address')).toBe('kept@example.com');
		expect(await db.prepare('SELECT share_address, open_count FROM email_share_link WHERE token_hash = ?').bind('test-hash').first())
			.toEqual({ share_address: 'kept@example.com', open_count: 3 });
	});

	it('rebuilds the legacy account-only share schema without losing link identity or metadata', async () => {
		await seedLegacyShare();
		const { db } = env;
		const original = await db.prepare('SELECT * FROM email_share_link WHERE share_link_id = 21').first();
		await initialize();
		await initialize();
		expect(await db.prepare('SELECT * FROM email_share_link WHERE share_link_id = 21').first())
			.toEqual({ ...original, share_address: original.account_email, source_type: 'account', open_count: 0 });
		expect(await db.prepare(`SELECT "notnull" FROM pragma_table_info('email_share_link') WHERE name = 'account_id'`).first('notnull')).toBe(0);
	});

	it('rolls back the entire share rebuild when a unique index cannot be restored', async () => {
		await seedLegacyShare();
		const { db } = env;
		await db.prepare(`INSERT INTO email_share_link (account_id, account_email, owner_user_id, created_by_user_id, link_type, token_hash)
			VALUES (8, 'duplicate@example.com', 42, 43, 'admin', 'original-hash')`).run();
		const original = await db.prepare('SELECT * FROM email_share_link ORDER BY share_link_id').all();
		const response = await requestInit();
		expect(response.status).toBe(500);
		expect(await response.text()).not.toBe('success');
		expect((await db.prepare('SELECT * FROM email_share_link ORDER BY share_link_id').all()).results).toEqual(original.results);
		expect(await db.prepare(`SELECT "notnull" FROM pragma_table_info('email_share_link') WHERE name = 'account_id'`).first('notnull')).toBe(1);
		expect(await db.prepare("SELECT name FROM sqlite_master WHERE name = 'email_share_link_v3_4_old'").first()).toBeNull();
		expect(await env.kv.get(KvConst.SETTING)).toBeNull();
	});

	it.each([false, true])('leaves an interrupted migration untouched when the live table exists: %s', async (withLiveTable) => {
		await seedLegacyShare();
		const { db } = env;
		await db.prepare('ALTER TABLE email_share_link RENAME TO email_share_link_v3_4_old').run();
		if (withLiveTable) {
			await db.batch([
				db.prepare('CREATE TABLE email_share_link (marker TEXT)'),
				db.prepare("INSERT INTO email_share_link VALUES ('keep both')"),
			]);
		}
		const response = await requestInit();
		expect(response.status).toBe(409);
		expect(await response.text()).toContain('email_share_link_v3_4_old');
		expect(await db.prepare('SELECT token_hash FROM email_share_link_v3_4_old WHERE share_link_id = 21').first('token_hash')).toBe('original-hash');
		if (withLiveTable) {
			expect(await db.prepare('SELECT marker FROM email_share_link').first('marker')).toBe('keep both');
		} else {
			expect(await db.prepare("SELECT name FROM sqlite_master WHERE name = 'email_share_link'").first()).toBeNull();
		}
		expect(await env.kv.get(KvConst.SETTING)).toBeNull();
	});
});
