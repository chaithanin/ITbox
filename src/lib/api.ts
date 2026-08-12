import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { AuthError } from "@/lib/session";

/**
 * Wrap an API route handler with uniform auth/validation error handling.
 * Never leaks internals or secret material into error responses.
 */
export function apiHandler<T extends unknown[]>(
  fn: (...args: T) => Promise<Response>
): (...args: T) => Promise<Response> {
  return async (...args: T) => {
    try {
      return await fn(...args);
    } catch (e) {
      if (e instanceof AuthError) {
        return NextResponse.json(
          { error: e.status === 401 ? "unauthenticated" : "forbidden" },
          { status: e.status }
        );
      }
      if (e instanceof ZodError) {
        return NextResponse.json(
          { error: "validation_error", issues: e.issues.map((i) => ({ path: i.path, message: i.message })) },
          { status: 400 }
        );
      }
      console.error("api error", (e as Error).message);
      return NextResponse.json({ error: "internal_error" }, { status: 500 });
    }
  };
}
