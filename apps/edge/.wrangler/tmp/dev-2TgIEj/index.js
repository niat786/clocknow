var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// src/protocol.ts
var DEFAULT_ORIGINS = "https://clocknow.net,https://www.clocknow.net";
var MAX_PINGS = 64;
var IDLE_MS = 6e4;
var MAX_MESSAGE = 256;
function parseOrigins(list) {
  return list.split(",").map((s) => s.trim().replace(/\/+$/, "")).filter((s) => s.length > 0);
}
__name(parseOrigins, "parseOrigins");
function originAllowed(origin, allowed) {
  return origin === null || allowed.includes(origin);
}
__name(originAllowed, "originAllowed");
function pongFor(text, t1, t2) {
  if (text.length > MAX_MESSAGE) return null;
  let v;
  try {
    v = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof v !== "object" || v === null) return null;
  const t0 = v.t0;
  if (typeof t0 !== "number" || !Number.isFinite(t0)) return null;
  return JSON.stringify({ t0, t1, t2 });
}
__name(pongFor, "pongFor");
var nowBody = /* @__PURE__ */ __name((t1, t2, serverId) => ({
  t1,
  t2,
  server_id: serverId,
  tzdata_version: null,
  zone: null
}), "nowBody");

// src/index.ts
var json = /* @__PURE__ */ __name((body, status, headers) => new Response(JSON.stringify(body), {
  status,
  headers: { "content-type": "application/json", "cache-control": "no-store", ...headers }
}), "json");
function session() {
  const pair = new WebSocketPair();
  const client = pair[0];
  const server = pair[1];
  server.accept();
  let pings = 0;
  const closeIdle = /* @__PURE__ */ __name(() => server.close(1e3, "idle"), "closeIdle");
  let idle = setTimeout(closeIdle, IDLE_MS);
  server.addEventListener("message", (ev) => {
    const t1 = Date.now();
    clearTimeout(idle);
    idle = setTimeout(closeIdle, IDLE_MS);
    if (typeof ev.data !== "string") return;
    pings += 1;
    if (pings > MAX_PINGS) {
      server.close(1008, "too many pings");
      return;
    }
    const reply = pongFor(ev.data, t1, Date.now());
    if (reply) server.send(reply);
  });
  server.addEventListener("close", () => clearTimeout(idle));
  return new Response(null, { status: 101, webSocket: client });
}
__name(session, "session");
function handle(req, allowedOrigins) {
  const t1 = Date.now();
  const url = new URL(req.url);
  const allowed = parseOrigins(allowedOrigins ?? DEFAULT_ORIGINS);
  const origin = req.headers.get("origin");
  const colo = req.cf?.colo ?? "edge";
  const serverId = `cf-${colo}`;
  const headers = { vary: "Origin", "x-server": serverId };
  if (origin && allowed.includes(origin)) headers["access-control-allow-origin"] = origin;
  if (req.method === "OPTIONS") {
    if (!headers["access-control-allow-origin"]) return new Response(null, { status: 403 });
    return new Response(null, {
      status: 204,
      headers: { ...headers, "access-control-allow-methods": "GET, OPTIONS", "access-control-max-age": "86400" }
    });
  }
  if (req.method !== "GET") return json({ error: "method not allowed" }, 405, headers);
  if (url.pathname === "/v1/sync") {
    if (req.headers.get("upgrade")?.toLowerCase() !== "websocket") return json({ error: "expected websocket" }, 426, headers);
    if (!originAllowed(origin, allowed)) return new Response(null, { status: 403 });
    return session();
  }
  if (url.pathname === "/v1/now") {
    if (url.searchParams.has("tz"))
      return json({ error: "zone data is served by https://api.clocknow.net/v1/now" }, 400, headers);
    return json(nowBody(t1, Date.now(), serverId), 200, headers);
  }
  return json({ error: "not found" }, 404, headers);
}
__name(handle, "handle");
var src_default = {
  fetch: /* @__PURE__ */ __name((req, env) => handle(req, env.ALLOWED_ORIGINS), "fetch")
};

// ../../node_modules/.pnpm/wrangler@4.157.0/node_modules/wrangler/templates/middleware/middleware-ensure-req-body-drained.ts
var drainBody = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } finally {
    try {
      if (request.body !== null && !request.bodyUsed) {
        const reader = request.body.getReader();
        while (!(await reader.read()).done) {
        }
      }
    } catch (e) {
      console.error("Failed to drain the unused request body.", e);
    }
  }
}, "drainBody");
var middleware_ensure_req_body_drained_default = drainBody;

