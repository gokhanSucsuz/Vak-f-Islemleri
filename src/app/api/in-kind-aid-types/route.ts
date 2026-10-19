import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import dbConnect from "@/lib/db";
import InKindAidType from "@/models/InKindAidType";

// Default seed aid types if collection is empty
const DEFAULT_TYPES = [
  { name: "Gıda Kolisi", defaultUnit: "Koli" },
  { name: "Hijyen Paketi", defaultUnit: "Paket" },
  { name: "Kışlık Giyim Yardımı", defaultUnit: "Adet" },
  { name: "Kömür / Yakacak", defaultUnit: "Çuval" },
  { name: "Kırtasiye Seti", defaultUnit: "Set" },
  { name: "Battaniye / Yatak", defaultUnit: "Adet" },
  { name: "Hasta Bezi", defaultUnit: "Paket" },
];

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !session.user) {
      return NextResponse.json({ error: "Yetkisiz erişim" }, { status: 401 });
    }

    await dbConnect();
    let types = await InKindAidType.find({}).sort({ name: 1 });

    if (types.length === 0) {
      try {
        await InKindAidType.insertMany(DEFAULT_TYPES);
        types = await InKindAidType.find({}).sort({ name: 1 });
      } catch (e) {
        // ignore seed conflict
      }
    }

    return NextResponse.json(types);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !session.user) {
      return NextResponse.json({ error: "Yetkisiz erişim" }, { status: 401 });
    }

    const userRole = (session.user as any).role;
    if (userRole !== "manager" && userRole !== "superadmin") {
      return NextResponse.json({ error: "Bu işlem için yetkiniz yok" }, { status: 403 });
    }

    const { name, defaultUnit } = await req.json();

    if (!name || !name.trim()) {
      return NextResponse.json({ error: "Tür adı zorunludur" }, { status: 400 });
    }

    await dbConnect();

    const existing = await InKindAidType.findOne({ name: name.trim() });
    if (existing) {
      return NextResponse.json({ error: "Bu tür zaten mevcut" }, { status: 400 });
    }

    const newType = await InKindAidType.create({
      name: name.trim(),
      defaultUnit: defaultUnit?.trim() || "Adet",
    });

    return NextResponse.json(newType, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !session.user) {
      return NextResponse.json({ error: "Yetkisiz erişim" }, { status: 401 });
    }

    const userRole = (session.user as any).role;
    if (userRole !== "manager" && userRole !== "superadmin") {
      return NextResponse.json({ error: "Bu işlem için yetkiniz yok" }, { status: 403 });
    }

    const url = new URL(req.url);
    const id = url.searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "ID gerekli" }, { status: 400 });
    }

    await dbConnect();
    await InKindAidType.findByIdAndDelete(id);

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
