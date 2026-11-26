import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import dbConnect from "@/lib/db";
import BabyFood from "@/models/BabyFood";
import Log from "@/models/Log";
import User from "@/models/User";
import { turkishIncludes } from "@/lib/turkish";
import { parseDeliveryDate } from "@/lib/date";

export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !session.user) {
      return NextResponse.json({ error: "Yetkisiz erişim" }, { status: 401 });
    }

    const url = new URL(req.url);
    const dateStart = url.searchParams.get("dateStart");
    const dateEnd = url.searchParams.get("dateEnd");
    const userId = url.searchParams.get("userId");
    const brand = url.searchParams.get("brand");
    const search = url.searchParams.get("search");

    await dbConnect();
    if (!User) {
      // ensure User model is registered for populate
    }

    const conditions: any[] = [];

    if (dateStart || dateEnd) {
      const dateFilter: any = {};
      if (dateStart) dateFilter.$gte = new Date(dateStart);
      if (dateEnd) dateFilter.$lte = new Date(dateEnd);

      conditions.push({
        $or: [
          { deliveryDate: dateFilter },
          { deliveryDate: { $exists: false }, createdAt: dateFilter },
          { deliveryDate: null, createdAt: dateFilter },
        ],
      });
    }

    if (userId) {
      conditions.push({ createdBy: userId });
    }

    if (brand) {
      conditions.push({ "items.brand": brand });
    }

    const query = conditions.length > 0 ? { $and: conditions } : {};
    const hasFilter = Boolean(
      dateStart || dateEnd || userId || brand || (search && search.trim())
    );

    let dbQuery = BabyFood.find(query)
      .populate("createdBy", "name email")
      .sort({ deliveryDate: -1, createdAt: -1 });

    if (!hasFilter) {
      dbQuery = dbQuery.limit(400);
    }

    const records = await dbQuery.lean();

    const filteredRecords =
      search && search.trim()
        ? records.filter((r: any) => {
            const q = search.trim();
            const itemsText = (r.items || [])
              .map((it: any) => `${it.brand || ""} ${it.foodName || ""}`)
              .join(" ");
            const combined = [
              r.motherInfo,
              r.tcNo,
              r.receiver,
              r.babyName,
              r.createdBy?.name,
              itemsText,
            ]
              .filter(Boolean)
              .join(" ");
            return turkishIncludes(combined, q);
          })
        : records;

    return NextResponse.json(filteredRecords);
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
    const userId = userAny.id || userAny._id;
    const tcNo = body.tcNo?.trim() || body.motherInfo?.match(/\b\d{11}\b/)?.[0] || "";
    const deliveryDate = parseDeliveryDate(body.deliveryDate);

    const newRecord = await BabyFood.create({
      ...body,
      tcNo,
      deliveryDate,
      createdBy: userId,
    });

    const itemsDetail = Array.isArray(body.items)
      ? body.items.map((i: any) => `${i.quantity} adet ${i.brand} ${i.foodName} (${i.weight})`).join(', ')
      : '';
    void Log.create({
      userId: userId,
      action: "Bebek Maması Kaydı Eklendi",
      details: `${body.motherInfo} isimli anneye ${itemsDetail} teslim edildi.`,
    }).catch(() => {});

    return NextResponse.json(newRecord, { status: 201 });
  } catch (error: any) {
    console.error("Baby food POST error:", error);
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

    const { getEffectivePermissions } = await import("@/lib/permissions");
    const perms = await getEffectivePermissions(session);
    if (!perms.canManageBabyFood && record.createdBy.toString() !== userAny.id) {
      return NextResponse.json({ error: "Bu kaydı düzenleme yetkiniz yok" }, { status: 403 });
    }

    const tcNo = updateData.tcNo?.trim() || updateData.motherInfo?.match(/\b\d{11}\b/)?.[0] || record.tcNo || "";
    const deliveryDate = updateData.deliveryDate
      ? parseDeliveryDate(updateData.deliveryDate)
      : record.deliveryDate || record.createdAt;
    const updatedRecord = await BabyFood.findByIdAndUpdate(
      _id,
      { ...updateData, tcNo, deliveryDate },
      { new: true }
    );

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

    const { getEffectivePermissions } = await import("@/lib/permissions");
    const perms = await getEffectivePermissions(session);
    if (!perms.canManageBabyFood && record.createdBy.toString() !== userAny.id) {
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
