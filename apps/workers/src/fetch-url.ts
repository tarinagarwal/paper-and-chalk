/**
 * Downloads a file from a web address for the Import tab, without letting that address reach
 * anything private: every connection (redirects included) checks the IP it resolved to, so DNS
 * tricks cannot point the worker at internal or metadata addresses.
 */
import { lookup as dnsLookup } from "node:dns";
import http from "node:http";
import https from "node:https";
import { BlockList, isIP, type LookupFunction } from "node:net";

/** The request can never succeed (bad address, refused, not found): retrying will not help. */
export class FetchRefusedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FetchRefusedError";
  }
}

const blocked = new BlockList();
for (const [net, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
] as const) {
  blocked.addSubnet(net, prefix, "ipv4");
}
for (const [net, prefix] of [
  ["::", 128],
  ["::1", 128],
  ["fc00::", 7],
  ["fe80::", 10],
  ["ff00::", 8],
] as const) {
  blocked.addSubnet(net, prefix, "ipv6");
}

/** True for loopback, private, link-local (cloud metadata), multicast and reserved addresses. */
export function isBlockedAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 0) return true;
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(address);
  if (mapped?.[1]) return blocked.check(mapped[1], "ipv4");
  return blocked.check(address, family === 6 ? "ipv6" : "ipv4");
}

export interface FetchedFile {
  body: AsyncIterable<Uint8Array>;
  /** From Content-Disposition or the last path segment. */
  fileName: string;
  /** From Content-Length, when the server sent one. */
  declaredBytes: number | null;
}

export interface UrlFetcherOptions {
  /** Tests only: allow http and local addresses. Never set in deployed code. */
  allowPrivate?: boolean;
  timeoutMs?: number;
  maxRedirects?: number;
}

function fileNameOf(url: URL, disposition: string | undefined): string {
  const quoted = disposition ? /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(disposition) : null;
  const fromHeader = quoted?.[1] ? decodeURIComponent(quoted[1]) : null;
  const fromPath = decodeURIComponent(url.pathname.split("/").filter(Boolean).at(-1) ?? "");
  return (fromHeader ?? fromPath).replace(/[\\/:*?"<>|]+/g, "_").slice(0, 200) || "download";
}

export function createUrlFetcher(options: UrlFetcherOptions = {}) {
  const timeoutMs = options.timeoutMs ?? 30_000;
  const maxRedirects = options.maxRedirects ?? 3;

  // Node asks for one address or, when it races IPv4 and IPv6, for all of them. Either way, a
  // name with any private address is refused outright.
  const safeLookup: LookupFunction = (hostname, lookupOptions, callback) => {
    dnsLookup(hostname, { ...lookupOptions, all: true }, (error, addresses) => {
      if (error) {
        callback(error, "", 0);
        return;
      }
      const list = addresses as unknown as { address: string; family: number }[];
      if (!options.allowPrivate && list.some((a) => isBlockedAddress(a.address))) {
        callback(new FetchRefusedError("That address points to a private network"), "", 0);
        return;
      }
      const first = list[0];
      if (!first) {
        callback(new FetchRefusedError("That address does not resolve"), "", 0);
        return;
      }
      if (lookupOptions.all) {
        (callback as unknown as (e: null, a: { address: string; family: number }[]) => void)(
          null,
          list,
        );
      } else {
        callback(null, first.address, first.family);
      }
    });
  };

  function open(url: URL, redirects: number): Promise<FetchedFile> {
    if (url.protocol !== "https:" && !(options.allowPrivate && url.protocol === "http:")) {
      return Promise.reject(new FetchRefusedError("Only https:// addresses can be imported"));
    }
    if (!options.allowPrivate && isIP(url.hostname) !== 0 && isBlockedAddress(url.hostname)) {
      return Promise.reject(new FetchRefusedError("That address points to a private network"));
    }
    const client = url.protocol === "https:" ? https : http;
    return new Promise((resolve, reject) => {
      const request = client.get(
        url,
        {
          lookup: safeLookup,
          timeout: timeoutMs,
          headers: { "user-agent": "PaperAndChalk-Import/1" },
        },
        (response) => {
          const status = response.statusCode ?? 0;
          const location = response.headers.location;
          if (status >= 300 && status < 400 && location) {
            response.resume();
            if (redirects >= maxRedirects) {
              reject(new FetchRefusedError("Too many redirects"));
              return;
            }
            resolve(open(new URL(location, url), redirects + 1));
            return;
          }
          if (status !== 200) {
            response.resume();
            reject(new FetchRefusedError(`The server answered ${String(status)}`));
            return;
          }
          const length = Number(response.headers["content-length"]);
          resolve({
            body: response,
            fileName: fileNameOf(url, response.headers["content-disposition"]),
            declaredBytes: Number.isFinite(length) && length > 0 ? length : null,
          });
        },
      );
      request.on("timeout", () => {
        request.destroy(new Error("The download timed out"));
      });
      request.on("error", reject);
    });
  }

  return { fetch: (url: string) => open(new URL(url), 0) };
}

export type UrlFetcher = ReturnType<typeof createUrlFetcher>;
