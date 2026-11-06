// The slice of the Workers runtime types this gateway uses (kept local so `tsc` needs no generated file).
export interface D1Result<T> { results?: T[] }
export interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<D1Result<T>>;
  run(): Promise<{ meta: { changes: number } }>;
}
export interface D1Database { prepare(sql: string): D1PreparedStatement }

export interface Env {
  DB: D1Database;
  ORIGIN_URL: string;
  ORIGIN_SECRET: string;
  SITE_ORIGINS: string;
  SITE_URL: string;
  MAIL_FROM: string;
  RESEND_API_KEY?: string;
  IP_SALT?: string;
  /** WebAuthn relying-party id: the site's registrable domain ("clocknow.net", or "localhost" in dev). */
  RP_ID: string;
  RP_NAME?: string;
  /** Cookie Domain, e.g. ".clocknow.net" so the site and the API share a session. Unset = host-only (dev). */
  COOKIE_DOMAIN?: string;
}
