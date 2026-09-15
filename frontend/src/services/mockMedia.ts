const urls = new Map<string, string>();
const sizes = new Map<string, number>();
export function setMockMedia(id: string, blob: Blob) {
  const previous = urls.get(id);
  if (previous) URL.revokeObjectURL(previous);
  urls.set(id, URL.createObjectURL(blob));
  sizes.set(id, blob.size);
}
export function getMockMedia(id: string) {
  return urls.get(id);
}
export function removeMockMedia(id: string) {
  const value = urls.get(id);
  if (value) URL.revokeObjectURL(value);
  sizes.delete(id);
  return urls.delete(id);
}

export function mockMediaUsedBytes() {
  return [...sizes.values()].reduce((sum, value) => sum + value, 0);
}
