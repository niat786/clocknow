-- Real-user performance data, stored as histogram buckets only: no IPs, ids, URLs or user agents.
CREATE TABLE rum (
  day    TEXT NOT NULL,     -- YYYY-MM-DD (UTC)
  route  TEXT NOT NULL,     -- a fixed group such as "/time/*", never the raw path
  device TEXT NOT NULL,     -- phone | desktop
  metric TEXT NOT NULL,     -- LCP | INP | CLS | TTFB | FCP
  bucket INTEGER NOT NULL,  -- index into the metric's bucket edges (see src/rum.ts)
  n      INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, route, device, metric, bucket)
);
