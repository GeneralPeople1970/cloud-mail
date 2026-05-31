import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

export const randomEmailRecord = sqliteTable('random_email_record', {
	recordId: integer('record_id').primaryKey({ autoIncrement: true }),
	userId: integer('user_id').notNull(),
	address: text('address').notNull(),
	createTime: text('create_time').default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export default randomEmailRecord;
