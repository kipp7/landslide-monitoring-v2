import Ajv, { type AnySchema, type ErrorObject } from "ajv";
import addFormats from "ajv-formats";
import { readFile } from "node:fs/promises";

export type ValidationError = {
  message: string;
  errors?: ErrorObject[];
};

export type Validator<T> = {
  validate: (value: unknown) => value is T;
  errors: ErrorObject[] | null | undefined;
};

export function createAjv(): Ajv {
  const ajv = new Ajv({
    allErrors: true,
    removeAdditional: false,
    strict: true
  });
  addFormats(ajv);
  return ajv;
}

export async function loadJsonSchema(schemaPath: string): Promise<AnySchema> {
  const content = await readFile(schemaPath, "utf-8");
  return JSON.parse(content) as AnySchema;
}

export function compileSchema<T>(schema: AnySchema, ajv = createAjv()): Validator<T> {
  const validate = ajv.compile(schema);
  return validate as unknown as Validator<T>;
}

export async function loadAndCompileSchema<T>(
  schemaPath: string,
  ajv = createAjv()
): Promise<Validator<T>> {
  const schema = await loadJsonSchema(schemaPath);
  return compileSchema<T>(schema, ajv);
}

export function toValidationError(
  message: string,
  errors?: ErrorObject[] | null
): ValidationError {
  if (errors && errors.length > 0) return { message, errors };
  return { message };
}
