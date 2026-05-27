import orm from '../entity/orm';
import email from '../entity/email';
import { emailConst, isDel } from '../const/entity-const';
import { and, asc, count, desc, eq, gt, lt, ne, sql } from 'drizzle-orm';
import verifyUtils from '../utils/verify-utils';
import emailUtils from '../utils/email-utils';
import settingService from './setting-service';
import accountService from './account-service';
import emailService from './email-service';
import BizError from '../error/biz-error';
import { t } from '../i18n/i18n';

const randomEmailService = {

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
		const domainList = this.normalizeDomains(settings.domainList?.length ? settings.domainList : c.env.domain);
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
	}
};

export default randomEmailService;
