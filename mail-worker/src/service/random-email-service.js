import orm from '../entity/orm';
import email from '../entity/email';
import { emailConst, isDel } from '../const/entity-const';
import { and, asc, count, desc, eq, gt, lt, ne, sql } from 'drizzle-orm';
import verifyUtils from '../utils/verify-utils';
import emailUtils from '../utils/email-utils';
import settingService from './setting-service';
import accountService from './account-service';
import emailService from './email-service';
import roleService from './role-service';
import randomEmailRecord from '../entity/random-email-record';
import BizError from '../error/biz-error';
import { t } from '../i18n/i18n';

const randomEmailService = {

	async quota(c, userId) {
		const quota = await this.quotaInfo(c, userId);
		return this.formatQuota(quota);
	},

	async generate(c, params, userId) {
		const settings = await settingService.query(c);
		const domainList = await this.userDomainList(c, settings.domainList?.length ? settings.domainList : c.env.domain);
		const subdomains = this.normalizeSubdomains(settings.randomEmailSubdomains);
		const baseDomain = this.normalizeBaseDomain(params.baseDomain, domainList);
		const domainPrefix = this.normalizeDomainPrefix(params.domainPrefix, subdomains);
		const domain = domainPrefix ? `${domainPrefix}.${baseDomain}` : baseDomain;

		if (!this.isAllowedDomain(domain, domainList, subdomains)) {
			throw new BizError(t('notEmailDomain'));
		}

		const quota = await this.quotaInfo(c, userId);
		if (quota.limit > 0 && quota.used >= quota.limit) {
			throw new BizError(t('randomEmailQuotaExceeded'), 403);
		}

		let address = '';
		let available = false;
		for (let i = 0; i < 8; i++) {
			const localPart = this.randomText(settings.randomEmailMode, settings.randomEmailLength);
			address = `${localPart}@${domain}`.toLowerCase();
			if (!verifyUtils.isEmail(address)) {
				continue;
			}

			const exists = await orm(c).select().from(randomEmailRecord)
				.where(and(
					eq(randomEmailRecord.userId, userId),
					sql`${randomEmailRecord.address} COLLATE NOCASE = ${address}`,
				))
				.get();
			if (!exists) {
				available = true;
				break;
			}
		}

		if (!available || !address || !verifyUtils.isEmail(address)) {
			throw new BizError(t('notEmail'));
		}

		await orm(c).insert(randomEmailRecord).values({
			userId,
			address,
		}).run();

		const nextQuota = await this.quotaInfo(c, userId);
		return {
			address,
			...this.formatQuota(nextQuota),
		};
	},

	async list(c, params) {
		const { address, emailId, size, timeSort } = await this.normalizeParams(c, params);
		await this.assertRandomAddress(c, address);

		const conditions = this.baseConditions(address);
		const pageConditions = [
			timeSort ? gt(email.emailId, emailId) : lt(email.emailId, emailId),
			...conditions
		];

		const query = orm(c)
			.select({ ...email })
			.from(email)
			.where(and(...pageConditions));

		if (timeSort) {
			query.orderBy(asc(email.emailId));
		} else {
			query.orderBy(desc(email.emailId));
		}

		const listQuery = query.limit(size).all();
		const totalQuery = orm(c)
			.select({ total: count() })
			.from(email)
			.where(and(...conditions))
			.get();
		const latestEmailQuery = orm(c)
			.select()
			.from(email)
			.where(and(...conditions))
			.orderBy(desc(email.emailId))
			.limit(1)
			.get();

		let [list, totalRow, latestEmail] = await Promise.all([listQuery, totalQuery, latestEmailQuery]);
		await emailService.emailAddAtt(c, list);

		if (!latestEmail) {
			latestEmail = {
				emailId: 0,
				accountId: 0,
				userId: 0,
			};
		}

		return { list, total: totalRow.total, latestEmail };
	},

	async latest(c, params) {
		const { address, emailId } = await this.normalizeParams(c, { ...params, timeSort: 1 });
		await this.assertRandomAddress(c, address);

		const list = await orm(c)
			.select({ ...email })
			.from(email)
			.where(and(
				gt(email.emailId, emailId),
				...this.baseConditions(address)
			))
			.orderBy(desc(email.emailId))
			.limit(20);

		await emailService.emailAddAtt(c, list);
		return list;
	},

	async normalizeParams(c, params) {
		let { address, emailId, size, timeSort } = params;

		address = String(address || '').trim().toLowerCase();

		if (!address) {
			throw new BizError(t('emptyEmail'));
		}

		if (!verifyUtils.isEmail(address)) {
			throw new BizError(t('notEmail'));
		}

		const emailDomain = emailUtils.getDomain(address).toLowerCase();
		const settings = await settingService.query(c);
		const domainList = await this.userDomainList(c, settings.domainList?.length ? settings.domainList : c.env.domain);
		const subdomains = this.normalizeSubdomains(settings.randomEmailSubdomains);

		if (!this.isAllowedDomain(emailDomain, domainList, subdomains)) {
			throw new BizError(t('notEmailDomain'));
		}

		emailId = Number(emailId);
		timeSort = Number(timeSort);
		size = Number(size);

		if (!size || size < 1) {
			size = 50;
		}

		if (size > 50) {
			size = 50;
		}

		if (!emailId) {
			emailId = timeSort ? 0 : 9999999999;
		}

		return { address, emailId, size, timeSort };
	},

	async assertRandomAddress(c, address) {
		const accountRow = await accountService.selectByEmailIncludeDel(c, address);

		if (accountRow) {
			throw new BizError(t('isRegAccount'), 403);
		}
	},

	baseConditions(address) {
		return [
			sql`${email.toEmail} COLLATE NOCASE = ${address}`,
			eq(email.type, emailConst.type.RECEIVE),
			eq(email.isDel, isDel.NORMAL),
			ne(email.status, emailConst.status.SAVING)
		];
	},

	normalizeDomains(domains) {
		return Array.from(new Set((Array.isArray(domains) ? domains : [])
			.map(domain => String(domain || '').trim().toLowerCase())
			.filter(Boolean)
			.map(domain => domain.startsWith('@') ? domain : '@' + domain)));
	},

	async userDomainList(c, domains) {
		const domainList = this.normalizeDomains(domains);
		const userRow = c.get?.('user');

		if (!userRow || userRow.email === c.env.admin) {
			return domainList;
		}

		const roleRow = await roleService.selectByUserId(c, userRow.userId);
		const availDomains = String(roleRow?.availDomain || '')
			.split(',')
			.map(item => item.trim().toLowerCase())
			.filter(Boolean);

		if (availDomains.length === 0) {
			return domainList;
		}

		return domainList.filter(domain => {
			return availDomains.includes(domain.replace(/^@/, '').toLowerCase());
		});
	},

	normalizeSubdomains(value) {
		return Array.from(new Set(String(value || '')
			.split(',')
			.map(item => item.trim().toLowerCase())
			.filter(item => /^[a-z0-9-]+$/.test(item))));
	},

	isAllowedDomain(emailDomain, domainList, subdomains) {
		for (const domain of domainList) {
			const baseDomain = domain.replace(/^@/, '');
			if (emailDomain === baseDomain) {
				return true;
			}

			if (subdomains.some(subdomain => emailDomain === `${subdomain}.${baseDomain}`)) {
				return true;
			}
		}

		return false;
	},

	async quotaInfo(c, userId) {
		const userRow = c.get?.('user');
		const usedRow = await orm(c).select({ total: count() }).from(randomEmailRecord)
			.where(eq(randomEmailRecord.userId, userId))
			.get();

		if (!userRow || userRow.email === c.env.admin) {
			return { limit: 0, used: usedRow.total || 0 };
		}

		const roleRow = await roleService.selectByUserId(c, userId);
		const limit = this.normalizeLimit(roleRow?.randomEmailCount);
		return { limit, used: usedRow.total || 0 };
	},

	formatQuota(quota) {
		const remaining = quota.limit > 0 ? Math.max(0, quota.limit - quota.used) : null;
		return {
			limit: quota.limit,
			used: quota.used,
			remaining,
			unlimited: quota.limit === 0,
		};
	},

	normalizeLimit(value) {
		const count = Number(value);
		if (!count || Number.isNaN(count) || count < 0) {
			return 0;
		}
		return Math.floor(count);
	},

	normalizeBaseDomain(value, domainList) {
		const baseDomain = String(value || '').trim().toLowerCase().replace(/^@/, '');
		const allowed = domainList.map(domain => domain.replace(/^@/, ''));
		if (!baseDomain || !allowed.includes(baseDomain)) {
			return allowed[0] || '';
		}
		return baseDomain;
	},

	normalizeDomainPrefix(value, subdomains) {
		const prefix = String(value || '').trim().toLowerCase();
		if (!prefix) {
			return '';
		}
		return subdomains.includes(prefix) ? prefix : '';
	},

	normalizeRandomMode(value) {
		const modes = String(value || '')
			.split(',')
			.map(item => item.trim())
			.filter(item => ['letters', 'numbers', 'symbols'].includes(item));
		const unique = Array.from(new Set(modes));
		return unique.length ? unique : ['letters', 'numbers'];
	},

	normalizeLength(value) {
		const length = Number(value);
		if (Number.isNaN(length)) {
			return 10;
		}
		return Math.min(32, Math.max(4, length));
	},

	randomText(mode, length) {
		const modes = this.normalizeRandomMode(mode);
		const charMap = {
			letters: 'abcdefghijklmnopqrstuvwxyz',
			numbers: '0123456789',
			symbols: '._-',
		};
		const chars = Array.from(new Set(modes.flatMap(item => charMap[item].split('')))).join('');
		const size = this.normalizeLength(length);
		const array = new Uint32Array(size);
		let value = '';

		crypto.getRandomValues(array);

		for (let i = 0; i < size; i++) {
			value += chars[array[i] % chars.length];
		}

		return value.replace(/^[._-]+|[._-]+$/g, 'a');
	}
};

export default randomEmailService;
