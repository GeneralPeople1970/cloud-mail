import KvConst from '../const/kv-const';
import setting from '../entity/setting';
import user from '../entity/user';
import role from '../entity/role';
import orm from '../entity/orm';
import {verifyRecordType} from '../const/entity-const';
import fileUtils from '../utils/file-utils';
import r2Service from './r2-service';
import constant from '../const/constant';
import BizError from '../error/biz-error';
import {t} from '../i18n/i18n'
import verifyRecordService from './verify-record-service';
import JwtUtils from '../utils/jwt-utils';
import {eq} from 'drizzle-orm';
import domainUtils from '../utils/domain-uitls';

const DEFAULT_SIDEBAR_MENUS = [
	'inbox',
	'send',
	'draft',
	'star',
	'random-email',
	'shared-email',
	'setting',
	'analysis',
	'user',
	'all-email',
	'expired-email',
	'role',
	'reg-key',
	'sys-setting',
];
const KNOWN_SIDEBAR_MENUS = [...DEFAULT_SIDEBAR_MENUS, 'debug'];

const settingService = {

	async refresh(c) {
		const settingRow = await orm(c).select().from(setting).get();
		settingRow.resendTokens = JSON.parse(settingRow.resendTokens);
		settingRow.randomEmailMode = this.normalizeRandomEmailMode(settingRow.randomEmailMode);
		c.set('setting', settingRow);
		await c.env.kv.put(KvConst.SETTING, JSON.stringify(settingRow));
	},

	async query(c) {

		if (c.get?.('setting')) {
			return c.get('setting')
		}

		const setting = await c.env.kv.get(KvConst.SETTING, { type: 'json' });

		if (!setting) {
			throw new BizError('数据库未初始化 Database not initialized.');
		}

		let domainList = c.env.domain;

		if (typeof domainList === 'string') {
			try {
				domainList = JSON.parse(domainList)
			} catch (error) {
				throw new BizError(t('notJsonDomain'));
			}
		}

		if (!c.env.domain) {
			throw new BizError(t('noDomainVariable'));
		}

		domainList = domainList.map(item => '@' + item);
		setting.domainList = domainList;

		let projectLink = c.env.project_link;
		if (typeof projectLink === 'string' && projectLink === 'false') {
			projectLink = false
		} else if (projectLink === false) {
			projectLink = false
		} else {
			projectLink = true
		}

		setting.projectLink = projectLink;
		setting.randomEmailSubdomains ??= '';
		setting.randomEmailLength ??= 10;
		setting.randomEmailMode = this.normalizeRandomEmailMode(setting.randomEmailMode);
		setting.randomEmailDomainSource = this.normalizeDomainSource(setting.randomEmailDomainSource);
		setting.randomEmailDomainList = this.normalizeDomainList(setting.randomEmailDomainList, domainList).join(',');
		setting.debug ??= 0;
		setting.authDomainSource = this.normalizeAuthDomainSource(setting.authDomainSource);
		setting.authDomainList = this.normalizeAuthDomainList(setting.authDomainList, domainList).join(',');
		setting.sidebarMenuConfig = this.normalizeSidebarMenuConfig(setting.sidebarMenuConfig);

		setting.emailPrefixFilter = setting.emailPrefixFilter.split(",").filter(Boolean);

		c.set?.('setting', setting);
		return setting;
	},

	async get(c, showSiteKey = false) {

		const [settingRow, recordList] = await Promise.all([
			await this.query(c),
			verifyRecordService.selectListByIP(c)
		]);


		if (!showSiteKey) {
			settingRow.siteKey = settingRow.siteKey ? `${settingRow.siteKey.slice(0, 6)}******` : null;
		}

		settingRow.secretKey = settingRow.secretKey ? `${settingRow.secretKey.slice(0, 6)}******` : null;

		Object.keys(settingRow.resendTokens).forEach(key => {
			settingRow.resendTokens[key] = `${settingRow.resendTokens[key].slice(0, 12)}******`;
		});

		settingRow.s3AccessKey = settingRow.s3AccessKey ? `${settingRow.s3AccessKey.slice(0, 12)}******` : null;
		settingRow.s3SecretKey = settingRow.s3SecretKey ? `${settingRow.s3SecretKey.slice(0, 12)}******` : null;
		settingRow.tgBotToken = settingRow.tgBotToken ? `${settingRow.tgBotToken.slice(0, 20)}******` : null;
		settingRow.hasR2 = !!c.env.r2
		settingRow.hasCfEmail = !!c.env.email

		let regVerifyOpen = false
		let addVerifyOpen = false

		recordList.forEach(row => {
			if (row.type === verifyRecordType.REG) {
				regVerifyOpen = row.count >= settingRow.regVerifyCount
			}
			if (row.type === verifyRecordType.ADD) {
				addVerifyOpen = row.count >= settingRow.addVerifyCount
			}
		})

		settingRow.regVerifyOpen = regVerifyOpen
		settingRow.addVerifyOpen = addVerifyOpen

		settingRow.storageType = await r2Service.storageType(c);

		return settingRow;
	},

	async set(c, params) {
		const settingData = await this.query(c);
		let resendTokens = { ...settingData.resendTokens, ...params.resendTokens };
		Object.keys(resendTokens).forEach(domain => {
			if (!resendTokens[domain]) delete resendTokens[domain];
		});

		if (Array.isArray(params.emailPrefixFilter)) {
			params.emailPrefixFilter = params.emailPrefixFilter + '';
		}

		if (Array.isArray(params.aiCodeFilter)) {
			params.aiCodeFilter = params.aiCodeFilter + '';
		}

		if (Array.isArray(params.randomEmailSubdomains)) {
			params.randomEmailSubdomains = params.randomEmailSubdomains + '';
		}

		if (params.loginDarkenFactor !== undefined) {
			const factor = Number(params.loginDarkenFactor);
			params.loginDarkenFactor = Number.isNaN(factor) ? 0 : Math.min(1, Math.max(0, factor));
		}

		if (params.randomEmailLength !== undefined) {
			const length = Number(params.randomEmailLength);
			params.randomEmailLength = Number.isNaN(length) ? 10 : Math.min(32, Math.max(4, length));
		}

		if (params.randomEmailMode !== undefined) {
			params.randomEmailMode = this.normalizeRandomEmailMode(params.randomEmailMode);
		}

		if (params.randomEmailDomainSource !== undefined) {
			params.randomEmailDomainSource = this.normalizeDomainSource(params.randomEmailDomainSource);
		}

		if (params.randomEmailDomainList !== undefined) {
			params.randomEmailDomainList = this.normalizeDomainList(params.randomEmailDomainList, settingData.domainList).join(',');
		}

		if (params.debug !== undefined) {
			params.debug = Number(params.debug) === 1 ? 1 : 0;
		}

		if (params.authDomainSource !== undefined) {
			params.authDomainSource = this.normalizeAuthDomainSource(params.authDomainSource);
		}

		if (params.authDomainList !== undefined) {
			params.authDomainList = this.normalizeAuthDomainList(params.authDomainList, settingData.domainList).join(',');
		}

		if (params.sidebarMenuConfig !== undefined) {
			params.sidebarMenuConfig = this.normalizeSidebarMenuConfig(params.sidebarMenuConfig);
			params.debug = params.sidebarMenuConfig.split(',').includes('debug') ? 1 : 0;
		}

		if (params.webhookUrl !== undefined) {
			params.webhookUrl = domainUtils.toOssDomain(params.webhookUrl) || '';
		}

		params.resendTokens = JSON.stringify(resendTokens);

		await orm(c).update(setting).set({ ...params }).returning().get();
		await this.refresh(c);
	},

	async deleteBackground(c) {

		const { background } = await this.query(c);
		if (!background) return

		if (background.startsWith('http')) {
			await orm(c).update(setting).set({ background: '' }).run();
			await this.refresh(c)
			return;
		}

		if (background) {
			await r2Service.delete(c,background)
			await orm(c).update(setting).set({ background: '' }).run();
			await this.refresh(c)
		}
	},

	async setBackground(c, params) {

		let { background } = params

		await this.deleteBackground(c);

		if (background && !background.startsWith('http')) {

			const file = fileUtils.base64ToFile(background)

			const arrayBuffer = await file.arrayBuffer();
			background = constant.BACKGROUND_PREFIX + await fileUtils.getBuffHash(arrayBuffer) + fileUtils.getExtFileName(file.name);


			await r2Service.putObj(c, background, arrayBuffer, {
				contentType: file.type,
				cacheControl: `public, max-age=31536000, immutable`,
				contentDisposition: `inline; filename="${file.name}"`
			});

		}

		await orm(c).update(setting).set({ background }).run();
		await this.refresh(c);
		return background;
	},


	async setBlacklist(c, params) {
		const { blackSubject, blackContent, blackFrom  } = params
		await orm(c).update(setting).set({ blackSubject, blackContent, blackFrom }).run();
		await this.refresh(c);
		return this.get(c);
	},

	async websiteConfig(c) {

		const settingRow = await this.get(c, true);
		const authInfo = await this.getRequestAuthInfo(c);
		const domainList = await this.filterDomainListByAuth(c, settingRow.domainList, authInfo);
		const visibleDomainList = settingRow.loginDomain === 1 && !authInfo ? [] : domainList;
		const loginRegisterDomainList = this.resolveLoginRegisterDomainList(settingRow, visibleDomainList);
		const randomEmailDomainList = this.resolveRandomEmailDomainList(settingRow, visibleDomainList);

		return {
			register: settingRow.register,
			title: settingRow.title,
			manyEmail: settingRow.manyEmail,
			addEmail: settingRow.addEmail,
			autoRefresh: settingRow.autoRefresh,
			addEmailVerify: settingRow.addEmailVerify,
			registerVerify: settingRow.registerVerify,
			send: settingRow.send,
			r2Domain: settingRow.r2Domain,
			siteKey: settingRow.siteKey,
			background: settingRow.background,
			loginOpacity: settingRow.loginOpacity,
			loginDarkenFactor: settingRow.loginDarkenFactor,
			domainList: visibleDomainList,
			authDomainSource: settingRow.authDomainSource,
			authDomainList: this.normalizeAuthDomainList(settingRow.authDomainList, visibleDomainList).join(','),
			loginRegisterDomainList,
			regKey: settingRow.regKey,
			regVerifyOpen: settingRow.regVerifyOpen,
			addVerifyOpen: settingRow.addVerifyOpen,
			noticeTitle: settingRow.noticeTitle,
			noticeContent: settingRow.noticeContent,
			noticeType: settingRow.noticeType,
			noticeDuration: settingRow.noticeDuration,
			noticePosition: settingRow.noticePosition,
			noticeWidth: settingRow.noticeWidth,
			noticeOffset: settingRow.noticeOffset,
			notice: settingRow.notice,
			loginDomain: settingRow.loginDomain,
			linuxdoClientId: settingRow.linuxdoClientId,
			linuxdoSwitch: settingRow.linuxdoSwitch,
			githubClientId: settingRow.githubClientId,
			githubSwitch: settingRow.githubSwitch,
			googleClientId: settingRow.googleClientId,
			googleSwitch: settingRow.googleSwitch,
			minEmailPrefix: settingRow.minEmailPrefix,
			randomEmailSubdomains: settingRow.randomEmailSubdomains,
			randomEmailLength: settingRow.randomEmailLength,
			randomEmailMode: settingRow.randomEmailMode,
			randomEmailDomainSource: settingRow.randomEmailDomainSource,
			randomEmailDomainList: this.normalizeDomainList(settingRow.randomEmailDomainList, visibleDomainList).join(','),
			randomEmailAvailableDomainList: randomEmailDomainList,
			debug: settingRow.debug,
			sidebarMenuConfig: this.normalizeSidebarMenuConfig(settingRow.sidebarMenuConfig),
			projectLink: settingRow.projectLink
		};
	},

	defaultSidebarMenus() {
		return [...DEFAULT_SIDEBAR_MENUS];
	},

	normalizeSidebarMenuConfig(value) {
		const allowed = new Set(KNOWN_SIDEBAR_MENUS);
		const rawList = Array.isArray(value) ? value : String(value || '').split(',');
		const selected = rawList
			.map(item => String(item || '').trim())
			.filter(item => allowed.has(item));
		const unique = Array.from(new Set(selected));
		return (unique.length ? unique : DEFAULT_SIDEBAR_MENUS).join(',');
	},

	normalizeRandomEmailMode(value) {
		const allowed = ['letters', 'numbers', 'symbols'];
		const parts = String(value || '')
			.split(',')
			.map(item => item.trim())
			.filter(item => allowed.includes(item));
		const selected = Array.from(new Set(parts));
		return selected.length ? selected.join(',') : 'letters,numbers';
	},

	normalizeAuthDomainSource(value) {
		return this.normalizeDomainSource(value);
	},

	normalizeAuthDomainList(value, domainList = []) {
		return this.normalizeDomainList(value, domainList);
	},

	normalizeDomainSource(value) {
		return value === 'custom' ? 'custom' : 'cloudflare';
	},

	normalizeDomainList(value, domainList = []) {
		const allowed = new Set((Array.isArray(domainList) ? domainList : [])
			.map(domain => this.normalizeDomain(domain))
			.filter(Boolean));
		const rawList = Array.isArray(value) ? value : String(value || '').split(',');
		const selected = rawList
			.map(domain => this.normalizeDomain(domain))
			.filter(domain => domain && allowed.has(domain));
		return Array.from(new Set(selected));
	},

	normalizeDomain(domain) {
		const value = String(domain || '').trim().toLowerCase().replace(/^@/, '');
		if (!value) return '';
		return `@${value}`;
	},

	resolveLoginRegisterDomainList(settingRow, domainList) {
		const normalizedDomainList = (Array.isArray(domainList) ? domainList : [])
			.map(domain => this.normalizeDomain(domain))
			.filter(Boolean);
		if (this.normalizeAuthDomainSource(settingRow.authDomainSource) !== 'custom') {
			return normalizedDomainList;
		}

		const customDomainList = this.normalizeAuthDomainList(settingRow.authDomainList, normalizedDomainList);
		return customDomainList.length ? customDomainList : normalizedDomainList;
	},

	resolveRandomEmailDomainList(settingRow, domainList) {
		const normalizedDomainList = (Array.isArray(domainList) ? domainList : [])
			.map(domain => this.normalizeDomain(domain))
			.filter(Boolean);
		if (this.normalizeDomainSource(settingRow.randomEmailDomainSource) !== 'custom') {
			return normalizedDomainList;
		}

		const customDomainList = this.normalizeDomainList(settingRow.randomEmailDomainList, normalizedDomainList);
		return customDomainList.length ? customDomainList : normalizedDomainList;
	},

	async getRequestAuthInfo(c) {
		const jwt = c.req.header(constant.TOKEN_HEADER);
		if (!jwt || jwt === 'null' || jwt === 'undefined') return null;

		const payload = await JwtUtils.verifyToken(c, jwt);
		if (!payload) return null;

		const authInfo = await c.env.kv.get(KvConst.AUTH_INFO + payload.userId, { type: 'json' });
		if (!authInfo?.tokens?.includes(payload.token)) return null;

		return authInfo;
	},

	async filterDomainListByAuth(c, domainList, authInfo) {
		if (!authInfo?.user?.userId || authInfo.user.email === c.env.admin) {
			return domainList;
		}

		const row = await orm(c)
			.select({ availDomain: role.availDomain })
			.from(user)
			.leftJoin(role, eq(role.roleId, user.type))
			.where(eq(user.userId, authInfo.user.userId))
			.get();

		const availDomains = String(row?.availDomain || '')
			.split(',')
			.map(item => item.trim().toLowerCase())
			.filter(Boolean);

		if (availDomains.length === 0) {
			return domainList;
		}

		return domainList.filter(domain => {
			return availDomains.includes(String(domain || '').replace(/^@/, '').toLowerCase());
		});
	},

};

export default settingService;
