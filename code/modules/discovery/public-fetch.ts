import { lookup } from "node:dns/promises";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { isIP } from "node:net";
import ipaddr from "ipaddr.js";

export class CollectionError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}
export type PublicResponse = {
  url: string;
  status: number;
  text: string;
  contentType: string;
};
export type PublicRequestOptions = {
  method?: "GET" | "POST";
  headers?: Record<string, string>;
  body?: string;
  maxBytes?: number;
  timeoutMs?: number;
  acceptedTypes?: string[];
};
export type PublicFetcher = (
  url: string,
  options?: PublicRequestOptions,
) => Promise<PublicResponse>;

export function isPublicAddress(address: string): boolean {
  try {
    return ipaddr.process(address).range() === "unicast";
  } catch {
    return false;
  }
}

export async function resolvePublicTarget(
  url: URL,
  resolver = lookup,
): Promise<{ address: string; family: number }> {
  if (
    !["https:", "http:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    (url.port && !["80", "443"].includes(url.port))
  )
    throw new CollectionError("unsafe-url");
  const hostname = url.hostname.replace(/^\[|\]$/g, "");
  const addresses = isIP(hostname)
    ? [{ address: hostname, family: isIP(hostname) }]
    : await resolver(hostname, { all: true, verbatim: true });
  if (
    !addresses.length ||
    addresses.some(({ address }) => !isPublicAddress(address))
  )
    throw new CollectionError("unsafe-address");
  return addresses[0];
}

export const fetchPublic: PublicFetcher = async (value, options = {}) => {
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(),
    options.timeoutMs ?? 20_000,
  );
  try {
    let url = new URL(value);
    for (let hop = 0; hop <= 5; hop++) {
      // The selected public address is pinned into the socket lookup. A second
      // resolution during connection cannot redirect it into a private network.
      const address = await Promise.race([
        resolvePublicTarget(url),
        new Promise<never>((_, reject) =>
          controller.signal.addEventListener(
            "abort",
            () => reject(new CollectionError("request-timeout")),
            { once: true },
          ),
        ),
      ]);
      if (controller.signal.aborted)
        throw new CollectionError("request-timeout");
      const response = await new Promise<{
        status: number;
        location?: string;
        contentType: string;
        text: string;
      }>((resolve, reject) => {
        const request = url.protocol === "https:" ? httpsRequest : httpRequest;
        const outgoing = request(
          url,
          {
            method: options.method ?? "GET",
            signal: controller.signal,
            agent: false,
            family: address.family,
            headers: {
              "user-agent": "AgentLearningHub/1.0 (+public-source-reader)",
              "accept-encoding": "identity",
              ...options.headers,
            },
            lookup: (_hostname, _options, callback) =>
              callback(null, address.address, address.family),
          },
          (incoming) => {
            const status = incoming.statusCode ?? 0;
            const contentType = String(incoming.headers["content-type"] ?? "")
              .split(";")[0]
              .toLowerCase();
            if ([301, 302, 303, 307, 308].includes(status)) {
              incoming.resume();
              resolve({
                status,
                location: incoming.headers.location,
                contentType,
                text: "",
              });
              return;
            }
            const maxBytes = options.maxBytes ?? 2_000_000;
            if (Number(incoming.headers["content-length"] ?? 0) > maxBytes) {
              incoming.destroy();
              reject(new CollectionError("response-too-large"));
              return;
            }
            if (
              options.acceptedTypes &&
              !options.acceptedTypes.includes(contentType)
            ) {
              incoming.destroy();
              reject(new CollectionError("unsupported-content-type"));
              return;
            }
            if (
              incoming.headers["content-encoding"] &&
              incoming.headers["content-encoding"] !== "identity"
            ) {
              incoming.destroy();
              reject(new CollectionError("unsupported-encoding"));
              return;
            }
            const chunks: Buffer[] = [];
            let size = 0;
            incoming.on("data", (chunk: Buffer) => {
              size += chunk.length;
              if (size > maxBytes) {
                incoming.destroy(new CollectionError("response-too-large"));
                return;
              }
              chunks.push(chunk);
            });
            incoming.on("end", () =>
              resolve({
                status,
                contentType,
                text: Buffer.concat(chunks).toString("utf8"),
              }),
            );
            incoming.on("error", reject);
          },
        );
        outgoing.on("error", reject);
        outgoing.end(options.body);
      });
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        // Service credentials and request bodies never follow a redirect.
        if (
          options.body ||
          options.headers?.authorization ||
          options.headers?.Authorization ||
          !response.location ||
          hop === 5
        )
          throw new CollectionError("redirect-refused");
        const target = new URL(response.location, url);
        if (url.protocol === "https:" && target.protocol !== "https:")
          throw new CollectionError("redirect-refused");
        url = target;
        continue;
      }
      if (response.status < 200 || response.status >= 300)
        throw new CollectionError(
          response.status === 429
            ? "rate-limited"
            : response.status === 401 || response.status === 403
              ? "permission-denied"
              : `upstream-http-${response.status}`,
        );
      return { ...response, url: url.toString() };
    }
    throw new CollectionError("redirect-refused");
  } catch (error) {
    if (error instanceof CollectionError) throw error;
    throw new CollectionError(
      controller.signal.aborted ? "request-timeout" : "connection-failed",
    );
  } finally {
    clearTimeout(timer);
  }
};
