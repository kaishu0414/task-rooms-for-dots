declare namespace Cloudflare {
  interface Env {
    TASKROOM_OWNER_EMAIL?: string;
    TASKROOM_OWNER_DISPLAY_NAME?: string;
    TASKROOM_ASSISTANT_DISPLAY_NAME?: string;
    TASKROOM_OWNER_USER_ID?: string;
    DB?: D1Database;
    MCP_EVENTS_ENCRYPTION_KEY?: string;
    MCP_EVENTS_CALLBACK_ORIGINS?: string;
    WEB_PUSH_VAPID_PUBLIC_KEY?: string;
    WEB_PUSH_VAPID_PRIVATE_JWK?: string;
    WEB_PUSH_VAPID_SUBJECT?: string;
    BUCKET?: R2Bucket;
  }
}
