import settingService from '../service/setting-service';
import userService from '../service/user-service';

const dbInit = {
	async init(c) {

		const secret = c.req.param('secret');

		if (secret !== c.env.jwt_secret) {
			return c.text('❌ JWT secret mismatch');
		}

		try {
			const backup = await c.env.db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'email_share_link_v3_4_old'").first();
			if (backup) {
				return c.text('Interrupted share migration: email_share_link_v3_4_old exists. Back up and reconcile the share tables before retrying.', 409);
			}
			await this.intDB(c);
			await this.v2_3DB(c);
			await this.v2_4DB(c);
			await this.v2_5DB(c);
			await this.v2_6DB(c);
			await this.v2_7DB(c);
			await this.v2_8DB(c);
			await this.v3_0DB(c);
			await this.v3_1DB(c);
			await this.v3_2DB(c);
			await this.v3_3DB(c);
			await this.v3_4DB(c);
			await this.v3_5DB(c);
			await this.v3_6DB(c);
			// fork 专属迁移使用 forkVxDB 命名，避免与上游的 vX_YDB 版本号重名被覆盖
			await this.forkV1DB(c);
			await this.forkV2DB(c);
			await this.forkV3DB(c);
			await userService.initAdmin(c);
			await settingService.refresh(c);
			return c.text('success');
		} catch (error) {
			console.error('Database initialization failed:', error);
			return c.text('Database initialization failed. Check the Worker logs before retrying.', 500);
		}
	},
	async forkV3DB(c) {
		const { db } = c.env;
		await this.addColumnIfMissing(c, 'role', 'random_email_count', `ALTER TABLE role ADD COLUMN random_email_count INTEGER NOT NULL DEFAULT 0;`);
		await db.batch([
			db.prepare(`UPDATE email_share_link SET share_address = account_email WHERE share_address = '';`),
			db.prepare(`
				CREATE TABLE IF NOT EXISTS email_share_visit (
					visit_id INTEGER PRIMARY KEY AUTOINCREMENT,
					share_link_id INTEGER NOT NULL,
					ip TEXT NOT NULL,
					last_count_time DATETIME DEFAULT CURRENT_TIMESTAMP
				)
			`),
			db.prepare(`CREATE INDEX IF NOT EXISTS idx_email_share_visit_link_ip ON email_share_visit(share_link_id, ip);`),
			db.prepare(`
				CREATE TABLE IF NOT EXISTS random_email_record (
					record_id INTEGER PRIMARY KEY AUTOINCREMENT,
					user_id INTEGER NOT NULL,
					address TEXT NOT NULL,
					create_time DATETIME DEFAULT CURRENT_TIMESTAMP
				)
			`),
			db.prepare(`CREATE UNIQUE INDEX IF NOT EXISTS idx_random_email_record_user_address ON random_email_record(user_id, address);`),
			db.prepare(`CREATE INDEX IF NOT EXISTS idx_random_email_record_user ON random_email_record(user_id);`),
		]);
	},

	async forkV2DB(c) {
		const { db } = c.env;
		const { results: columns } = await db.prepare(`SELECT name, "notnull" FROM pragma_table_info('email_share_link')`).all();
		const rebuild = columns.some(column => column.name === 'account_id' && Number(column.notnull) === 1);
		const statements = [];
		if (columns.length) {
			const additions = {
				share_address: "TEXT NOT NULL DEFAULT ''",
				source_type: "TEXT NOT NULL DEFAULT 'account'",
				open_count: 'INTEGER NOT NULL DEFAULT 0',
			};
			for (const [name, definition] of Object.entries(additions)) {
				if (!columns.some(column => column.name === name)) {
					statements.push(db.prepare(`ALTER TABLE email_share_link ADD COLUMN ${name} ${definition}`));
				}
			}
		}
		if (rebuild) {
			statements.push(db.prepare('ALTER TABLE email_share_link RENAME TO email_share_link_v3_4_old'));
		}
		statements.push(db.prepare(`
			CREATE TABLE IF NOT EXISTS email_share_link (
				share_link_id INTEGER PRIMARY KEY AUTOINCREMENT,
				account_id INTEGER,
				account_email TEXT NOT NULL,
				share_address TEXT NOT NULL DEFAULT '',
				owner_user_id INTEGER NOT NULL,
				created_by_user_id INTEGER NOT NULL,
				link_type TEXT NOT NULL,
				source_type TEXT NOT NULL DEFAULT 'account',
				token_hash TEXT NOT NULL,
				expire_time DATETIME,
				status INTEGER NOT NULL DEFAULT 0,
				open_count INTEGER NOT NULL DEFAULT 0,
				create_time DATETIME DEFAULT CURRENT_TIMESTAMP,
				update_time DATETIME DEFAULT CURRENT_TIMESTAMP
			)
		`));
		if (rebuild) {
			statements.push(
				db.prepare(`INSERT INTO email_share_link (
					share_link_id, account_id, account_email, share_address, owner_user_id, created_by_user_id,
					link_type, source_type, token_hash, expire_time, status, open_count, create_time, update_time
				) SELECT share_link_id, account_id, account_email, CASE WHEN share_address = '' THEN account_email ELSE share_address END,
					owner_user_id, created_by_user_id, link_type, source_type, token_hash, expire_time, status, open_count, create_time, update_time
				FROM email_share_link_v3_4_old`),
				db.prepare('DROP TABLE email_share_link_v3_4_old'),
			);
		}
		statements.push(
			db.prepare('CREATE UNIQUE INDEX IF NOT EXISTS idx_email_share_account_type ON email_share_link(account_id, link_type)'),
			db.prepare('CREATE UNIQUE INDEX IF NOT EXISTS idx_email_share_token_hash ON email_share_link(token_hash)'),
			db.prepare('CREATE INDEX IF NOT EXISTS idx_email_share_owner ON email_share_link(owner_user_id, status)'),
			db.prepare('CREATE INDEX IF NOT EXISTS idx_email_share_address ON email_share_link(share_address, link_type)'),
		);
		await db.batch(statements);
	},

	async forkV1DB(c) {
		await this.addColumnIfMissing(c, 'setting', 'random_email_subdomains', `ALTER TABLE setting ADD COLUMN random_email_subdomains TEXT NOT NULL DEFAULT '';`);
		await this.addColumnIfMissing(c, 'setting', 'random_email_length', `ALTER TABLE setting ADD COLUMN random_email_length INTEGER NOT NULL DEFAULT 10;`);
		await this.addColumnIfMissing(c, 'setting', 'random_email_mode', `ALTER TABLE setting ADD COLUMN random_email_mode TEXT NOT NULL DEFAULT 'letters,numbers';`);
		await this.addColumnIfMissing(c, 'setting', 'random_email_domain_source', `ALTER TABLE setting ADD COLUMN random_email_domain_source TEXT NOT NULL DEFAULT 'cloudflare';`);
		await this.addColumnIfMissing(c, 'setting', 'random_email_domain_list', `ALTER TABLE setting ADD COLUMN random_email_domain_list TEXT NOT NULL DEFAULT '';`);
		await this.addColumnIfMissing(c, 'setting', 'debug', `ALTER TABLE setting ADD COLUMN debug INTEGER NOT NULL DEFAULT 0;`);
		await this.addColumnIfMissing(c, 'setting', 'auth_domain_source', `ALTER TABLE setting ADD COLUMN auth_domain_source TEXT NOT NULL DEFAULT 'cloudflare';`);
		await this.addColumnIfMissing(c, 'setting', 'auth_domain_list', `ALTER TABLE setting ADD COLUMN auth_domain_list TEXT NOT NULL DEFAULT '';`);
		await this.addColumnIfMissing(c, 'setting', 'sidebar_menu_config', `ALTER TABLE setting ADD COLUMN sidebar_menu_config TEXT NOT NULL DEFAULT '';`);
	},

	async addColumnIfMissing(c, table, column, sql) {
		if (!/^[a-z_]+$/.test(table) || !/^[a-z_]+$/.test(column)) {
			throw new Error('Invalid table or column name');
		}
		const lookup = c.env.db.prepare(`SELECT 1 FROM pragma_table_info('${table}') WHERE name = ? LIMIT 1`).bind(column);
		if (await lookup.first()) {
			return;
		}

		try {
			await c.env.db.prepare(sql).run();
		} catch (error) {
			if (!await lookup.first()) throw error;
		}
	},

	async v3_6DB(c) {
		// 保留当前的 1（关闭）和 2（开启），只转换旧版的关闭值和刷新间隔。
		await c.env.db.prepare(`
			UPDATE setting SET auto_refresh = CASE WHEN auto_refresh = 0 THEN 1 ELSE 2 END
			WHERE auto_refresh NOT IN (1, 2)
		`).run();

		await this.addColumnIfMissing(c, 'setting', 'login_verify', `ALTER TABLE setting ADD COLUMN login_verify INTEGER NOT NULL DEFAULT 1`);
		await this.addColumnIfMissing(c, 'setting', 'login_verify_count', `ALTER TABLE setting ADD COLUMN login_verify_count INTEGER NOT NULL DEFAULT 1`);
	},

	async v3_5DB(c) {
		await c.env.db.prepare(`CREATE INDEX IF NOT EXISTS idx_email_user_create_time ON email(user_id, create_time)`).run();
	},

	async v3_4DB(c) {
		try {
			await c.env.db.prepare(`ALTER TABLE email ADD COLUMN sender_email TEXT NOT NULL DEFAULT '';`).run();
		} catch (e) {
			console.warn(`sql skip:${e.message}`);
		}
	},

	async v3_3DB(c) {
		try {
			await c.env.db.batch([
				c.env.db.prepare(`ALTER TABLE setting ADD COLUMN auto_clean_days INTEGER NOT NULL DEFAULT 0;`),
				c.env.db.prepare(`ALTER TABLE setting ADD COLUMN auto_clean_exclude TEXT NOT NULL DEFAULT '';`),
				c.env.db.prepare(`CREATE INDEX IF NOT EXISTS idx_email_create_time ON email(create_time)`)
			]);
		} catch (e) {
			console.warn(`sql skip:${e.message}`);
		}

		try {
			await c.env.db.batch([
				c.env.db.prepare(`ALTER TABLE setting ADD COLUMN webhook_url TEXT NOT NULL DEFAULT '';`),
				c.env.db.prepare(`ALTER TABLE setting ADD COLUMN webhook_status INTEGER NOT NULL DEFAULT 1;`),
				c.env.db.prepare(`ALTER TABLE setting ADD COLUMN webhook_retry INTEGER NOT NULL DEFAULT 0;`),
				c.env.db.prepare(`ALTER TABLE setting ADD COLUMN webhook_secret TEXT NOT NULL DEFAULT '';`)
			]);
		} catch (e) {
			console.warn(`sql skip:${e.message}`);
		}
	},

	async v3_2DB(c) {
		try {
			await c.env.db.batch([
				await c.env.db.prepare(`ALTER TABLE setting ADD COLUMN linuxdo_client_id TEXT NOT NULL DEFAULT '';`),
				await c.env.db.prepare(`ALTER TABLE setting ADD COLUMN linuxdo_client_secret TEXT NOT NULL DEFAULT '';`),
				await c.env.db.prepare(`ALTER TABLE setting ADD COLUMN github_client_id TEXT NOT NULL DEFAULT '';`),
				await c.env.db.prepare(`ALTER TABLE setting ADD COLUMN github_client_secret TEXT NOT NULL DEFAULT '';`),
				await c.env.db.prepare(`ALTER TABLE setting ADD COLUMN google_client_id TEXT NOT NULL DEFAULT '';`),
				await c.env.db.prepare(`ALTER TABLE setting ADD COLUMN google_client_secret TEXT NOT NULL DEFAULT '';`),
				await c.env.db.prepare(`ALTER TABLE setting ADD COLUMN linuxdo_switch INTEGER NOT NULL DEFAULT 1;`),
				await c.env.db.prepare(`ALTER TABLE setting ADD COLUMN github_switch INTEGER NOT NULL DEFAULT 1;`),
				await c.env.db.prepare(`ALTER TABLE setting ADD COLUMN google_switch INTEGER NOT NULL DEFAULT 1;`)
			]);
		} catch (e) {
			console.warn(`sql skip:${e.message}`);
		}

		try {
			await c.env.db.batch([
				c.env.db.prepare(`CREATE INDEX IF NOT EXISTS idx_email_list_user ON email(user_id, type, is_del, email_id)`),
				c.env.db.prepare(`CREATE INDEX IF NOT EXISTS idx_email_list_account ON email(user_id, account_id, type, is_del, email_id)`),
				c.env.db.prepare(`CREATE INDEX IF NOT EXISTS idx_star_user_email ON star(user_id, email_id)`),
				c.env.db.prepare(`CREATE INDEX IF NOT EXISTS idx_star_email_user ON star(email_id, user_id)`),
				c.env.db.prepare(`CREATE INDEX IF NOT EXISTS idx_email_name_nocase ON email(name COLLATE NOCASE)`),
				c.env.db.prepare(`CREATE INDEX IF NOT EXISTS idx_email_subject_nocase ON email(subject COLLATE NOCASE)`),
				c.env.db.prepare(`CREATE INDEX IF NOT EXISTS idx_user_email_nocase ON user(email COLLATE NOCASE)`),
				c.env.db.prepare(`CREATE INDEX IF NOT EXISTS idx_email_to_email_nocase ON email(to_email COLLATE NOCASE)`),
				c.env.db.prepare(`CREATE INDEX IF NOT EXISTS idx_email_send_email_nocase ON email(send_email COLLATE NOCASE)`),
				c.env.db.prepare(`CREATE INDEX IF NOT EXISTS idx_email_noone_id ON email(email_id) WHERE status = 7`),
				c.env.db.prepare(`CREATE INDEX IF NOT EXISTS idx_email_type_id ON email(type, email_id)`),
				c.env.db.prepare(`CREATE INDEX IF NOT EXISTS idx_account_user_del_sort ON account(user_id, is_del, sort, account_id)`),
				c.env.db.prepare(`CREATE INDEX IF NOT EXISTS idx_email_saving_account ON email(account_id) WHERE status = 6`),
				c.env.db.prepare(`CREATE INDEX IF NOT EXISTS idx_email_type_name ON email(type, name)`),
				c.env.db.prepare(`CREATE INDEX IF NOT EXISTS idx_email_type_create_time ON email(type, create_time)`),
				c.env.db.prepare(`CREATE INDEX IF NOT EXISTS idx_user_create_time ON user(create_time)`),
				c.env.db.prepare(`CREATE INDEX IF NOT EXISTS idx_user_type ON user(type)`),
				c.env.db.prepare(`CREATE INDEX IF NOT EXISTS idx_attachments_email_type ON attachments(email_id, type)`),
				c.env.db.prepare(`CREATE INDEX IF NOT EXISTS idx_role_perm_role ON role_perm(role_id)`),
				c.env.db.prepare(`CREATE INDEX IF NOT EXISTS idx_oauth_oauth_user_id ON oauth(oauth_user_id)`),
				c.env.db.prepare(`CREATE INDEX IF NOT EXISTS idx_oauth_user_id ON oauth(user_id)`)
			]);
		} catch (e) {
			console.warn(`跳过索引：${e.message}`);
		}
	},

	async v3_1DB(c) {
		try {
			await c.env.db.prepare(`ALTER TABLE setting ADD COLUMN sync_delete INTEGER NOT NULL DEFAULT 0;`).run();
		} catch (e) {
			console.warn(`sql skip:${e.message}`);
		}
		await this.addColumnIfMissing(c, 'setting', 'login_darken_factor', `ALTER TABLE setting ADD COLUMN login_darken_factor INTEGER NOT NULL DEFAULT 0;`);
	},


	async v3_0DB(c) {
		try {
			await c.env.db.batch([
				await c.env.db.prepare(`ALTER TABLE email ADD COLUMN code TEXT NOT NULL DEFAULT '';`),
				await c.env.db.prepare(`ALTER TABLE setting ADD COLUMN ai_code INTEGER NOT NULL DEFAULT 1;`),
				await c.env.db.prepare(`ALTER TABLE setting ADD COLUMN ai_code_filter TEXT NOT NULL DEFAULT '';`)
			]);
		} catch (e) {
			console.warn(`sql skip:${e.message}`);
		}

		try {
			await c.env.db.batch([
				c.env.db.prepare(`ALTER TABLE setting ADD COLUMN black_subject TEXT NOT NULL DEFAULT '';`),
				c.env.db.prepare(`ALTER TABLE setting ADD COLUMN black_content TEXT NOT NULL DEFAULT '';`),
				c.env.db.prepare(`ALTER TABLE setting ADD COLUMN black_from TEXT NOT NULL DEFAULT '';`)
			]);
		} catch (e) {
			console.warn(`sql skip:${e.message}`);
		}

	},

	async v2_8DB(c) {
		try {
			await c.env.db.batch([
				c.env.db.prepare(`ALTER TABLE account ADD COLUMN sort INTEGER NOT NULL DEFAULT 0;`)
			]);
		} catch (e) {
			console.warn(`sql skip:${e.message}`);
		}
	},

	async v2_7DB(c) {
		try {
			await c.env.db.batch([
				c.env.db.prepare(`ALTER TABLE setting RENAME COLUMN auto_refresh_time TO auto_refresh;`)
			]);
		} catch (e) {
			console.warn(`sql skip:${e.message}`);
		}
	},

	async v2_6DB(c) {
		try {
			await c.env.db.prepare(`ALTER TABLE account ADD COLUMN all_receive INTEGER NOT NULL DEFAULT 0;`).run();
		} catch (e) {
			console.warn(`sql skip:${e.message}`);
		}
	},

	async v2_5DB(c) {

		try {
			await c.env.db.prepare(`ALTER TABLE setting ADD COLUMN email_prefix_filter text NOT NULL DEFAULT '';`).run();
		} catch (e) {
			console.warn(`sql skip:${e.message}`);
		}

		try {
			await c.env.db.batch([
				c.env.db.prepare(`ALTER TABLE email ADD COLUMN unread INTEGER NOT NULL DEFAULT 0;`),
				c.env.db.prepare(`UPDATE email SET unread = 1;`)
			]);
		} catch (e) {
			console.warn(`sql skip:${e.message}`);
		}

	},

	async v2_4DB(c) {
		try {
			await c.env.db.prepare(`
				CREATE TABLE IF NOT EXISTS oauth (
					oauth_id INTEGER PRIMARY KEY AUTOINCREMENT,
					oauth_user_id TEXT,
					username TEXT,
					name TEXT,
					avatar TEXT,
					active INTEGER,
					trust_level INTEGER,
					silenced INTEGER,
					create_time DATETIME DEFAULT CURRENT_TIMESTAMP,
					platform INTEGER NOT NULL DEFAULT 0,
					user_id INTEGER NOT NULL DEFAULT 0
				)
			`).run();
		} catch (e) {
			console.warn(`sql skip:${e.message}`);
		}

		try {
			await c.env.db.prepare(`ALTER TABLE setting ADD COLUMN min_email_prefix INTEGER NOT NULL DEFAULT 1;`).run();
		} catch (e) {
			console.warn(`sql skip:${e.message}`);
		}

	},

	async v2_3DB(c) {
		try {
			await c.env.db.batch([
				c.env.db.prepare(`ALTER TABLE setting ADD COLUMN force_path_style	INTEGER NOT NULL DEFAULT 1;`),
				c.env.db.prepare(`ALTER TABLE setting ADD COLUMN custom_domain TEXT NOT NULL DEFAULT '';`),
				c.env.db.prepare(`ALTER TABLE setting ADD COLUMN tg_msg_to TEXT NOT NULL DEFAULT 'show';`),
				c.env.db.prepare(`ALTER TABLE setting ADD COLUMN tg_msg_from TEXT NOT NULL DEFAULT 'only-name';`)
			]);
		} catch (e) {
			console.warn(`sql skip:${e.message}`);
		}

		try {
			await c.env.db.prepare(`ALTER TABLE setting ADD COLUMN tg_msg_text TEXT NOT NULL DEFAULT 'show';`).run();
		} catch (e) {
			console.warn(`sql skip:${e.message}`);
		}

	},

	// 2.0 及之前：最终表结构一次 batch 建好，不再逐步 ALTER
	async intDB(c) {
		const noticeContent = 'This project is for learning and communication only. Illegal use is prohibited.<br>Please comply with local laws. The author assumes no legal liability.' +
			'<br><br>' +
			'本项目仅供学习交流，禁止用于违法业务。<br>请遵守当地法规，作者不承担任何法律责任。';

		try {
			await c.env.db.batch([
				c.env.db.prepare(`
					CREATE TABLE IF NOT EXISTS email (
						email_id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
						send_email TEXT,
						name TEXT,
						account_id INTEGER NOT NULL,
						user_id INTEGER NOT NULL,
						subject TEXT,
						create_time DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL,
						is_del INTEGER DEFAULT 0 NOT NULL,
						type INTEGER NOT NULL DEFAULT 0,
						status INTEGER NOT NULL DEFAULT 0,
						resend_email_id TEXT,
						message TEXT,
						recipient TEXT NOT NULL DEFAULT '[]',
						cc TEXT NOT NULL DEFAULT '[]',
						bcc TEXT NOT NULL DEFAULT '[]',
						message_id TEXT NOT NULL DEFAULT '',
						in_reply_to TEXT NOT NULL DEFAULT '',
						relation TEXT NOT NULL DEFAULT '',
						to_email TEXT NOT NULL DEFAULT '',
						to_name TEXT NOT NULL DEFAULT '',
						content TEXT,
						text TEXT
					)
				`),
				c.env.db.prepare(`
					CREATE TABLE IF NOT EXISTS star (
						star_id INTEGER PRIMARY KEY AUTOINCREMENT,
						user_id INTEGER NOT NULL,
						email_id INTEGER NOT NULL,
						create_time DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL
					)
				`),
				c.env.db.prepare(`
					CREATE TABLE IF NOT EXISTS attachments (
						att_id INTEGER PRIMARY KEY AUTOINCREMENT,
						user_id INTEGER NOT NULL,
						email_id INTEGER NOT NULL,
						account_id INTEGER NOT NULL,
						key TEXT NOT NULL,
						filename TEXT,
						mime_type TEXT,
						size INTEGER,
						disposition TEXT,
						related TEXT,
						content_id TEXT,
						encoding TEXT,
						create_time DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL,
						status INTEGER NOT NULL DEFAULT 0,
						type INTEGER NOT NULL DEFAULT 0
					)
				`),
				c.env.db.prepare(`
					CREATE TABLE IF NOT EXISTS user (
						user_id INTEGER PRIMARY KEY AUTOINCREMENT,
						email TEXT NOT NULL,
						type INTEGER DEFAULT 1 NOT NULL,
						password TEXT NOT NULL,
						salt TEXT NOT NULL,
						status INTEGER DEFAULT 0 NOT NULL,
						create_time DATETIME DEFAULT CURRENT_TIMESTAMP,
						active_time DATETIME,
						is_del INTEGER DEFAULT 0 NOT NULL,
						create_ip TEXT,
						active_ip TEXT,
						os TEXT,
						browser TEXT,
						device TEXT,
						sort INTEGER NOT NULL DEFAULT 0,
						send_count INTEGER NOT NULL DEFAULT 0,
						reg_key_id INTEGER NOT NULL DEFAULT 0
					)
				`),
				c.env.db.prepare(`
					CREATE TABLE IF NOT EXISTS account (
						account_id INTEGER PRIMARY KEY AUTOINCREMENT,
						email TEXT NOT NULL,
						name TEXT NOT NULL DEFAULT '',
						status INTEGER DEFAULT 0 NOT NULL,
						latest_email_time DATETIME,
						create_time DATETIME DEFAULT CURRENT_TIMESTAMP,
						user_id INTEGER NOT NULL,
						is_del INTEGER DEFAULT 0 NOT NULL
					)
				`),
				c.env.db.prepare(`
					CREATE TABLE IF NOT EXISTS setting (
						register INTEGER NOT NULL DEFAULT 0,
						receive INTEGER NOT NULL DEFAULT 0,
						add_email INTEGER NOT NULL DEFAULT 0,
						many_email INTEGER NOT NULL DEFAULT 0,
						title TEXT NOT NULL DEFAULT '',
						auto_refresh INTEGER NOT NULL DEFAULT 2,
						register_verify INTEGER NOT NULL DEFAULT 1,
						add_email_verify INTEGER NOT NULL DEFAULT 1,
						resend_tokens TEXT NOT NULL DEFAULT '{}',
						send INTEGER NOT NULL DEFAULT 0,
						r2_domain TEXT,
						site_key TEXT,
						secret_key TEXT,
						background TEXT,
						login_opacity INTEGER NOT NULL DEFAULT 0.90,
						tg_bot_token TEXT NOT NULL DEFAULT '',
						tg_chat_id TEXT NOT NULL DEFAULT '',
						tg_bot_status INTEGER NOT NULL DEFAULT 1,
						forward_email TEXT NOT NULL DEFAULT '',
						forward_status INTEGER NOT NULL DEFAULT 1,
						rule_email TEXT NOT NULL DEFAULT '',
						rule_type INTEGER NOT NULL DEFAULT 0,
						reg_key INTEGER NOT NULL DEFAULT 1,
						reg_verify_count INTEGER NOT NULL DEFAULT 1,
						add_verify_count INTEGER NOT NULL DEFAULT 1,
						notice_title TEXT NOT NULL DEFAULT 'Cloud Mail',
						notice_content TEXT NOT NULL DEFAULT '',
						notice_type TEXT NOT NULL DEFAULT 'none',
						notice_duration INTEGER NOT NULL DEFAULT 0,
						notice_offset INTEGER NOT NULL DEFAULT 0,
						notice_position TEXT NOT NULL DEFAULT 'top-right',
						notice_width INTEGER NOT NULL DEFAULT 340,
						notice INTEGER NOT NULL DEFAULT 0,
						no_recipient INTEGER NOT NULL DEFAULT 1,
						login_domain INTEGER NOT NULL DEFAULT 0,
						bucket TEXT NOT NULL DEFAULT '',
						region TEXT NOT NULL DEFAULT '',
						endpoint TEXT NOT NULL DEFAULT '',
						s3_access_key TEXT NOT NULL DEFAULT '',
						s3_secret_key TEXT NOT NULL DEFAULT ''
					)
				`),
				c.env.db.prepare(`
					CREATE TABLE IF NOT EXISTS perm (
						perm_id INTEGER PRIMARY KEY AUTOINCREMENT,
						name TEXT NOT NULL,
						perm_key TEXT,
						pid INTEGER NOT NULL DEFAULT 0,
						type INTEGER NOT NULL DEFAULT 2,
						sort INTEGER
					)
				`),
				c.env.db.prepare(`
					CREATE TABLE IF NOT EXISTS role (
						role_id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
						name TEXT NOT NULL,
						key TEXT,
						create_time DATETIME DEFAULT CURRENT_TIMESTAMP,
						sort INTEGER DEFAULT 0,
						description TEXT,
						user_id INTEGER,
						is_default INTEGER DEFAULT 0,
						send_count INTEGER,
						send_type TEXT NOT NULL DEFAULT 'count',
						account_count INTEGER,
						avail_domain TEXT NOT NULL DEFAULT '',
						ban_email TEXT NOT NULL DEFAULT '',
						ban_email_type INTEGER NOT NULL DEFAULT 0
					)
				`),
				c.env.db.prepare(`
					CREATE TABLE IF NOT EXISTS role_perm (
						id INTEGER PRIMARY KEY AUTOINCREMENT,
						role_id INTEGER,
						perm_id INTEGER
					)
				`),
				c.env.db.prepare(`
					CREATE TABLE IF NOT EXISTS reg_key (
						rege_key_id INTEGER PRIMARY KEY AUTOINCREMENT,
						code TEXT NOT NULL COLLATE NOCASE DEFAULT '',
						count INTEGER NOT NULL DEFAULT 0,
						role_id INTEGER NOT NULL DEFAULT 0,
						user_id INTEGER NOT NULL DEFAULT 0,
						expire_time DATETIME,
						create_time DATETIME DEFAULT CURRENT_TIMESTAMP
					)
				`),
				c.env.db.prepare(`
					CREATE TABLE IF NOT EXISTS verify_record (
						vr_id INTEGER PRIMARY KEY AUTOINCREMENT,
						ip TEXT NOT NULL DEFAULT '',
						count INTEGER NOT NULL DEFAULT 1,
						type INTEGER NOT NULL DEFAULT 0,
						update_time DATETIME DEFAULT CURRENT_TIMESTAMP
					)
				`),
				c.env.db.prepare(`CREATE INDEX IF NOT EXISTS idx_email_user_id_account_id ON email(user_id, account_id)`),
				c.env.db.prepare(`CREATE UNIQUE INDEX IF NOT EXISTS idx_account_email_nocase ON account (email COLLATE NOCASE)`),
				c.env.db.prepare(`CREATE UNIQUE INDEX IF NOT EXISTS idx_user_email_nocase ON user (email COLLATE NOCASE)`),
				c.env.db.prepare(`CREATE UNIQUE INDEX IF NOT EXISTS idx_setting_code ON reg_key(code COLLATE NOCASE)`),
				c.env.db.prepare(`
					INSERT INTO setting (
						register, receive, add_email, many_email, title, auto_refresh, register_verify, add_email_verify,
						resend_tokens, send, login_opacity,
						tg_bot_token, tg_chat_id, tg_bot_status, forward_email, forward_status, rule_email, rule_type,
						reg_key, reg_verify_count, add_verify_count,
						notice_title, notice_content, notice_type, notice_duration, notice_offset, notice_position, notice_width, notice, no_recipient,
						login_domain, bucket, region, endpoint, s3_access_key, s3_secret_key
					)
					SELECT 0, 0, 0, 0, 'Cloud Mail', 2, 1, 1,
						'{}', 0, 0.90,
						'', '', 1, '', 1, '', 0,
						1, 1, 1,
						'Cloud Mail', ?, 'none', 0, 0, 'top-right', 340, 0, 1,
						0, '', '', '', '', ''
					WHERE NOT EXISTS (SELECT 1 FROM setting)
				`).bind(noticeContent),
				c.env.db.prepare(`
					INSERT OR IGNORE INTO perm (perm_id, name, perm_key, pid, type, sort) VALUES
					(1, '邮件', NULL, 0, 0, 0),
					(2, '邮件删除', 'email:delete', 1, 2, 1),
					(3, '邮件发送', 'email:send', 1, 2, 0),
					(4, '个人设置', '', 0, 1, 2),
					(5, '用户注销', 'my:delete', 4, 2, 0),
					(6, '用户信息', NULL, 0, 1, 3),
					(7, '用户查看', 'user:query', 6, 2, 0),
					(8, '密码修改', 'user:set-pwd', 6, 2, 2),
					(9, '状态修改', 'user:set-status', 6, 2, 3),
					(10, '权限修改', 'user:set-type', 6, 2, 4),
					(11, '用户删除', 'user:delete', 6, 2, 7),
					(13, '权限控制', '', 0, 1, 5),
					(14, '身份查看', 'role:query', 13, 2, 0),
					(15, '身份修改', 'role:set', 13, 2, 1),
					(16, '身份删除', 'role:delete', 13, 2, 2),
					(17, '系统设置', '', 0, 1, 6),
					(18, '设置查看', 'setting:query', 17, 2, 0),
					(19, '设置修改', 'setting:set', 17, 2, 1),
					(21, '邮箱侧栏', '', 0, 0, 1),
					(22, '邮箱查看', 'account:query', 21, 2, 0),
					(23, '邮箱添加', 'account:add', 21, 2, 1),
					(24, '邮箱删除', 'account:delete', 21, 2, 2),
					(25, '用户添加', 'user:add', 6, 2, 1),
					(26, '发件重置', 'user:reset-send', 6, 2, 6),
					(27, '邮件列表', '', 0, 1, 4),
					(28, '邮件查看', 'all-email:query', 27, 2, 0),
					(29, '邮件删除', 'all-email:delete', 27, 2, 0),
					(30, '身份添加', 'role:add', 13, 2, -1),
					(31, '分析页', NULL, 0, 1, 2.1),
					(32, '数据查看', 'analysis:query', 31, 2, 1),
					(33, '注册密钥', NULL, 0, 1, 5.1),
					(34, '密钥查看', 'reg-key:query', 33, 2, 0),
					(35, '密钥添加', 'reg-key:add', 33, 2, 1),
					(36, '密钥删除', 'reg-key:delete', 33, 2, 2)
				`),
				// 先写入默认权限，再创建首个角色。两条语句共用同一个批次。
				c.env.db.prepare(`
					WITH default_permissions(id, perm_id) AS (
						VALUES (100, 2), (101, 21), (102, 22), (103, 23), (104, 24),
						       (105, 4), (106, 5), (107, 1), (108, 3)
					)
					INSERT INTO role_perm (id, role_id, perm_id)
					SELECT id, 1, perm_id FROM default_permissions
					WHERE NOT EXISTS (SELECT 1 FROM role)
					  AND NOT EXISTS (SELECT 1 FROM role_perm)
				`),
				c.env.db.prepare(`
					INSERT INTO role (
						role_id, name, key, create_time, sort, description, user_id, is_default, send_count, send_type, account_count, avail_domain, ban_email, ban_email_type
					)
					SELECT 1, '普通用户', NULL, '0000-00-00 00:00:00', 0, '只有普通使用权限', 0, 1, NULL, 'ban', 10, '', '', 0
					WHERE NOT EXISTS (SELECT 1 FROM role)
				`)
			]);
		} catch (e) {
			console.warn(`sql skip:${e.message}`);
		}
	},
};
export { dbInit };
