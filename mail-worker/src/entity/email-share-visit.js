import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

export const emailShareVisit = sqliteTable('email_share_visit', {
	visitId: integer('visit_id').primaryKey({ autoIncrement: true }),
	shareLinkId: integer('share_link_id').notNull(),
	ip: text('ip').notNull(),
	lastCountTime: text('last_count_time').default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export default emailShareVisit;
