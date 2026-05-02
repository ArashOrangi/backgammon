import { Static, TSchema } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";

export function validateSchema<T extends TSchema>(
  schema: T,
  data: unknown,
):
  | { valid: true; data: Static<T> }
  | { valid: false; errors: Record<string, string[]> } {
  const errors = [...Value.Errors(schema, data)];

  if (errors.length === 0) {
    return { valid: true, data: data as Static<T> };
  }

  const validations: Record<string, string[]> = {};

  for (const err of errors) {
    const key = err.path.replace("/", "") || "root";

    validations[key] ??= [];

    validations[key].push(err.message);
  }

  return { valid: false, errors: validations };
}
