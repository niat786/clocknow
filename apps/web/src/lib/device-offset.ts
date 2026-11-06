// Wording for the "your device clock" card and the text of a signed time receipt. Pure.
const ONE_MS_TOLERANCE = 5;

/** `aheadMs` is device time minus true time: positive means the device clock is fast. */
export function describeDevice(aheadMs: number): string {
  const abs = Math.abs(aheadMs);
  if (abs < ONE_MS_TOLERANCE) return `Your device clock agrees with UTC to within ${ONE_MS_TOLERANCE} ms`;
  const dir = aheadMs > 0 ? 'fast' : 'slow';
  if (abs < 1000) return `Your device clock is ${Math.round(abs)} ms ${dir}`;
  if (abs < 120_000) return `Your device clock is ${(abs / 1000).toFixed(2)} s ${dir}`;
  const min = Math.floor(abs / 60_000);
  const sec = Math.round((abs - min * 60_000) / 1000);
  return `Your device clock is ${min} min ${sec} s ${dir}`;
}

export interface ReceiptInput {
  checkedAt: string;
  nonce: string;
  requestUrl: string;
  keysUrl: string;
  /** The server's answer, exactly as received. */
  response: unknown;
  kid: string;
  keyStatus: string;
  deviceAheadMs: number;
  networkMs: number;
}

/** A self-contained, pasteable record: anyone can re-check the signature with the published key. */
export function receiptText(i: ReceiptInput): string {
  const receipt = {
    receipt: 'clocknow signed time',
    checked_at: i.checkedAt,
    request: { url: i.requestUrl, nonce: i.nonce },
    response: i.response,
    key: { kid: i.kid, status: i.keyStatus, published_at: i.keysUrl },
    verified_in_browser: true,
    device_clock_ahead_ms: Math.round(i.deviceAheadMs),
    network_round_trip_ms: Math.round(i.networkMs),
    how_to_verify:
      'Ed25519 over the UTF-8 text: clocknow-signed-time-v1, newline, then kid=, t=, radius=, nonce=, server= from the response, each on its own line (see https://clocknow.net/about/signed-time). Use the public key published at the key address.',
  };
  return JSON.stringify(receipt, null, 2) + '\n';
}
