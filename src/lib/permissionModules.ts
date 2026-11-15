export const PERMISSION_MODULES = [
  { key: "applications", label: "Başvuru Dosyaları" },
  { key: "petitions", label: "Dilekçe İşlemleri" },
  { key: "presentations", label: "Sunular" },
  { key: "helpTypes", label: "Yardım Türleri" },
  { key: "babyFood", label: "Bebek Maması" },
  { key: "inKindAid", label: "Ayni Yardım" },
] as const;

export type PermissionModuleKey = (typeof PERMISSION_MODULES)[number]["key"];

export const ALL_PERMISSION_MODULE_KEYS: PermissionModuleKey[] = PERMISSION_MODULES.map(
  (m) => m.key
);
