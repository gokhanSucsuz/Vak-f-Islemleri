import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/authOptions";
import dbConnect from "@/lib/db";
import Transaction from "@/models/Transaction";

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const session = await getServerSession(authOptions);
    if (!session || !session.user) {
      return NextResponse.json({ error: "Yetkisiz erişim" }, { status: 401 });
    }

    const { citizenInfo, actionTaken } = await req.json();

    if (!citizenInfo || !actionTaken) {
      return NextResponse.json({ error: "Eksik bilgi" }, { status: 400 });
    }

    await dbConnect();

    const transaction = await Transaction.findById(id);
    if (!transaction) {
      return NextResponse.json({ error: "Kayıt bulunamadı" }, { status: 404 });
    }

    // superadmin her şeyi düzenleyebilir.
    // personel sadece kendi kaydını düzenleyebilir.
    // müdür düzenleyemez.
    if (session.user.role === "manager") {
      return NextResponse.json({ error: "Müdür yetkisi ile kayıt düzenlenemez" }, { status: 403 });
    }
    
    if (session.user.role === "personnel" && transaction.userId.toString() !== session.user.id) {
      return NextResponse.json({ error: "Bu kaydı düzenleme yetkiniz yok" }, { status: 403 });
    }

    transaction.citizenInfo = citizenInfo;
    transaction.actionTaken = actionTaken;
    await transaction.save();

    const Log = (await import("@/models/Log")).default;
    await Log.create({
      userId: session.user.id,
      action: "Kayıt Düzenlendi",
      details: `${citizenInfo} kişisinin işlemi güncellendi.`
    });

    return NextResponse.json({ message: "İşlem güncellendi", transaction }, { status: 200 });
  } catch (error) {
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 });
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const session = await getServerSession(authOptions);
    if (!session || !session.user) {
      return NextResponse.json({ error: "Yetkisiz erişim" }, { status: 401 });
    }

    await dbConnect();

    const transaction = await Transaction.findById(id);
    if (!transaction) {
      return NextResponse.json({ error: "Kayıt bulunamadı" }, { status: 404 });
    }

    // superadmin her şeyi silebilir. 
    // personel sadece kendi kaydını silebilir.
    // müdür silemez.
    if (session.user.role === "manager") {
      return NextResponse.json({ error: "Müdür yetkisi ile kayıt silinemez" }, { status: 403 });
    }
    
    if (session.user.role === "personnel" && transaction.userId.toString() !== session.user.id) {
      return NextResponse.json({ error: "Bu kaydı silme yetkiniz yok" }, { status: 403 });
    }

    const citizenInfo = transaction.citizenInfo;
    await Transaction.findByIdAndDelete(id);

    const Log = (await import("@/models/Log")).default;
    await Log.create({
      userId: session.user.id,
      action: "Kayıt Silindi",
      details: `${citizenInfo} kişisinin işlemi silindi.`
    });

    return NextResponse.json({ message: "İşlem silindi" }, { status: 200 });
  } catch (error) {
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 });
  }
}
