import dbConnect from "@/lib/db";
import User from "@/models/User";
import {
  PERMISSION_MODULES,
  ALL_PERMISSION_MODULE_KEYS,
  type PermissionModuleKey,
} from "@/lib/permissionModules";

export { PERMISSION_MODULES, ALL_PERMISSION_MODULE_KEYS, type PermissionModuleKey };

export function resolveUserAuthorizedModules(dbUser?: {
  canManageApplications?: boolean;
  authorizedModules?: string[];
} | null): PermissionModuleKey[] {
  if (!dbUser) return [];
  const raw = Array.isArray(dbUser.authorizedModules) ? dbUser.authorizedModules : [];
  const valid = raw.filter((k): k is PermissionModuleKey =>
    (ALL_PERMISSION_MODULE_KEYS as readonly string[]).includes(k)
  );
  if (valid.length > 0) return valid;
  // Geriye dönük uyumluluk: eski sistemde genel yetki verilenler tüm modüllerde yetkili sayılır
  if (dbUser.canManageApplications) return [...ALL_PERMISSION_MODULE_KEYS];
  return [];
}

export interface EffectivePermissions {
  userId: string;
  role: string;
  isSuperAdmin: boolean;
  isManager: boolean;
  isAuthorized: boolean;
  authorizedModules: PermissionModuleKey[];
  canManageSystem: boolean;
  canManageApplications: boolean;
  canManagePetitions: boolean;
  canManagePresentations: boolean;
  canManageHelpTypes: boolean;
  canManageBabyFood: boolean;
  canManageInKindAid: boolean;
}

const permissionsCache = new Map<
  string,
  { expiresAt: number; value: EffectivePermissions }
>();
const PERMISSIONS_CACHE_TTL_MS = 30_000;

export function invalidatePermissionsCache(userId?: string) {
  if (userId) permissionsCache.delete(String(userId));
  else permissionsCache.clear();
}

/**
 * Tek merkezli sunucu tarafı yetki kontrolü.
 * Kullanıcının rolünü ve Ayarlar'dan tanımlanan sayfa bazlı yetkilerini veritabanından döner.
 */
export async function getEffectivePermissions(session: any): Promise<EffectivePermissions> {
  const userId = String(session?.user?.id || "");
  const fallbackRole = String(session?.user?.role || "");

  if (!userId) {
    return {
      userId: "",
      role: "",
      isSuperAdmin: false,
      isManager: false,
      isAuthorized: false,
      authorizedModules: [],
      canManageSystem: false,
      canManageApplications: false,
      canManagePetitions: false,
      canManagePresentations: false,
      canManageHelpTypes: false,
      canManageBabyFood: false,
      canManageInKindAid: false,
    };
  }

  if (fallbackRole === "superadmin") {
    return {
      userId,
      role: "superadmin",
      isSuperAdmin: true,
      isManager: true,
      isAuthorized: true,
      authorizedModules: [...ALL_PERMISSION_MODULE_KEYS],
      canManageSystem: true,
      canManageApplications: true,
      canManagePetitions: true,
      canManagePresentations: true,
      canManageHelpTypes: true,
      canManageBabyFood: true,
      canManageInKindAid: true,
    };
  }

  const cached = permissionsCache.get(userId);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }

  await dbConnect();
  const dbUser = (await User.findById(userId)
    .select("role canManageApplications authorizedModules")
    .lean()) as {
    role?: string;
    canManageApplications?: boolean;
    authorizedModules?: string[];
  } | null;

  const role = String(dbUser?.role || fallbackRole);
  const isSuperAdmin = role === "superadmin";
  const isManager = isSuperAdmin || role === "manager";
  const authorizedModules = isSuperAdmin
    ? [...ALL_PERMISSION_MODULE_KEYS]
    : resolveUserAuthorizedModules(dbUser);
  const isAuthorized = isSuperAdmin || authorizedModules.length > 0;
  const hasMod = (k: PermissionModuleKey) => isSuperAdmin || authorizedModules.includes(k);

  const result: EffectivePermissions = {
    userId,
    role,
    isSuperAdmin,
    isManager,
    isAuthorized,
    authorizedModules,
    canManageSystem: isSuperAdmin || isManager || isAuthorized,
    canManageApplications: hasMod("applications"),
    canManagePetitions: isManager || hasMod("petitions"),
    canManagePresentations: isManager || hasMod("presentations"),
    canManageHelpTypes: isManager || hasMod("helpTypes"),
    canManageBabyFood: isManager || hasMod("babyFood"),
    canManageInKindAid: isManager || hasMod("inKindAid"),
  };

  permissionsCache.set(userId, {
    expiresAt: Date.now() + PERMISSIONS_CACHE_TTL_MS,
    value: result,
  });

  return result;
}
