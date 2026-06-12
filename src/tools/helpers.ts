export function jsonContent(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}

export function errorContent(message: string) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify({ error: message }) }],
    isError: true,
  };
}

export function clampLimit(limit: number | undefined, def: number, max = 100): number {
  if (!limit || limit < 1) return def;
  return Math.min(limit, max);
}
