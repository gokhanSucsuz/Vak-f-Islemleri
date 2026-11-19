// KVKK-uyumlu: Yalnızca kişisel veri içermeyen referans listeleri (Yardım Türleri vb.) için
// kısa süreli sunucu içi RAM önbelleği. Yazma işlemlerinde anında temizlenir.

const g = globalThis as unknown as {
  __helpTypesCache?: { data: any[]; expiresAt: number } | null;
};

export function getCachedHelpTypes(): any[] | null {
  const cached = g.__helpTypesCache;
  if (cached && cached.expiresAt > Date.now()) {
    return cached.data;
  }
  return null;
}

export function setCachedHelpTypes(data: any[], ttlMs = 60_000) {
  g.__helpTypesCache = {
    data,
    expiresAt: Date.now() + ttlMs,
  };
}

export function invalidateHelpTypesCache() {
  g.__helpTypesCache = null;
}
