import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  // Path-based guard logic can be added here if using professional cookie-based auth
  return NextResponse.next();
}

export const config = {
  matcher: ['/dashboard/:path*'],
};
