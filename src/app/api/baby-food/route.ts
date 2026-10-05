import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import dbConnect from "@/lib/db";
import BabyFood from "@/models/BabyFood";
import Log from "@/models/Log";

export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !session.user) {
      return NextResponse.json({ error: "Yetkisiz erişim" }, { status: 401 });
    }

    const url = new URL(req.url);
    const dateStart = url.searchParams.get("dateStart");
    const dateEnd = url.searchParams.get("dateEnd");

    await dbConnect();

    const query: any = {};
    if (dateStart || dateEnd) {
      query.createdAt = {};
      if (dateStart) query.createdAt.$gte = new Date(dateStart);
      if (dateEnd) query.createdAt.$lte = new Date(dateEnd);
    }

    // All roles can view all records (or filtered by date)
    const records = await BabyFood.find(query).populate('createdBy', 'name').sort({ createdAt: -1 });
    
    return NextResponse.json(records);
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

    const body = await req.json();
    await dbConnect();

    const userAny = session.user as any;

    const newRecord = await BabyFood.create({
      ...body,
      createdBy: userAny.id,
    });

    try {
      const itemsDetail = body.items.map((i: any) => `${i.quantity} adet ${i.brand} ${i.foodName} (${i.weight})`).join(', ');
      await Log.create({
        userId: userAny.id,
        action: "Bebek Maması Kaydı Eklendi",
        details: `${body.motherInfo} isimli anneye ${itemsDetail} teslim edildi.`,
      });
    } catch (e) {
      // Ignore log error
    }

    return NextResponse.json(newRecord, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !session.user) {
      return NextResponse.json({ error: "Yetkisiz erişim" }, { status: 401 });
    }

    const { _id, ...updateData } = await req.json();
    await dbConnect();

    const userAny = session.user as any;
    const record = await BabyFood.findById(_id);

    if (!record) {
      return NextResponse.json({ error: "Kayıt bulunamadı" }, { status: 404 });
    }

    if (userAny.role === "personnel" && record.createdBy.toString() !== userAny.id) {
      return NextResponse.json({ error: "Bu kaydı düzenleme yetkiniz yok" }, { status: 403 });
    }

    const updatedRecord = await BabyFood.findByIdAndUpdate(_id, updateData, { new: true });

    try {
      await Log.create({
        userId: userAny.id,
        action: "Bebek Maması Kaydı Güncellendi",
        details: `${updateData.motherInfo} kişisinin mama kaydı düzenlendi.`,
      });
    } catch (e) {
      // Ignore log error
    }

    return NextResponse.json(updatedRecord);
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

    const url = new URL(req.url);
    const id = url.searchParams.get("id");
    
    if (!id) {
      return NextResponse.json({ error: "ID gerekli" }, { status: 400 });
    }

    await dbConnect();

    const userAny = session.user as any;
    const record = await BabyFood.findById(id);

    if (!record) {
      return NextResponse.json({ error: "Kayıt bulunamadı" }, { status: 404 });
    }

    if (userAny.role === "personnel" && record.createdBy.toString() !== userAny.id) {
      return NextResponse.json({ error: "Bu kaydı silme yetkiniz yok" }, { status: 403 });
    }

    await BabyFood.findByIdAndDelete(id);

    try {
      await Log.create({
        userId: userAny.id,
        action: "Bebek Maması Kaydı Silindi",
        details: `${record.motherInfo} kişisinin mama kaydı silindi.`,
      });
    } catch (e) {
      // Ignore log error
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
