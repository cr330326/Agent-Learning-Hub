export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  return Response.json(
    { error: "该 GitHub 回调地址已停用，请使用 Better Auth 回调。" },
    { status: 410, headers: { "cache-control": "no-store" } },
  );
}