// ../../node_modules/.pnpm/wrangler@4.157.0/node_modules/wrangler/templates/middleware/middleware-miniflare3-json-error.ts
function reduceError(e) {
  return {
    name: e?.name,
    message: e?.message ?? String(e),
    stack: e?.stack,
    cause: e?.cause === void 0 ? void 0 : reduceError(e.cause)
  };
}
__name(reduceError, "reduceError");
var jsonError = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } catch (e) {
    const error = reduceError(e);
    const body = JSON.stringify(error);
    const headers = {
      "Content-Type": "application/json",
      "MF-Experimental-Error-Stack": "true"
    };
    const encoded = encodeURIComponent(body);
    if (encoded.length <= 8192) {
      headers["MF-Experimental-Error-Stack-Payload"] = encoded;
    }
    return new Response(body, { status: 500, headers });
  }
}, "jsonError");
var middleware_miniflare3_json_error_default = jsonError;

// .wrangler/tmp/bundle-kWk1uy/middleware-insertion-facade.js
var __INTERNAL_WRANGLER_MIDDLEWARE__ = [
  middleware_ensure_req_body_drained_default,
  middleware_miniflare3_json_error_default
];
var middleware_insertion_facade_default = src_default;

// ../../node_modules/.pnpm/wrangler@4.157.0/node_modules/wrangler/templates/middleware/common.ts
var __facade_middleware__ = [];
function __facade_register__(...args) {
  __facade_middleware__.push(...args.flat());
}
__name(__facade_register__, "__facade_register__");
function __facade_invokeChain__(request, env, ctx, dispatch, middlewareChain) {
  const [head, ...tail] = middlewareChain;
  const middlewareCtx = {
    dispatch,
    next(newRequest, newEnv) {
      return __facade_invokeChain__(newRequest, newEnv, ctx, dispatch, tail);
    }
  };
  return head(request, env, ctx, middlewareCtx);
}
__name(__facade_invokeChain__, "__facade_invokeChain__");
function __facade_invoke__(request, env, ctx, dispatch, finalMiddleware) {
  return __facade_invokeChain__(request, env, ctx, dispatch, [
    ...__facade_middleware__,
    finalMiddleware
  ]);
}
__name(__facade_invoke__, "__facade_invoke__");

// .wrangler/tmp/bundle-kWk1uy/middleware-loader.entry.ts
var __Facade_ScheduledController__ = class ___Facade_ScheduledController__ {
  constructor(scheduledTime, cron, noRetry) {
    this.scheduledTime = scheduledTime;
    this.cron = cron;
    this.#noRetry = noRetry;
  }
  scheduledTime;
  cron;
  static {
    __name(this, "__Facade_ScheduledController__");
  }
  #noRetry;
  noRetry() {
    if (!(this instanceof ___Facade_ScheduledController__)) {
      throw new TypeError("Illegal invocation");
    }
    this.#noRetry();
  }
};
function wrapExportedHandler(worker) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return worker;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  const fetchDispatcher = /* @__PURE__ */ __name(function(request, env, ctx) {
    if (worker.fetch === void 0) {
      throw new Error("Handler does not export a fetch() function.");
    }
    return worker.fetch(request, env, ctx);
  }, "fetchDispatcher");
  return {
    ...worker,
    fetch(request, env, ctx) {
      const dispatcher = /* @__PURE__ */ __name(function(type, init) {
        if (type === "scheduled" && worker.scheduled !== void 0) {
          const controller = new __Facade_ScheduledController__(
            Date.now(),
            init.cron ?? "",
            () => {
            }
          );
          return worker.scheduled(controller, env, ctx);
        }
      }, "dispatcher");
      return __facade_invoke__(request, env, ctx, dispatcher, fetchDispatcher);
    }
  };
}
__name(wrapExportedHandler, "wrapExportedHandler");
function wrapWorkerEntrypoint(klass) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return klass;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  return class extends klass {
    #fetchDispatcher = /* @__PURE__ */ __name((request, env, ctx) => {
      this.env = env;
      this.ctx = ctx;
      if (super.fetch === void 0) {
        throw new Error("Entrypoint class does not define a fetch() function.");
      }
      return super.fetch(request);
    }, "#fetchDispatcher");
    #dispatcher = /* @__PURE__ */ __name((type, init) => {
      if (type === "scheduled" && super.scheduled !== void 0) {
        const controller = new __Facade_ScheduledController__(
          Date.now(),
          init.cron ?? "",
          () => {
          }
        );
        return super.scheduled(controller);
      }
    }, "#dispatcher");
    fetch(request) {
      return __facade_invoke__(
        request,
        this.env,
        this.ctx,
        this.#dispatcher,
        this.#fetchDispatcher
      );
    }
  };
}
__name(wrapWorkerEntrypoint, "wrapWorkerEntrypoint");
var WRAPPED_ENTRY;
if (typeof middleware_insertion_facade_default === "object") {
  WRAPPED_ENTRY = wrapExportedHandler(middleware_insertion_facade_default);
} else if (typeof middleware_insertion_facade_default === "function") {
  WRAPPED_ENTRY = wrapWorkerEntrypoint(middleware_insertion_facade_default);
}
var middleware_loader_entry_default = WRAPPED_ENTRY;
export {
  __INTERNAL_WRANGLER_MIDDLEWARE__,
  middleware_loader_entry_default as default,
  handle
};
//# sourceMappingURL=index.js.map
