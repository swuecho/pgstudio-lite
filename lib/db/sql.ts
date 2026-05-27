export function sqlIdent(value: string): string {
  return `"${value.replaceAll('"', '""')}"`
}
