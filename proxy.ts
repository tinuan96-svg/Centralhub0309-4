import { NextRequest, NextResponse } from 'next/server';

const DEMO_COOKIE = 'centralhub_data_mode';
const DEMO_API_ALLOWLIST = [
  '/api/auth/admin-session',
  '/api/staff/access',
];

function isAllowedDuringDemo(pathname: string) {
  return DEMO_API_ALLOWLIST.some(path => pathname === path || pathname.startsWith(path + '/'));
}

export function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const demo = request.cookies.get(DEMO_COOKIE)?.value === 'demo';

  if (demo && pathname.startsWith('/api/') && !isAllowedDuringDemo(pathname)) {
    return NextResponse.json(
      {
        success: false,
        demo_mode: true,
        error: 'This live CentralHub API is disabled while Demo Mode is active.',
      },
      {
        status: 423,
        headers: {
          'Cache-Control': 'no-store',
          'X-CentralHub-Data-Mode': 'demo',
        },
      },
    );
  }

  return NextResponse.next();
}

export const config = {
  matcher: '/api/:path*',
};
