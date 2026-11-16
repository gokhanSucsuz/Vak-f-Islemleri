import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/authOptions";
import dbConnect from "@/lib/db";
import Transaction from "@/models/Transaction";
import User from "@/models/User";
import { isEncryptionEnabled } from "@/lib/encryption";

const g = globalThis as unknown as { __legacyReEncryptTriggered?: boolean };

async function runLegacyReEncryptInBackground() {
  if (g.__legacyReEncryptTriggered || !isEncryptionEnabled()) return;
  g.__legacyReEncryptTriggered = true;
  try {
    const [
      { default: ApplicationFile },
      { default: BabyFood },
      { default: InKindAid },
      { default: Petition },
      { default: Log },
      { invalidateApplicationCache },
    ] = await Promise.all([
      import("@/models/ApplicationFile"),
      import("@/models/BabyFood"),
      import("@/models/InKindAid"),
      import("@/models/Petition"),
      import("@/models/Log"),
      import("@/lib/applicationCache"),
    ]);

    const models = [Transaction, ApplicationFile, BabyFood, InKindAid, Petition, Log, User];
    for (const model of models) {
      const docs = await (model as any).find({});
      for (const doc of docs) {
        if ((doc as any).extraData !== undefined) {
          doc.markModified("extraData");
        }
        if ((doc as any).citizenInfo !== undefined) {
          doc.markModified("citizenInfo");
        }
        await doc.save();
      }
    }
    invalidateApplicationCache();
  } catch (err) {
    console.error("Background legacy re-encryption warning:", err);
  }
}

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !session.user) {
      return NextResponse.json({ error: "Yetkisiz erişim" }, { status: 401 });
    }

    const { citizenInfo, helpType } = await req.json();

    if (!citizenInfo) {
      return NextResponse.json({ error: "Eksik bilgi" }, { status: 400 });
    }

    await dbConnect();

    const transaction = new Transaction({
      userId: session.user.id,
      citizenInfo,
      helpType: helpType || undefined,
    });

    await transaction.save();
    
    // Log işlemi
    try {
      const Log = (await import("@/models/Log")).default;
      await Log.create({
        userId: session.user.id,
        action: "Kayıt Eklendi",
        details: `${citizenInfo} için yeni işlem yapıldı.`
      });
    } catch (e) {
      // Ignore log error
    }

    return NextResponse.json({ message: "İşlem kaydedildi", transaction }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 });
  }
}

export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !session.user) {
      return NextResponse.json({ error: "Yetkisiz erişim" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const filterUserId = searchParams.get("userId");
    const dateStart = searchParams.get("dateStart");
    const dateEnd = searchParams.get("dateEnd");
    const searchText = searchParams.get("search");
    const filterHelpType = searchParams.get("helpType");

    await dbConnect();
    void runLegacyReEncryptInBackground();
    const HelpType = (await import("@/models/HelpType")).default; // ensure model is registered

    let query: any = {};

    // Tüm personeller diğer personellerin kayıtlarını salt okunur görebilir
    if (filterUserId) {
      query.userId = filterUserId;
    }

    if (dateStart && dateEnd) {
      query.createdAt = {
        $gte: new Date(dateStart),
        $lte: new Date(dateEnd)
      };
    }
    
    if (filterHelpType) {
      query.helpType = filterHelpType;
    }

    const transactions = await Transaction.find(query)
      .populate("userId", "name email")
      .populate("helpType", "name")
      .sort({ createdAt: -1 });
      
    // Apply in-memory Turkish-aware text search because fields are encrypted in DB
    let filteredTransactions = transactions;
    
    if (searchText && searchText.trim().length > 0) {
      const { turkishIncludes } = await import("@/lib/turkish");
      const cleanQ = searchText.trim();
      filteredTransactions = transactions.filter((t: any) => {
        const infoMatch = t.citizenInfo && turkishIncludes(t.citizenInfo, cleanQ);
        const staffMatch = t.userId?.name && turkishIncludes(t.userId.name, cleanQ);
        const typeMatch = t.helpType?.name && turkishIncludes(t.helpType.name, cleanQ);
        return Boolean(infoMatch || staffMatch || typeMatch);
      });
    }

    return NextResponse.json({ transactions: filteredTransactions }, { status: 200 });
  } catch (error) {
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== "superadmin") {
      return NextResponse.json({ error: "Yetkisiz erişim" }, { status: 401 });
    }

    await dbConnect();

    // Delete all transactions
    await Transaction.deleteMany({});
    
    // Log işlemi
    const Log = (await import("@/models/Log")).default;
    await Log.create({
      userId: session.user.id,
      action: "Tüm Geçmiş Silindi",
      details: `Süper admin tüm işlem geçmişini sildi.`
    });

    return NextResponse.json({ message: "Tüm geçmiş başarıyla silindi" }, { status: 200 });
  } catch (error) {
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 });
  }
}
