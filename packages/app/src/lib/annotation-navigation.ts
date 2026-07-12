export function resolveAnnotationNeighbors(ids: readonly string[], currentId: string): {
  prev: string | null;
  next: string | null;
} {
  const index = ids.indexOf(currentId);
  if (index < 0) {
    return { prev: null, next: null };
  }
  return {
    prev: index > 0 ? ids[index - 1]! : null,
    next: index < ids.length - 1 ? ids[index + 1]! : null,
  };
}
