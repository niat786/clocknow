// Pages Function: share-link previews for this page (see _preview.ts).
import { withPreview, type Ctx } from './_preview';

export const onRequestGet = (ctx: Ctx): Promise<Response> => withPreview(ctx);
