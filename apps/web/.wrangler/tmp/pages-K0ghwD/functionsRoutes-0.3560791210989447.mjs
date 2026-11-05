import { onRequest as __v1___path___ts_onRequest } from "/Users/niatmurad/Documents/time-platform/clocknow/apps/web/functions/v1/[[path]].ts"

export const routes = [
    {
      routePath: "/v1/:path*",
      mountPath: "/v1",
      method: "",
      middlewares: [],
      modules: [__v1___path___ts_onRequest],
    },
  ]