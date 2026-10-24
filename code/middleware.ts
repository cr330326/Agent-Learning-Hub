import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { isTrustedLocalHost } from "./modules/runtime/request-host";

// Local Mode serves private notes and local material to the fixed no-login
// identity, so the network boundary has to be enforced on the request itself:
// only a loopback Host may pass. The dev server additionally binds to
// 127.0.0.1 (see the dev:local script); this gate also covers production
// `next start` instances and DNS-rebinding Hosts. Cloud Mode authenticates by
// cookie behind arbitrary proxies and hostnames and must stay untouched.
export function middleware(request: NextRequest) {
  if (process.env.DEPLOYMENT_MODE !== "local") {
    return NextResponse.next();
  }
  if (isTrustedLocalHost(request.headers.get("host"))) {
    return NextResponse.next();
  }
  return new NextResponse("本地模式只允许通过本机回环地址访问。", {
    status: 403,
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
};
