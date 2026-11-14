import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/authOptions";
import dbConnect from "@/lib/db";
import { isEncryptionEnabled } from "@/lib/encryption";
import ApplicationFile from "@/models/ApplicationFile";
import BabyFood from "@/models/BabyFood";
import InKindAid from "@/models/InKindAid";
import Petition from "@/models/Petition";
import PetitionTemplate from "@/models/PetitionTemplate";
import Presentation from "@/models/Presentation";
import PresentationMeeting from "@/models/PresentationMeeting";
import PresentationTemplate from "@/models/PresentationTemplate";
import Log from "@/models/Log";
import User from "@/models/User";

export async function POST() {
  try {
    const session = await getServerSession(authOptions);
    const role = (session?.user as any)?.role;
    if (!session?.user || (role !== "superadmin" && role !== "manager")) {
      return NextResponse.json({ error: "Yetkisiz erişim" }, { status: 403 });
    }

    if (!isEncryptionEnabled()) {
      return NextResponse.json(
        { error: "DATA_ENCRYPTION_KEY ortam değişkeni tanımlı değil." },
        { status: 400 }
      );
    }

    await dbConnect();

    const models: Array<{ name: string; model: any }> = [
      { name: "ApplicationFile", model: ApplicationFile },
      { name: "BabyFood", model: BabyFood },
      { name: "InKindAid", model: InKindAid },
      { name: "Petition", model: Petition },
      { name: "PetitionTemplate", model: PetitionTemplate },
      { name: "Presentation", model: Presentation },
      { name: "PresentationMeeting", model: PresentationMeeting },
      { name: "PresentationTemplate", model: PresentationTemplate },
      { name: "Log", model: Log },
      { name: "User", model: User },
    ];

    const summary: Record<string, number> = {};

    for (const { name, model } of models) {
      const docs = await model.find({});
      let count = 0;
      for (const doc of docs) {
        doc.markModified("extraData");
        await doc.save();
        count++;
      }
      summary[name] = count;
    }

    return NextResponse.json({
      success: true,
      message: "Tüm veritabanı kayıtları AES-256-GCM ile şifrelendi.",
      summary,
    });
  } catch (error: any) {
    console.error("Encrypt-all error:", error);
    return NextResponse.json(
      { error: error.message || "Şifreleme sırasında hata oluştu." },
      { status: 500 }
    );
  }
}
