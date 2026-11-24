// KVKK-uyumlu: Yalnızca kişisel veri içermeyen referans ve şablon listeleri için
// kısa süreli sunucu içi RAM önbelleği. Yazma/silme işlemlerinde anında temizlenir.

const g = globalThis as unknown as {
  __helpTypesCache?: { data: any[]; expiresAt: number } | null;
  __presTemplatesCache?: { data: any[]; expiresAt: number } | null;
  __petTemplatesCache?: { data: any[]; expiresAt: number } | null;
};

export function getCachedHelpTypes(): any[] | null {
  const cached = g.__helpTypesCache;
  if (cached && cached.expiresAt > Date.now()) return cached.data;
  return null;
}

export function setCachedHelpTypes(data: any[], ttlMs = 60_000) {
  g.__helpTypesCache = { data, expiresAt: Date.now() + ttlMs };
}

export function invalidateHelpTypesCache() {
  g.__helpTypesCache = null;
}

export function getCachedPresentationTemplates(): any[] | null {
  const cached = g.__presTemplatesCache;
  if (cached && cached.expiresAt > Date.now()) return cached.data;
  return null;
}

export function setCachedPresentationTemplates(data: any[], ttlMs = 300_000) {
  g.__presTemplatesCache = { data, expiresAt: Date.now() + ttlMs };
}

export function invalidatePresentationTemplatesCache() {
  g.__presTemplatesCache = null;
}

export function getCachedPetitionTemplates(): any[] | null {
  const cached = g.__petTemplatesCache;
  if (cached && cached.expiresAt > Date.now()) return cached.data;
  return null;
}

export function setCachedPetitionTemplates(data: any[], ttlMs = 300_000) {
  g.__petTemplatesCache = { data, expiresAt: Date.now() + ttlMs };
}

export function invalidatePetitionTemplatesCache() {
  g.__petTemplatesCache = null;
}
