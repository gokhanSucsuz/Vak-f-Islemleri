import { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import dbConnect from "@/lib/db";
import User from "@/models/User";
import bcrypt from "bcryptjs";

export const authOptions: NextAuthOptions = {
  providers: [
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
        
        try {
          const Log = (await import("@/models/Log")).default;
          await Log.create({
            userId: user._id,
            action: "Sisteme Giriş Yaptı",
            details: `${user.role === 'superadmin' ? 'Süper Admin' : user.role === 'manager' ? 'Müdür' : 'Personel'} olarak giriş yapıldı.`
          });
        } catch (err) {
          console.error("Log error:", err);
        }

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
    async jwt({ token, user }) {
      if (user) {
        token.role = user.role;
        token.id = user.id;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.role = token.role as string;
        session.user.id = token.id as string;
      }
      return session;
    },
  },
  pages: {
    signIn: "/login",
  },
  session: {
    strategy: "jwt",
  },
  secret: process.env.NEXTAUTH_SECRET,
};
