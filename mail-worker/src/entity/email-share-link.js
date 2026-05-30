import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

export const emailShareLink = sqliteTable('email_share_link', {
	shareLinkId: integer('share_link_id').primaryKey({ autoIncrement: true }),
	accountId: integer('account_id'),
	accountEmail: text('account_email').notNull(),
	shareAddress: text('share_address').notNull(),
	ownerUserId: integer('owner_user_id').notNull(),
	createdByUserId: integer('created_by_user_id').notNull(),
	linkType: text('link_type').notNull(),
	sourceType: text('source_type').default('account').notNull(),
	tokenHash: text('token_hash').notNull(),
	expireTime: text('expire_time'),
	status: integer('status').default(0).notNull(),
	openCount: integer('open_count').default(0).notNull(),
	createTime: text('create_time').default(sql`CURRENT_TIMESTAMP`).notNull(),
	updateTime: text('update_time').default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export default emailShareLink;
