/**
 * Edge-Function env validator. Reads `Deno.env.get` and throws a loud, named
 * error at function boot if anything's missing — silent runtime failures are
 * worse (see `references/deployment-landmines.md`). Per-function specs live
 * inside the function's `index.ts`.
 */

export type EnvSpec = Record<string, { required: boolean; prefix?: string }>;

export function validateEnv(spec: EnvSpec): Record<string, string> {
  const out: Record<string, string> = {};
  const missing: string[] = [];
  const malformed: string[] = [];

  for (const [name, rule] of Object.entries(spec)) {
    const value = Deno.env.get(name);
    if (!value) {
      if (rule.required) missing.push(name);
      continue;
    }
    if (rule.prefix && !value.startsWith(rule.prefix)) {
      malformed.push(`${name} must start with "${rule.prefix}"`);
      continue;
    }
    out[name] = value;
  }

  if (missing.length > 0 || malformed.length > 0) {
    const issues = [
      ...missing.map((m) => `${m}: required`),
      ...malformed,
    ].join('; ');
    throw new Error(`Invalid environment: ${issues}`);
  }

  return out;
}
