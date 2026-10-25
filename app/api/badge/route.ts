import { api } from '@/lib/task-api';
export const dynamic='force-dynamic';
// Owner-authenticated, count only, no-store. Service worker never receives chat text.
export async function GET(request:Request){return api(request,async store=>({unread:await store.unreadCount()}));}
