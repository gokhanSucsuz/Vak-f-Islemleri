import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/authOptions";
import dbConnect from "@/lib/db";
import Transaction from "@/models/Transaction";
import User from "@/models/User";

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !session.user) {
      return NextResponse.json({ error: "Yetkisiz erişim" }, { status: 401 });
    }

    const { citizenInfo, actionTaken } = await req.json();

    if (!citizenInfo || !actionTaken) {
      return NextResponse.json({ error: "Eksik bilgi" }, { status: 400 });
    }

    await dbConnect();

    const transaction = new Transaction({
      userId: session.user.id,
      citizenInfo,
      actionTaken,
    });

    await transaction.save();
    
    // Log işlemi
    const Log = (await import("@/models/Log")).default;
    await Log.create({
      userId: session.user.id,
      action: "Kayıt Eklendi",
      details: `${citizenInfo} için yeni işlem yapıldı.`
    });

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

    await dbConnect();

    let query: any = {};

    // Personel SADECE KENDİSİNİ görebilir
    if (session.user.role === "personnel") {
      query.userId = session.user.id;
    } else if (filterUserId) {
      // Müdür veya Superadmin filtreleme yapabilir
      query.userId = filterUserId;
    }

    if (dateStart && dateEnd) {
      query.createdAt = {
        $gte: new Date(dateStart),
        $lte: new Date(dateEnd)
      };
    }

    const transactions = await Transaction.find(query)
      .populate("userId", "name email")
      .sort({ createdAt: -1 });
      
    // Apply in-memory text search because fields are encrypted in DB
    let filteredTransactions = transactions;
    
    if (searchText && searchText.trim().length > 0) {
      const lowerSearch = searchText.toLowerCase();
      filteredTransactions = transactions.filter((t: any) => {
        const infoMatch = t.citizenInfo && t.citizenInfo.toLowerCase().includes(lowerSearch);
        const actionMatch = t.actionTaken && t.actionTaken.toLowerCase().includes(lowerSearch);
        return infoMatch || actionMatch;
      });
    }

    return NextResponse.json({ transactions: filteredTransactions }, { status: 200 });
  } catch (error) {
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 });
  }
}
