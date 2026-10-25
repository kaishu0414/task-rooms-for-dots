import { sqliteTable, text, integer, uniqueIndex, index } from 'drizzle-orm/sqlite-core';
export const tasks = sqliteTable('tasks', {
 createRequestHash:text('create_request_hash'),
 progressJson:text('progress_json'),
 activityJson:text('activity_json'),
 id:text('id').primaryKey(), clientId:text('client_id').notNull().unique(), title:text('title').notNull(), status:text('status').notNull().default('waiting'), summary:text('summary').notNull().default(''), category:text('category').notNull().default('相談'), updatedAt:text('updated_at').notNull(), links:text('links').notNull().default('[]'), authorSiteUserId:text('author_site_user_id'), lastViewedAt:text('last_viewed_at'),
});
export const messages = sqliteTable('messages', {
 attachmentJson:text('attachment_json').notNull().default('[]'),
 id:text('id').primaryKey(), taskId:text('task_id').notNull().references(()=>tasks.id), clientId:text('client_id').notNull().unique(), role:text('role').notNull(), text:text('text').notNull(), createdAt:text('created_at').notNull(), delivery:text('delivery').notNull().default('pending'), authorVerified:integer('author_verified',{mode:'boolean'}).notNull().default(false), authorSiteUserId:text('author_site_user_id'), replyTo:text('reply_to'), contextMessageId:text('context_message_id'), historicalSummary:integer('historical_summary',{mode:'boolean'}).notNull().default(false),
},t=>[uniqueIndex('messages_reply_to_unique').on(t.replyTo),index('messages_task_time').on(t.taskId,t.createdAt),index('messages_task_role_time').on(t.taskId,t.role,t.createdAt),index('messages_role_delivery_time').on(t.role,t.delivery,t.createdAt)]);
export const settings = sqliteTable('settings',{key:text('key').primaryKey(),value:text('value').notNull()});
export const pushSubscriptions = sqliteTable('push_subscriptions',{
 id:text('id').primaryKey(),ownerSiteUserId:text('owner_site_user_id').notNull(),ownerEmail:text('owner_email').notNull(),endpoint:text('endpoint').notNull().unique(),p256dh:text('p256dh').notNull(),auth:text('auth').notNull(),createdAt:text('created_at').notNull(),updatedAt:text('updated_at').notNull(),
});
export const pushDeliveries = sqliteTable('push_deliveries',{
 messageId:text('message_id').notNull().references(()=>messages.id),subscriptionId:text('subscription_id').notNull(),claimId:text('claim_id').notNull().unique(),status:text('status').notNull().default('attempted'),createdAt:text('created_at').notNull(),
},t=>[uniqueIndex('push_deliveries_message_subscription').on(t.messageId,t.subscriptionId)]);
export const imageAttachments = sqliteTable('image_attachments',{
 id:text('id').primaryKey(),taskId:text('task_id').notNull().references(()=>tasks.id),messageId:text('message_id').references(()=>messages.id),ownerSiteUserId:text('owner_site_user_id').notNull(),clientId:text('client_id').notNull(),objectKey:text('object_key').notNull(),name:text('name').notNull(),mimeType:text('mime_type').notNull(),size:integer('size').notNull(),width:integer('width').notNull(),height:integer('height').notNull(),sha256:text('sha256').notNull(),state:text('state').notNull().default('uploading'),createdAt:text('created_at').notNull(),
},t=>[uniqueIndex('image_attachments_client').on(t.ownerSiteUserId,t.taskId,t.clientId),index('image_attachments_message').on(t.messageId)]);
export const mcpEventSubscriptions = sqliteTable('mcp_event_subscriptions',{
 id:text('id').primaryKey(),ownerSiteUserId:text('owner_site_user_id').notNull(),eventName:text('event_name').notNull(),taskId:text('task_id').references(()=>tasks.id),sealedDelivery:text('sealed_delivery').notNull(),expiresAt:text('expires_at').notNull(),createdAt:text('created_at').notNull(),updatedAt:text('updated_at').notNull(),
},t=>[index('mcp_event_subscriptions_owner_expiry').on(t.ownerSiteUserId,t.expiresAt)]);
export const mcpEventDeliveries = sqliteTable('mcp_event_deliveries',{
 messageId:text('message_id').notNull().references(()=>messages.id),subscriptionId:text('subscription_id').notNull(),eventId:text('event_id').notNull(),claimId:text('claim_id').notNull().unique(),status:text('status').notNull(),attempts:integer('attempts').notNull().default(0),createdAt:text('created_at').notNull(),updatedAt:text('updated_at').notNull(),
},t=>[uniqueIndex('mcp_event_deliveries_message_subscription').on(t.messageId,t.subscriptionId)]);

/** Private uploads staged before a room exists; task_id holds the client draft UUID. */
export const draftImageAttachments = sqliteTable('draft_image_attachments',{
 id:text('id').primaryKey(),taskId:text('task_id').notNull(),messageId:text('message_id'),ownerSiteUserId:text('owner_site_user_id').notNull(),clientId:text('client_id').notNull(),objectKey:text('object_key').notNull(),name:text('name').notNull(),mimeType:text('mime_type').notNull(),size:integer('size').notNull(),width:integer('width').notNull(),height:integer('height').notNull(),sha256:text('sha256').notNull(),state:text('state').notNull().default('uploading'),createdAt:text('created_at').notNull(),
},t=>[uniqueIndex('draft_image_attachments_client').on(t.ownerSiteUserId,t.taskId,t.clientId),index('draft_image_attachments_cleanup').on(t.ownerSiteUserId,t.createdAt)]);

/** Owner-created feedback only; never a message, approval, unread item or event trigger. */
export const messageReactions = sqliteTable('message_reactions',{
 messageId:text('message_id').primaryKey().references(()=>messages.id,{onDelete:'cascade'}),ownerSiteUserId:text('owner_site_user_id').notNull(),emoji:text('emoji').notNull(),authorVerified:integer('author_verified',{mode:'boolean'}).notNull().default(false),createdAt:text('created_at').notNull(),
});
