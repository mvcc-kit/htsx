// Variável de ambiente sem depender de `process`, que o Worker pode não ter.
export function env(name: string): string | undefined {
  return (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.[name]
}
