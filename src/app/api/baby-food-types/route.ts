import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import dbConnect from "@/lib/db";
import BabyFoodType from "@/models/BabyFoodType";
import Log from "@/models/Log";

export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !session.user) {
      return NextResponse.json({ error: "Yetkisiz erişim" }, { status: 401 });
    }

    await dbConnect();
    const records = await BabyFoodType.find().sort({ brand: 1, foodName: 1, weight: 1 });
    return NextResponse.json(records);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    const userAny = session?.user as any;
    if (!session || !session.user || (userAny.role !== "manager" && userAny.role !== "superadmin")) {
      return NextResponse.json({ error: "Bu işlem için yetkiniz yok" }, { status: 403 });
    }

    const body = await req.json();
    await dbConnect();

    const newRecord = await BabyFoodType.create(body);

    try {
      await Log.create({
        userId: userAny.id,
        action: "Mama Tanımı Eklendi",
        details: `${body.brand} ${body.foodName} (${body.weight}) sisteme eklendi.`,
      });
    } catch (e) {
      // Ignore log error
    }

    return NextResponse.json(newRecord, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    const userAny = session?.user as any;
    if (!session || !session.user || (userAny.role !== "manager" && userAny.role !== "superadmin")) {
      return NextResponse.json({ error: "Bu işlem için yetkiniz yok" }, { status: 403 });
    }

    const url = new URL(req.url);
    const id = url.searchParams.get("id");
    
    if (!id) {
      return NextResponse.json({ error: "ID gerekli" }, { status: 400 });
    }

    await dbConnect();
    const record = await BabyFoodType.findByIdAndDelete(id);

    if (record) {
      try {
        await Log.create({
          userId: userAny.id,
          action: "Mama Tanımı Silindi",
          details: `${record.brand} ${record.foodName} (${record.weight}) sistemden silindi.`,
        });
      } catch (e) {
        // Ignore log error
      }
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
