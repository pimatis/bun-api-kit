import { z } from "zod";

/** Common validation return type shared across body, query, and params helpers. */
export type ValidationResult<T> =
  | { success: true; data: T }
  | { success: false; error: string; issues?: z.ZodIssue[] };

/** Validate an already-parsed request body against a Zod schema. */
export function validateBody<T extends z.ZodTypeAny>(
  schema: T,
  body: unknown,
): ValidationResult<z.infer<T>> {
  const result = schema.safeParse(body);
  if (result.success) {
    return { success: true, data: result.data };
  }
  const issues = result.error.issues;
  const message = issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
  return { success: false, error: message, issues };
}

/** Normalize missing query values before validating them with Zod. */
export function validateQuery<T extends z.ZodTypeAny>(
  schema: T,
  query: Record<string, string | undefined>,
): ValidationResult<z.infer<T>> {
  const result = schema.safeParse(Object.fromEntries(
    Object.entries(query).map(([k, v]) => [k, v ?? ""]),
  ));
  if (result.success) {
    return { success: true, data: result.data };
  }
  const issues = result.error.issues;
  const message = issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
  return { success: false, error: message, issues };
}

/** Validate route params that are already extracted into a string map. */
export function validateParams<T extends z.ZodTypeAny>(
  schema: T,
  params: Record<string, string>,
): ValidationResult<z.infer<T>> {
  const result = schema.safeParse(params);
  if (result.success) {
    return { success: true, data: result.data };
  }
  const issues = result.error.issues;
  const message = issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
  return { success: false, error: message, issues };
}

/** Common reusable schemas for typical route validation needs. */
export const schemas = {
  pagination: z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
  }),
  id: z.object({
    id: z.string().min(1),
  }),
  email: z.object({
    email: z.string().email(),
  }),
};
