import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/authOptions";
import dbConnect from "@/lib/db";
import ApplicationFile from "@/models/ApplicationFile";
import User from "@/models/User";
import Log from "@/models/Log";
import { normalizeTurkish, extractTC } from "@/lib/turkish";

async function checkManagePermission(session: any): Promise<boolean> {
  if (!session?.user) return false;
  if (session.user.role === "superadmin") return true;
  await dbConnect();
  const dbUser = await User.findById(session.user.id).select("canManageApplications role");
  return Boolean(dbUser?.role === "superadmin" || dbUser?.canManageApplications);
}

// Helper to find a matching column header by common naming variations
function findColumnValue(row: Record<string, any>, possibleNames: string[]): any {
  const keys = Object.keys(row);
  for (const name of possibleNames) {
    const normTarget = normalizeTurkish(name);
    for (const key of keys) {
      if (normalizeTurkish(key) === normTarget) {
        return row[key];
      }
    }
  }
  return undefined;
}

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "Yetkisiz erişim" }, { status: 401 });
    }

    const canManage = await checkManagePermission(session);
    if (!canManage) {
      return NextResponse.json(
        { error: "Excel yükleme yetkiniz bulunmamaktadır." },
        { status: 403 }
      );
    }

    await dbConnect();
    const body = await req.json();
    const { rows, updateExisting = true, customMapping } = body;

    if (!Array.isArray(rows) || rows.length === 0) {
      return NextResponse.json(
        { error: "Yüklenecek veri satırı bulunamadı." },
        { status: 400 }
      );
    }

    let insertedCount = 0;
    let updatedCount = 0;
    let emptyFilesCount = 0;
    let skippedCount = 0;
    const errors: string[] = [];

    for (let index = 0; index < rows.length; index++) {
      const row = rows[index];
      const rowIndex = index + 2; // Excel row numbering usually starts at 2 (1 = header)

      // 1. Resolve Application No (Primary Key / Hane No / Dosya No)
      let appNoRaw = customMapping?.applicationNo
        ? row[customMapping.applicationNo]
        : findColumnValue(row, [
            "Başvuru No",
            "Basvuru No",
            "Başvuru Numarası",
            "Basvuru Numarasi",
            "Hane No",
            "Hane Numarası",
            "Hane Dosya No",
            "Dosya No",
            "Dosya Numarası",
            "BasvuruNo",
            "DosyaNo",
            "HaneNo",
            "Sıra No",
            "Sira No",
            "No",
          ]);

      if (appNoRaw === undefined || appNoRaw === null || String(appNoRaw).trim() === "") {
        // If row has no application number, we cannot use it as primary key
        skippedCount++;
        errors.push(`Satır ${rowIndex}: Başvuru/Hane/Dosya numarası boş olduğu için atlandı.`);
        continue;
      }

      const applicationNo = String(appNoRaw).trim();
      const numericSeq = parseInt(applicationNo.replace(/\D/g, ""), 10) || 0;

      // 2. Resolve Applicant Name (Adı Soyadı)
      let nameRaw = customMapping?.applicantName
        ? row[customMapping.applicantName]
        : findColumnValue(row, [
            "Adı Soyadı",
            "Ad Soyad",
            "Adi Soyadi",
            "Adı",
            "Adi",
            "Müracaatçı",
            "Muracaatci",
            "Hak Sahibi",
            "Vatandaş Adı Soyadı",
            "Vatandaş",
            "Başvuran",
            "İsim",
            "Ad",
          ]);

      const applicantName = nameRaw !== undefined && nameRaw !== null ? String(nameRaw).trim() : "";
      const isNameEmpty =
        !applicantName ||
        applicantName === "" ||
        applicantName.toLowerCase() === "boş" ||
        applicantName.toLowerCase() === "bos" ||
        applicantName.toLowerCase() === "boş dosya";

      // 3. Resolve TC No
      let tcRaw = customMapping?.tcNo
        ? row[customMapping.tcNo]
        : findColumnValue(row, [
            "T.C. Kimlik No",
            "TC Kimlik No",
            "TC No",
            "T.C. No",
            "TC",
            "Kimlik No",
            "TcKimlikNo",
            "TcNo",
          ]);

      let tcNo = tcRaw !== undefined && tcRaw !== null ? String(tcRaw).trim() : "";
      if (!tcNo && applicantName) {
        const foundTc = extractTC(applicantName);
        if (foundTc) tcNo = foundTc;
      }
      tcNo = tcNo.replace(/\D/g, "").slice(0, 11);

      // 4. Resolve Phone
      let phoneRaw = customMapping?.phone
        ? row[customMapping.phone]
        : findColumnValue(row, [
            "Telefon",
            "Cep Telefonu",
            "GSM",
            "Tel",
            "İletişim",
            "Iletisim",
            "Cep Tel",
            "Telefon No",
          ]);
      const phone = phoneRaw !== undefined && phoneRaw !== null ? String(phoneRaw).trim() : "";

      // 5. Resolve Address
      let addrRaw = customMapping?.address
        ? row[customMapping.address]
        : findColumnValue(row, [
            "Adres",
            "İkametgah",
            "Ikametgah",
            "Mahalle",
            "Cadde",
            "Sokak",
            "Adres Bilgisi",
            "Yerleşim Yeri",
          ]);
      const address = addrRaw !== undefined && addrRaw !== null ? String(addrRaw).trim() : "";

      // 6. Resolve Status
      let statusRaw = customMapping?.fileStatus
        ? row[customMapping.fileStatus]
        : findColumnValue(row, ["Durum", "Dosya Durumu", "Statü", "Statu"]);
      let fileStatus = statusRaw !== undefined && statusRaw !== null ? String(statusRaw).trim() : "";
      if (!fileStatus) {
        fileStatus = isNameEmpty ? "Boş Dosya" : "Aktif";
      }

      // 7. Store Extra Columns from the Excel Row
      const extraData: Record<string, any> = {};
      const knownKeys = new Set(
        [
          customMapping?.applicationNo,
          customMapping?.applicantName,
          customMapping?.tcNo,
          customMapping?.phone,
          customMapping?.address,
          customMapping?.fileStatus,
        ].filter(Boolean)
      );

      for (const [k, v] of Object.entries(row)) {
        if (!knownKeys.has(k)) {
          extraData[k] = v;
        }
      }

      if (isNameEmpty) {
        emptyFilesCount++;
      }

      // 8. Upsert by Primary Key (applicationNo)
      const existing = await ApplicationFile.findOne({ applicationNo });

      if (existing) {
        if (updateExisting) {
          existing.applicationNoSeq = numericSeq;
          existing.applicantName = isNameEmpty ? "" : applicantName;
          existing.tcNo = tcNo || existing.tcNo;
          existing.phone = phone || existing.phone;
          existing.address = address || existing.address;
          existing.fileStatus = fileStatus || existing.fileStatus;
          existing.extraData = { ...existing.extraData, ...extraData };
          existing.columnHeaders = Object.keys(row);
          existing.updatedBy = session.user.id;
          await existing.save();
          updatedCount++;
        } else {
          skippedCount++;
        }
      } else {
        const newRecord = new ApplicationFile({
          applicationNo,
          applicationNoSeq: numericSeq,
          applicantName: isNameEmpty ? "" : applicantName,
          tcNo,
          phone,
          address,
          fileStatus,
          extraData,
          columnHeaders: Object.keys(row),
          createdBy: session.user.id,
          updatedBy: session.user.id,
        });
        await newRecord.save();
        insertedCount++;
      }
    }

    try {
      await Log.create({
        userId: session.user.id,
        action: "Excel Dosyası Yüklendi",
        details: `Toplam: ${rows.length}, Eklenen: ${insertedCount}, Güncellenen: ${updatedCount}, Boş Dosya: ${emptyFilesCount}, Atlanan: ${skippedCount}`,
      });
    } catch (err) {
      console.error("Log error:", err);
    }

    return NextResponse.json({
      success: true,
      summary: {
        totalProcessed: rows.length,
        insertedCount,
        updatedCount,
        emptyFilesCount,
        skippedCount,
      },
      errors: errors.slice(0, 10), // return top 10 errors if any
    });
  } catch (error: any) {
    console.error("POST /api/application-files/import error:", error);
    return NextResponse.json(
      { error: error.message || "Excel verileri yüklenirken sunucu hatası oluştu." },
      { status: 500 }
    );
  }
}

