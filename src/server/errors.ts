/** An expected, user-facing failure. Message is safe to display. */
export class AppError extends Error {
  constructor(
    message: string,
    public code: string = "bad_request",
  ) {
    super(message);
  }
}

export class Forbidden extends AppError {
  constructor(message = "You do not have access to this record.") {
    super(message, "forbidden");
  }
}

export class NotFound extends AppError {
  constructor(message = "Not found.") {
    super(message, "not_found");
  }
}

type PgErr = { code?: string; constraint_name?: string; message?: string; cause?: PgErr };

/** Postgres error helpers (postgres.js errors, possibly wrapped by Drizzle). */
export function pgCode(e: unknown): string | undefined {
  const err = e as PgErr;
  return err?.cause?.code ?? err?.code;
}
export function pgConstraint(e: unknown): string | undefined {
  const err = e as PgErr;
  return err?.cause?.constraint_name ?? err?.constraint_name;
}
export function pgMessage(e: unknown): string | undefined {
  const err = e as PgErr;
  return err?.cause?.message ?? err?.message;
}
