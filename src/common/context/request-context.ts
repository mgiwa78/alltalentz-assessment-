import { AsyncLocalStorage } from "async_hooks";

export interface RequestContext {
  userId?: string;
  ipAddress?: string;
  userAgent?: string;
  requestId?: string;
}

export const requestContextStorage = new AsyncLocalStorage<RequestContext>();

export function getRequestContext(): RequestContext {
  return requestContextStorage.getStore() ?? {};
}
