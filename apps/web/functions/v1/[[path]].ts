// Pages Function: edge time on clocknow.pages.dev/v1/*. Same handler as apps/edge.
// pages.dev runs on Cloudflare's own network, which reaches Pakistan via Karachi (our zone goes via Muscat).
import { handle } from '../../../edge/src/index';

interface Context {
  request: Request;
  env: { ALLOWED_ORIGINS?: string };
}

export const onRequest = (ctx: Context): Response => handle(ctx.request, ctx.env.ALLOWED_ORIGINS);
