export function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9_\-]+/gi, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 100);
}
