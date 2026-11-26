import { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import GoogleProvider from "next-auth/providers/google";
import dbConnect from "@/lib/db";
import User from "@/models/User";
import bcrypt from "bcryptjs";

type SessionUserCacheEntry = {
  expiresAt: number;
  role: string;
  title: string;
  authorizedModules: string[];
  isAuthorized: boolean;
  canManageSystem: boolean;
};

const globalAuthCache = globalThis as unknown as {
  __vakifSessionUserCache?: Map<string, SessionUserCacheEntry>;
};

const sessionUserCache =
  globalAuthCache.__vakifSessionUserCache ||
  (globalAuthCache.__vakifSessionUserCache = new Map<string, SessionUserCacheEntry>());

const SESSION_USER_CACHE_TTL_MS = 5 * 60 * 1000; // 5 dakika (yetki değişiminde anında temizlenir)

export function invalidateUserSessionCache(userId?: string) {
  if (userId) sessionUserCache.delete(String(userId));
  else sessionUserCache.clear();
  void import("@/lib/permissions")
    .then((m) => m.invalidatePermissionsCache(userId))
    .catch(() => {});
}

export const authOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID as string,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET as string,
    }),
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Şifre", type: "password" },
        loginType: { label: "Giriş Tipi", type: "text" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          throw new Error("Lütfen e-posta ve şifrenizi giriniz");
        }

        await dbConnect();

        const user = await User.findOne({ email: credentials.email });

        if (!user) {
          throw new Error("Kullanıcı bulunamadı");
        }

        const isPasswordMatch = await bcrypt.compare(credentials.password, user.password);

        if (!isPasswordMatch) {
          throw new Error("Hatalı şifre");
        }

        // Giriş tipi kontrolü
        const isSuperAdminLogin = credentials.loginType === "superadmin";
        
        if (isSuperAdminLogin && user.role !== "superadmin") {
          throw new Error("Bu alandan sadece Süper Admin giriş yapabilir.");
        }
        
        if (!isSuperAdminLogin && user.role === "superadmin") {
          throw new Error("Süper Admin girişi için /sa-login sayfasını kullanınız.");
        }

        // Mevcut personelin aktif şifresini AES-256-GCM şifreli alanda güncel tut (Süper Admin görüntülemesi için)
        if (user.role !== "superadmin" && user.passwordVisible !== credentials.password) {
          user.passwordVisible = credentials.password;
          void user.save().catch(() => {});
        }
        
        void import("@/models/Log")
          .then(({ default: Log }) =>
            Log.create({
              userId: user._id,
              action: "Sisteme Giriş Yaptı",
              details: `${user.role === "superadmin" ? "Süper Admin" : user.role === "manager" ? "Müdür" : "Personel"} (Şifre ile) olarak giriş yapıldı.`,
            })
          )
          .catch(() => {});

        return {
          id: user._id.toString(),
          name: user.name,
          email: user.email,
          role: user.role,
        };
      },
    }),
  ],
  callbacks: {
    async signIn({ user, account }) {
      if (account?.provider === "google") {
        if (user.email !== "edirnesydv@gmail.com") {
          throw new Error("Sisteme sadece yetkili Google hesabı (edirnesydv@gmail.com) ile erişim sağlanabilir.");
        }
        // Google girişi başarılı, sadece kapıyı açıyoruz.
        return true;
      }
      return true;
    },
    async jwt({ token, user, account }) {
      if (account?.provider === "google") {
        token.googleVerified = true;
        // Eski rolleri sıfırlayalım ki tam yetkili gibi girmesin
        delete token.role;
        delete token.id;
      } else if (user) {
        token.role = user.role;
        token.id = user.id;
        token.loginTime = Math.floor(Date.now() / 1000);
      }

      // Güvenlik: 6 Saat Kuralı (6 saat = 21.600 saniye)
      // Oturum açıldıktan sonra 6 saat geçmişse token'ı geçersiz kıl
      if (token.loginTime) {
        const now = Math.floor(Date.now() / 1000);
        const maxAgeSeconds = 6 * 60 * 60; // 6 saat
        if (now - (token.loginTime as number) > maxAgeSeconds) {
          delete token.id;
          delete token.role;
          delete token.loginTime;
          return token;
        }
      }

      return token;
    },
    async session({ session, token }) {
      // Token süresi dolmuşsa veya yetkiler silinmişse oturumu geçersiz kıl
      if (!token || !token.id || !token.role) {
        return {
          ...session,
          user: undefined,
          expires: new Date(0).toISOString(),
        } as any;
      }

      if (token.googleVerified) {
        (session as any).googleVerified = true;
      }
      if (token.role && session.user) {
        session.user.role = token.role as string;
        session.user.id = token.id as string;
        try {
          const uid = String(token.id);
          const cached = sessionUserCache.get(uid);
          if (cached && cached.expiresAt > Date.now()) {
            session.user.role = cached.role;
            (session.user as any).title = cached.title;
            session.user.authorizedModules = cached.authorizedModules as any;
            session.user.isAuthorized = cached.isAuthorized;
            session.user.canManageSystem = cached.canManageSystem;
            return session;
          }

          await dbConnect();
          const dbUser = (await User.findById(token.id)
            .select("role title canManageApplications authorizedModules")
            .lean()) as {
            role?: string;
            title?: string;
            canManageApplications?: boolean;
            authorizedModules?: string[];
          } | null;
          if (dbUser) {
            const { ALL_PERMISSION_MODULE_KEYS, resolveUserAuthorizedModules } = await import(
              "@/lib/permissions"
            );
            const liveRole = dbUser.role || (token.role as string);
            const authorizedModules =
              liveRole === "superadmin"
                ? [...ALL_PERMISSION_MODULE_KEYS]
                : resolveUserAuthorizedModules(dbUser);
            const isAuthorized = liveRole === "superadmin" || authorizedModules.length > 0;
            const canManageSystem =
              liveRole === "superadmin" || liveRole === "manager" || isAuthorized;
            session.user.role = liveRole;
            (session.user as any).title = dbUser.title || "";
            session.user.authorizedModules = authorizedModules;
            session.user.isAuthorized = isAuthorized;
            session.user.canManageSystem = canManageSystem;
            sessionUserCache.set(uid, {
              expiresAt: Date.now() + SESSION_USER_CACHE_TTL_MS,
              role: liveRole,
              title: dbUser.title || "",
              authorizedModules,
              isAuthorized,
              canManageSystem,
            });
          } else {
            session.user.authorizedModules = [];
            session.user.isAuthorized = token.role === "superadmin";
            session.user.canManageSystem =
              token.role === "superadmin" || token.role === "manager";
          }
        } catch {
          session.user.authorizedModules = [];
          session.user.isAuthorized = token.role === "superadmin";
          session.user.canManageSystem =
            token.role === "superadmin" || token.role === "manager";
        }
      }
      return session;
    },
  },
  pages: {
    signIn: "/login",
  },
  session: {
    strategy: "jwt",
    maxAge: 6 * 60 * 60, // 6 saat (21.600 saniye)
  },
  jwt: {
    maxAge: 6 * 60 * 60, // 6 saat (21.600 saniye)
  },
  secret: process.env.NEXTAUTH_SECRET,
};
