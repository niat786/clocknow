// Shared by the share-link Pages Functions: serves the normal static page, with the title and
// description replaced when the URL carries a shared tool state. No other change to the page.
import { previewFor } from '../src/lib/link-preview';

interface El {
  setAttribute(name: string, value: string): void;
  setInnerContent(text: string): void;
}
declare class HTMLRewriter {
  on(selector: string, handler: { element(e: El): void }): HTMLRewriter;
  transform(res: Response): Response;
}
export interface Ctx {
  request: Request;
  next(): Promise<Response>;
}

export async function withPreview(ctx: Ctx): Promise<Response> {
  const res = await ctx.next();
  if (ctx.request.method !== 'GET' || !res.ok || !(res.headers.get('content-type') ?? '').includes('text/html')) return res;
  const url = new URL(ctx.request.url);
  const p = url.search ? previewFor(url.pathname, url.search) : null;
  if (!p) return res;
  const content = (text: string) => ({ element: (e: El) => e.setAttribute('content', text) });
  return new HTMLRewriter()
    .on('title', { element: (e) => e.setInnerContent(p.title) })
    .on('meta[property="og:title"]', content(p.title))
    .on('meta[name="twitter:title"]', content(p.title))
    .on('meta[name="description"]', content(p.description))
    .on('meta[property="og:description"]', content(p.description))
    .on('meta[name="twitter:description"]', content(p.description))
    .transform(res);
}
