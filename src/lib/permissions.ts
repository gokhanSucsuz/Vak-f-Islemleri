import dbConnect from "@/lib/db";
import User from "@/models/User";

export interface EffectivePermissions {
  userId: string;
  role: string;
  isSuperAdmin: boolean;
  isManager: boolean;
  /** Ayarlar sayfasından genel sistem yetkisi (canManageApplications) verilmiş mi */
  isAuthorized: boolean;
  /** Tüm sistem modüllerinde (dilekçe, sunu, yardım türleri, mama/ayni yardım vb.) yönetim yetkisi */
  canManageSystem: boolean;
  /** Başvuru dosyaları Excel içe aktarma / silme / düzenleme yetkisi */
  canManageApplications: boolean;
}

/**
 * Tek merkezli sunucu tarafı yetki kontrolü.
 * Oturumdaki kullanıcıyı veritabanından tazeleyerek rol ve genel yetkili (canManageApplications) durumunu döner.
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
      canManageSystem: false,
      canManageApplications: false,
    };
  }

  if (fallbackRole === "superadmin") {
    return {
      userId,
      role: "superadmin",
      isSuperAdmin: true,
      isManager: true,
      isAuthorized: true,
      canManageSystem: true,
      canManageApplications: true,
    };
  }

  await dbConnect();
  const dbUser = (await User.findById(userId)
    .select("role canManageApplications")
    .lean()) as { role?: string; canManageApplications?: boolean } | null;

  const role = String(dbUser?.role || fallbackRole);
  const isSuperAdmin = role === "superadmin";
  const isManager = isSuperAdmin || role === "manager";
  const isAuthorized = Boolean(dbUser?.canManageApplications);

  return {
    userId,
    role,
    isSuperAdmin,
    isManager,
    isAuthorized,
    canManageSystem: isSuperAdmin || isManager || isAuthorized,
    canManageApplications: isSuperAdmin || isAuthorized,
  };
}
