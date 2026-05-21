import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";

/**
 * Wrap a route handler so it requires an authenticated NextAuth session.
 * Passes the session.user as the first arg.
 */
export function withAuth<T extends unknown[]>(
  handler: (
    user: { id: string; email: string },
    req: Request,
    ...args: T
  ) => Promise<Response>
) {
  return async (req: Request, ...args: T) => {
    const session = await getSession();
    if (!session?.user?.id || !session.user.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return handler(
      { id: session.user.id, email: session.user.email },
      req,
      ...args
    );
  };
}

export function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

export function serverError(err: unknown) {
  console.error("[api]", err);
  return NextResponse.json(
    { error: (err as Error)?.message || "Server error" },
    { status: 500 }
  );
}
