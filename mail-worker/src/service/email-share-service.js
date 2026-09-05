import orm from '../entity/orm';
import emailShareLink from '../entity/email-share-link';
import emailShareVisit from '../entity/email-share-visit';
import accountService from './account-service';
import emailService from './email-service';
import settingService from './setting-service';
import roleService from './role-service';
import email from '../entity/email';
import { emailConst, isDel } from '../const/entity-const';
import { and, asc, count, desc, eq, gt, lt, ne, sql } from 'drizzle-orm';
import BizError from '../error/biz-error';
import { t } from '../i18n/i18n';
import dayjs from 'dayjs';
import verifyUtils from '../utils/verify-utils';
import emailUtils from '../utils/email-utils';
import reqUtils from '../utils/req-utils';

const SHARE_STATUS = {
	ACTIVE: 0,
	CANCELLED: 1,
};

const LINK_TYPE = {
	USER: 'user',
	ADMIN: 'admin',
};

const SOURCE_TYPE = {
	ACCOUNT: 'account',
	ADDRESS: 'address',
};

const VISIT_COUNT_WINDOW_MINUTES = 60;

const emailShareService = {
	async status(c, params, userId) {
		const target = await this.resolveTarget(c, params, userId, LINK_TYPE.USER);
		return this.statusByTarget(c, target, LINK_TYPE.USER);
	},

	async save(c, params, userId) {
		const target = await this.resolveTarget(c, params, userId, LINK_TYPE.USER);
		return this.saveByTarget(c, target, userId, LINK_TYPE.USER, params.expireTime, true);
	},

	async cancel(c, params, userId) {
		const share = await this.assertManageShare(c, params, userId, false);
		await this.cancelByShareId(c, share.shareLinkId);
	},

	async delete(c, params, userId) {
		const share = await this.assertManageShare(c, params, userId, false);
		await this.deleteByShareId(c, share.shareLinkId);
	},

	async list(c, params, userId) {
		const rows = await orm(c).select().from(emailShareLink)
			.where(eq(emailShareLink.ownerUserId, userId))
			.orderBy(desc(emailShareLink.updateTime))
			.all();
		return this.attachEmailCounts(c, rows);
	},

	async update(c, params, userId) {
		const share = await this.assertManageShare(c, params, userId, false);
		const expireTime = this.normalizeExpireTime(params.expireTime);
		await orm(c).update(emailShareLink).set({
			expireTime,
			status: SHARE_STATUS.ACTIVE,
			updateTime: dayjs().toISOString(),
		}).where(eq(emailShareLink.shareLinkId, share.shareLinkId)).run();
		return this.formatShareRow({ ...share, expireTime, status: SHARE_STATUS.ACTIVE });
	},

	async reset(c, params, userId) {
		const share = await this.assertManageShare(c, params, userId, false);
		const target = await this.targetFromShare(c, share);
		return this.saveByTarget(c, target, userId, share.linkType, params.expireTime ?? share.expireTime, true);
	},

	async adminStatus(c, params, userId) {
		const target = await this.resolveTarget(c, params, userId, LINK_TYPE.ADMIN);
		return this.statusByTarget(c, target, LINK_TYPE.ADMIN);
	},

	async adminSave(c, params, userId) {
		const target = await this.resolveTarget(c, params, userId, LINK_TYPE.ADMIN);
		return this.saveByTarget(c, target, userId, LINK_TYPE.ADMIN, params.expireTime, true);
	},

	async adminBatchSave(c, params, userId) {
		const addresses = this.normalizeAddressList(params.addresses);
		const result = [];

		for (const address of addresses) {
			try {
				const target = await this.resolveTarget(c, { address }, userId, LINK_TYPE.ADMIN);
				const item = await this.saveByTarget(c, target, userId, LINK_TYPE.ADMIN, params.expireTime, true);
				result.push({ ...item, ok: true });
			} catch (e) {
				result.push({
					ok: false,
					address,
					message: e.message,
				});
			}
		}

		return result;
	},

	async adminCancel(c, params) {
		const share = await this.assertManageShare(c, params, null, true);
		await this.cancelByShareId(c, share.shareLinkId);
	},

	//管理员可删除任意用户的链接，行删掉后 token 查不到，用户那边的共享页面同时失效
	async adminDelete(c, params) {
		const share = await this.assertManageShare(c, params, null, true);
		await this.deleteByShareId(c, share.shareLinkId);
	},

	async adminList(c) {
		const rows = await orm(c).select().from(emailShareLink)
			.orderBy(desc(emailShareLink.updateTime))
			.all();
		return this.attachEmailCounts(c, rows);
	},

	async adminUpdate(c, params) {
		const share = await this.assertManageShare(c, params, null, true);
		const expireTime = this.normalizeExpireTime(params.expireTime);
		await orm(c).update(emailShareLink).set({
			expireTime,
			status: SHARE_STATUS.ACTIVE,
			updateTime: dayjs().toISOString(),
		}).where(eq(emailShareLink.shareLinkId, share.shareLinkId)).run();
		return this.formatShareRow({ ...share, expireTime, status: SHARE_STATUS.ACTIVE });
	},

	async adminReset(c, params, userId) {
		const share = await this.assertManageShare(c, params, null, true);
		const target = await this.targetFromShare(c, share);
		return this.saveByTarget(c, target, userId, share.linkType, params.expireTime ?? share.expireTime, true);
	},

	async accountStatusMap(c, userId) {
		const rows = await orm(c).select().from(emailShareLink)
			.where(and(
				eq(emailShareLink.ownerUserId, userId),
				eq(emailShareLink.linkType, LINK_TYPE.USER),
				eq(emailShareLink.status, SHARE_STATUS.ACTIVE),
			))
			.all();
		return Object.fromEntries(rows
			.filter(row => !this.isExpired(row.expireTime))
			.map(row => [row.accountId || row.shareAddress, true]));
	},

	async publicMeta(c, params) {
		const share = await this.assertPublicShare(c, params.token);
		await this.recordVisit(c, share);
		return {
			accountEmail: share.shareAddress,
			expireTime: share.expireTime,
		};
	},

	async publicList(c, params) {
		const share = await this.assertPublicShare(c, params.token);
		const { emailId, size, timeSort } = this.normalizeListParams(params);
		const conditions = this.publicEmailConditions(share);
		const pageConditions = [
			timeSort ? gt(email.emailId, emailId) : lt(email.emailId, emailId),
			...conditions,
		];

		const query = orm(c).select({ ...email }).from(email).where(and(...pageConditions));
		query.orderBy(timeSort ? asc(email.emailId) : desc(email.emailId));

		const listQuery = query.limit(size).all();
		const totalQuery = orm(c).select({ total: count() }).from(email).where(and(...conditions)).get();
		const latestEmailQuery = orm(c).select().from(email)
			.where(and(...conditions))
			.orderBy(desc(email.emailId))
			.limit(1)
			.get();

		let [list, totalRow, latestEmail] = await Promise.all([listQuery, totalQuery, latestEmailQuery]);
		await emailService.emailAddAtt(c, list);

		if (!latestEmail) {
			latestEmail = {
				emailId: 0,
				accountId: share.accountId || 0,
				userId: share.ownerUserId,
			};
		}

		return { accountEmail: share.shareAddress, list, total: totalRow.total, latestEmail };
	},

	async publicLatest(c, params) {
		const share = await this.assertPublicShare(c, params.token);
		let emailId = Number(params.emailId);
		if (!emailId || Number.isNaN(emailId)) {
			emailId = 0;
		}

		const list = await orm(c).select({ ...email }).from(email)
			.where(and(
				gt(email.emailId, emailId),
				...this.publicEmailConditions(share),
			))
			.orderBy(desc(email.emailId))
			.limit(20);

		await emailService.emailAddAtt(c, list);
		return list;
	},

	async publicDetail(c, params) {
		const share = await this.assertPublicShare(c, params.token);
		const emailId = Number(params.emailId);
		if (!emailId || Number.isNaN(emailId)) {
			throw new BizError(t('shareLinkInvalid'), 404);
		}

		const emailRow = await orm(c).select({ ...email }).from(email)
			.where(and(
				eq(email.emailId, emailId),
				...this.publicEmailConditions(share),
			))
			.get();

		if (!emailRow) {
			throw new BizError(t('shareLinkInvalid'), 404);
		}

		await emailService.emailAddAtt(c, [emailRow]);
		return { accountEmail: share.shareAddress, email: emailRow };
	},

	async statusByTarget(c, target, linkType) {
		const share = await this.selectByTarget(c, target, linkType);
		if (!share || share.status !== SHARE_STATUS.ACTIVE) {
			return this.emptyStatus(target);
		}

		return this.formatShareRow(share);
	},

	async saveByTarget(c, target, userId, linkType, expireTime, resetToken) {
		const exists = await this.selectByTarget(c, target, linkType);
		const token = resetToken ? this.createToken() : null;
		const tokenHash = token ? await this.hashToken(token) : exists?.tokenHash;
		const normalizedExpireTime = this.normalizeExpireTime(expireTime);
		const values = {
			accountId: target.accountId,
			accountEmail: target.shareAddress,
			shareAddress: target.shareAddress,
			ownerUserId: target.ownerUserId,
			createdByUserId: userId,
			linkType,
			sourceType: target.sourceType,
			tokenHash,
			expireTime: normalizedExpireTime,
			status: SHARE_STATUS.ACTIVE,
		};

		let shareLinkId = exists?.shareLinkId;

		if (exists) {
			await orm(c).update(emailShareLink).set({
				...values,
				updateTime: dayjs().toISOString(),
			}).where(eq(emailShareLink.shareLinkId, exists.shareLinkId)).run();
		} else {
			const row = await orm(c).insert(emailShareLink).values(values).returning({ shareLinkId: emailShareLink.shareLinkId }).get();
			shareLinkId = row.shareLinkId;
		}

		return {
			...this.formatShareRow({ ...exists, ...values, shareLinkId }),
			token,
		};
	},

	async cancelByShareId(c, shareLinkId) {
		await orm(c).update(emailShareLink).set({
			status: SHARE_STATUS.CANCELLED,
			updateTime: dayjs().toISOString(),
		}).where(eq(emailShareLink.shareLinkId, shareLinkId)).run();
	},

	async deleteByShareId(c, shareLinkId) {
		await orm(c).delete(emailShareVisit).where(eq(emailShareVisit.shareLinkId, shareLinkId)).run();
		await orm(c).delete(emailShareLink).where(eq(emailShareLink.shareLinkId, shareLinkId)).run();
	},

	async assertManageShare(c, params, userId, admin) {
		const shareLinkId = Number(params.shareLinkId);
		if (!shareLinkId || Number.isNaN(shareLinkId)) {
			throw new BizError(t('shareLinkInvalid'), 404);
		}

		const share = await orm(c).select().from(emailShareLink)
			.where(eq(emailShareLink.shareLinkId, shareLinkId))
			.get();

		if (!share) {
			throw new BizError(t('shareLinkInvalid'), 404);
		}

		if (!admin && share.ownerUserId !== userId) {
			throw new BizError(t('unauthorized'), 403);
		}

		return share;
	},

	async resolveTarget(c, params, userId, linkType) {
		if (params.accountId) {
			const accountRow = linkType === LINK_TYPE.ADMIN
				? await this.assertAdminAccount(c, params.accountId)
				: await this.assertUserAccount(c, params.accountId, userId);
			return this.targetFromAccount(accountRow);
		}

		const address = this.normalizeAddress(params.address);
		const accountRow = await accountService.selectByEmailIncludeDel(c, address);

		if (accountRow && accountRow.isDel === isDel.NORMAL) {
			if (linkType !== LINK_TYPE.ADMIN && accountRow.userId !== userId) {
				throw new BizError(t('noUserAccount'), 403);
			}
			return this.targetFromAccount(accountRow);
		}

		await this.assertAllowedAddress(c, address, userId, linkType);

		return {
			accountId: null,
			shareAddress: address,
			ownerUserId: userId,
			sourceType: SOURCE_TYPE.ADDRESS,
		};
	},

	async targetFromShare(c, share) {
		if (share.accountId) {
			const accountRow = await this.assertAdminAccount(c, share.accountId);
			return this.targetFromAccount(accountRow);
		}

		return {
			accountId: null,
			shareAddress: share.shareAddress,
			ownerUserId: share.ownerUserId,
			sourceType: share.sourceType || SOURCE_TYPE.ADDRESS,
		};
	},

	targetFromAccount(accountRow) {
		return {
			accountId: accountRow.accountId,
			shareAddress: accountRow.email.toLowerCase(),
			ownerUserId: accountRow.userId,
			sourceType: SOURCE_TYPE.ACCOUNT,
		};
	},

	async assertUserAccount(c, accountId, userId) {
		const accountRow = await accountService.selectById(c, this.normalizeAccountId(accountId));
		if (!accountRow || accountRow.userId !== userId) {
			throw new BizError(t('noUserAccount'), 403);
		}
		return accountRow;
	},

	async assertAdminAccount(c, accountId) {
		const accountRow = await accountService.selectById(c, this.normalizeAccountId(accountId));
		if (!accountRow) {
			throw new BizError(t('noUserAccount'), 404);
		}
		return accountRow;
	},

	async assertAllowedAddress(c, address, userId, linkType) {
		const settings = await settingService.query(c);
		const emailDomain = emailUtils.getDomain(address).toLowerCase();
		const configuredDomains = settingService.resolveRandomEmailDomainList(settings, settings.domainList?.length ? settings.domainList : c.env.domain);
		const allowedDomains = this.normalizeDomains(configuredDomains);
		const subdomains = this.normalizeSubdomains(settings.randomEmailSubdomains);

		const allowed = allowedDomains.some(domain => {
			const baseDomain = domain.replace(/^@/, '');
			return emailDomain === baseDomain || subdomains.some(subdomain => emailDomain === `${subdomain}.${baseDomain}`);
		});

		if (!allowed) {
			throw new BizError(t('notEmailDomain'), 403);
		}

		if (linkType === LINK_TYPE.ADMIN) {
			return;
		}

		const userRow = c.get?.('user');
		if (!userRow || userRow.email === c.env.admin) {
			return;
		}

		const roleRow = await roleService.selectByUserId(c, userId);
		if (!this.hasUserAddressDomain(roleRow?.availDomain || '', address, allowedDomains)) {
			throw new BizError(t('noDomainPermAdd'), 403);
		}
	},

	hasUserAddressDomain(availDomain, address, allowedDomains) {
		if (roleService.hasAvailDomainPerm(availDomain, address)) {
			return true;
		}

		const emailDomain = emailUtils.getDomain(address).toLowerCase();
		return allowedDomains.some(domain => {
			const baseDomain = domain.replace(/^@/, '');
			return emailDomain.endsWith(`.${baseDomain}`)
				&& roleService.hasAvailDomainPerm(availDomain, `share@${baseDomain}`);
		});
	},

	async assertPublicShare(c, token) {
		const normalizedToken = this.normalizeToken(token);
		const tokenHash = await this.hashToken(normalizedToken);
		const share = await orm(c).select().from(emailShareLink)
			.where(and(
				eq(emailShareLink.tokenHash, tokenHash),
				eq(emailShareLink.status, SHARE_STATUS.ACTIVE),
			))
			.get();

		if (!share || this.isExpired(share.expireTime)) {
			throw new BizError(t('shareLinkInvalid'), 404);
		}

		if (share.accountId) {
			const accountRow = await accountService.selectById(c, share.accountId);
			if (!accountRow) {
				throw new BizError(t('shareLinkInvalid'), 404);
			}
		}

		return share;
	},

	async recordVisit(c, share) {
		const ip = reqUtils.getIp(c);
		const now = dayjs();
		const visit = await orm(c).select().from(emailShareVisit)
			.where(and(
				eq(emailShareVisit.shareLinkId, share.shareLinkId),
				eq(emailShareVisit.ip, ip),
			))
			.get();

		if (visit && now.diff(dayjs(visit.lastCountTime), 'minute') < VISIT_COUNT_WINDOW_MINUTES) {
			return;
		}

		if (visit) {
			await orm(c).update(emailShareVisit).set({
				lastCountTime: now.toISOString(),
			}).where(eq(emailShareVisit.visitId, visit.visitId)).run();
		} else {
			await orm(c).insert(emailShareVisit).values({
				shareLinkId: share.shareLinkId,
				ip,
				lastCountTime: now.toISOString(),
			}).run();
		}

		await orm(c).update(emailShareLink).set({
			openCount: sql`${emailShareLink.openCount} + 1`,
			updateTime: dayjs().toISOString(),
		}).where(eq(emailShareLink.shareLinkId, share.shareLinkId)).run();
	},

	selectByTarget(c, target, linkType) {
		if (target.accountId) {
			return orm(c).select().from(emailShareLink).where(and(
				eq(emailShareLink.accountId, Number(target.accountId)),
				eq(emailShareLink.linkType, linkType),
			)).get();
		}

		return orm(c).select().from(emailShareLink).where(and(
			sql`${emailShareLink.shareAddress} COLLATE NOCASE = ${target.shareAddress}`,
			eq(emailShareLink.linkType, linkType),
			eq(emailShareLink.ownerUserId, target.ownerUserId),
		)).get();
	},

	publicEmailConditions(share) {
		const conditions = [
			eq(email.type, emailConst.type.RECEIVE),
			eq(email.isDel, isDel.NORMAL),
			ne(email.status, emailConst.status.SAVING),
		];

		if (share.accountId) {
			conditions.push(eq(email.accountId, Number(share.accountId)));
		} else {
			conditions.push(sql`${email.toEmail} COLLATE NOCASE = ${share.shareAddress}`);
		}

		return conditions;
	},

	async attachEmailCounts(c, rows) {
		const counts = await Promise.all(rows.map(async row => {
			const totalRow = await orm(c).select({ total: count() }).from(email)
				.where(and(...this.publicEmailConditions(row)))
				.get();
			return Number(totalRow?.total || 0);
		}));

		return rows.map((row, index) => this.formatShareRow({
			...row,
			emailCount: counts[index],
		}));
	},

	normalizeListParams(params) {
		let emailId = Number(params.emailId);
		let size = Number(params.size);
		const timeSort = Number(params.timeSort);

		if (!size || Number.isNaN(size) || size < 1) {
			size = 30;
		}

		if (size > 50) {
			size = 50;
		}

		if (!emailId || Number.isNaN(emailId)) {
			emailId = timeSort ? 0 : 9999999999;
		}

		return { emailId, size, timeSort };
	},

	normalizeAccountId(accountId) {
		const value = Number(accountId);
		if (!value || Number.isNaN(value)) {
			throw new BizError(t('noUserAccount'), 404);
		}
		return value;
	},

	normalizeAddress(address) {
		const value = String(address || '').trim().toLowerCase();
		if (!value) {
			throw new BizError(t('emptyEmail'));
		}
		if (!verifyUtils.isEmail(value)) {
			throw new BizError(t('notEmail'));
		}
		return value;
	},

	normalizeAddressList(addresses) {
		return Array.from(new Set((Array.isArray(addresses) ? addresses : [])
			.map(address => String(address || '').trim().toLowerCase())
			.filter(Boolean)));
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

	normalizeExpireTime(expireTime) {
		if (!expireTime) {
			return null;
		}

		const time = dayjs(expireTime);
		if (!time.isValid() || time.isBefore(dayjs())) {
			throw new BizError(t('shareExpireInvalid'));
		}

		return time.toISOString();
	},

	normalizeToken(token) {
		const value = String(token || '').trim();
		if (!/^[A-Za-z0-9_-]{32,160}$/.test(value)) {
			throw new BizError(t('shareLinkInvalid'), 404);
		}
		return value;
	},

	isExpired(expireTime) {
		return Boolean(expireTime && dayjs(expireTime).isBefore(dayjs()));
	},

	formatShareRow(row) {
		const expired = this.isExpired(row.expireTime);
		return {
			shareLinkId: row.shareLinkId,
			accountId: row.accountId,
			address: row.shareAddress || row.accountEmail,
			accountEmail: row.shareAddress || row.accountEmail,
			ownerUserId: row.ownerUserId,
			createdByUserId: row.createdByUserId,
			linkType: row.linkType,
			sourceType: row.sourceType || SOURCE_TYPE.ACCOUNT,
			expireTime: row.expireTime,
			status: row.status,
			enabled: row.status === SHARE_STATUS.ACTIVE && !expired,
			expired,
			openCount: row.openCount || 0,
			emailCount: row.emailCount || 0,
			createTime: row.createTime,
			updateTime: row.updateTime,
		};
	},

	createToken() {
		const bytes = new Uint8Array(32);
		crypto.getRandomValues(bytes);
		let binary = '';
		for (const byte of bytes) {
			binary += String.fromCharCode(byte);
		}
		return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
	},

	async hashToken(token) {
		const data = new TextEncoder().encode(token);
		const digest = await crypto.subtle.digest('SHA-256', data);
		return Array.from(new Uint8Array(digest))
			.map(byte => byte.toString(16).padStart(2, '0'))
			.join('');
	},

	emptyStatus(target) {
		return {
			enabled: false,
			expired: false,
			accountId: target.accountId,
			accountEmail: target.shareAddress,
			address: target.shareAddress,
			expireTime: null,
			openCount: 0,
		};
	},
};

export default emailShareService;
