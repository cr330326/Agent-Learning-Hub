import { StateValidationError } from "./repository";

// R06: a request used to be fully read into memory before any validation ran,
// so an oversized body cost the server its full size in buffering. Bodies are
// streamed with a hard cap; the declared Content-Length is rejected up front
// when it already exceeds the limit.
export const MAX_STATE_REQUEST_BYTES = 262_144;

export async function readJsonBodyWithLimit(
  request: Request,
  limit: number = MAX_STATE_REQUEST_BYTES,
): Promise<unknown> {
  const declaredLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > limit) {
    throw new StateValidationError("请求体超过大小限制。");
  }

  if (!request.body) {
    throw new StateValidationError("请求体不能为空。");
  }

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > limit) {
        await reader.cancel();
        throw new StateValidationError("请求体超过大小限制。");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  let payload: unknown;
  try {
    payload = JSON.parse(new TextDecoder().decode(mergeChunks(chunks, total)));
  } catch {
    throw new StateValidationError("请求体不是有效 JSON。");
  }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new StateValidationError("请求体必须是 JSON 对象。");
  }
  return payload;
}

function mergeChunks(chunks: Uint8Array[], total: number): Uint8Array {
  const merged = new Uint8Array(total);
  let cursor = 0;
  for (const chunk of chunks) {
    merged.set(chunk, cursor);
    cursor += chunk.byteLength;
  }
  return merged;
}
