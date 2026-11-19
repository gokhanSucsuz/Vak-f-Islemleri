import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/authOptions";
import dbConnect from "@/lib/db";
import Transaction from "@/models/Transaction";
import User from "@/models/User";
import { normalizeTurkish } from "@/lib/turkish";

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
    await import("@/models/HelpType");

    // 15 saniye içinde aynı kullanıcı tarafından aynı kişi ve tür için çift tıklama koruması
    const fifteenSecondsAgo = new Date(Date.now() - 15_000);
    const recentSameUser = await Transaction.find({
      userId: session.user.id,
      createdAt: { $gte: fifteenSecondsAgo },
    })
      .populate("userId", "name email")
      .populate("helpType", "name")
      .sort({ createdAt: -1 })
      .lean();

    const normInputInfo = normalizeTurkish(String(citizenInfo).replace(/\s+/g, " "));
    const existingDuplicate = recentSameUser.find((t: any) => {
      const sameInfo =
        normalizeTurkish(String(t.citizenInfo || "").replace(/\s+/g, " ")) === normInputInfo;
      const sameType = String(t.helpType?._id || t.helpType || "") === String(helpType || "");
      return sameInfo && sameType;
    });

    if (existingDuplicate) {
      return NextResponse.json(
        { message: "İşlem zaten kaydedildi", transaction: existingDuplicate, deduplicated: true },
        { status: 200 }
      );
    }

    const transaction = new Transaction({
      userId: session.user.id,
      citizenInfo,
      helpType: helpType || undefined,
    });

    await transaction.save();
    await transaction.populate("userId", "name email");
    if (helpType) {
      await transaction.populate("helpType", "name");
    }

    // Log işlemini yanıtı geciktirmeden arka planda yaz
    void import("@/models/Log")
      .then(({ default: Log }) =>
        Log.create({
          userId: session.user.id,
          action: "Kayıt Eklendi",
          details: `${citizenInfo} için yeni işlem yapıldı.`,
        })
      )
      .catch(() => {});

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
    await import("@/models/HelpType"); // ensure model is registered

    const query: any = {};

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
      .sort({ createdAt: -1 })
      .lean();
      
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
