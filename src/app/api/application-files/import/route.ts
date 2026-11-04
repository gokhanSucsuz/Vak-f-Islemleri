import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/authOptions";
import dbConnect from "@/lib/db";
import ApplicationFile from "@/models/ApplicationFile";
import User from "@/models/User";
import Log from "@/models/Log";
import {
  normalizeTurkish,
  extractTC,
  extractAndCleanTC,
  parseDateOrExtractDate,
} from "@/lib/turkish";

async function checkManagePermission(session: any): Promise<boolean> {
  if (!session?.user) return false;
  if (session.user.role === "superadmin") return true;
  await dbConnect();
  const dbUser = await User.findById(session.user.id).select("canManageApplications role");
  return Boolean(dbUser?.role === "superadmin" || dbUser?.canManageApplications);
}

// Sütun başlığını esnek Türkçe normalize kontrol ile bulma
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

// GET: Yüklenen Excel paketlerinin (Batch) listesini döner
export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "Yetkisiz erişim" }, { status: 401 });
    }

    await dbConnect();

    // importBatchId'ye göre grupla
    const batches = await ApplicationFile.aggregate([
      {
        $match: { importBatchId: { $exists: true, $ne: "" } },
      },
      {
        $group: {
          _id: "$importBatchId",
          name: { $first: "$importBatchName" },
          count: { $sum: 1 },
          firstCreatedAt: { $min: "$createdAt" },
          lastCreatedAt: { $max: "$createdAt" },
        },
      },
      { $sort: { firstCreatedAt: -1 } },
    ]);

    return NextResponse.json({ batches });
  } catch (error: any) {
    console.error("GET /api/application-files/import error:", error);
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 });
  }
}

// POST: Excel satırlarını hızlı, güvenli ve kurallara uygun olarak sisteme aktarır
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
    const { rows, sheets, customMapping, fileName = "Excel Yüklemesi" } = body;

    interface ProcessItem {
      row: Record<string, any>;
      sheetName: string;
      columnHeaders: string[];
      rowIndex: number;
    }

    const itemsToProcess: ProcessItem[] = [];

    if (sheets && Array.isArray(sheets) && sheets.length > 0) {
      for (const s of sheets) {
        const sName = (s.sheetName || "Sayfa 1").trim();
        const sCols =
          s.columnHeaders && s.columnHeaders.length > 0
            ? s.columnHeaders
            : s.rows && s.rows[0]
            ? Object.keys(s.rows[0])
            : [];
        (s.rows || []).forEach((r: any, idx: number) => {
          itemsToProcess.push({
            row: r,
            sheetName: sName,
            columnHeaders: sCols,
            rowIndex: idx + 2,
          });
        });
      }
    } else if (Array.isArray(rows) && rows.length > 0) {
      const cols = rows[0] ? Object.keys(rows[0]) : [];
      rows.forEach((r: any, idx: number) => {
        itemsToProcess.push({
          row: r,
          sheetName: (r._sheetName || body.sheetName || "Sayfa 1").trim(),
          columnHeaders: cols,
          rowIndex: idx + 2,
        });
      });
    }

    if (itemsToProcess.length === 0) {
      return NextResponse.json(
        { error: "Yüklenecek veri satırı bulunamadı." },
        { status: 400 }
      );
    }

    const batchId = `batch_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const batchName = `${fileName} - ${new Date().toLocaleDateString("tr-TR")} ${new Date().toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })}`;

    let insertedCount = 0;
    let updatedCount = 0;
    let emptyFilesCount = 0;
    let skippedCount = 0;
    const errors: string[] = [];

    // Toplu işlemler için hazırlık (Chunking 500)
    const CHUNK_SIZE = 500;
    const bulkOps: any[] = [];
    const seenInSheet = new Map<string, number>();

    for (let index = 0; index < itemsToProcess.length; index++) {
      const { row, sheetName, columnHeaders, rowIndex } = itemsToProcess[index];

      // 1. BAŞVURU NO (Birincil Anahtar / Primary Key)
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
            "Sıra",
            "Sira",
            "No",
          ]);

      let applicationNo = "";
      if (appNoRaw !== undefined && appNoRaw !== null && String(appNoRaw).trim() !== "") {
        applicationNo = String(appNoRaw).trim();
      } else {
        // Otomatik sıra numarası ata (veri kaybı olmaması için)
        applicationNo = String(rowIndex - 1);
      }

      // Sekme içinde mükerrer başvuru numaralarını ayırt et (veri kaybını ve duplicate key hatasını önler)
      const sheetKey = `${sheetName}___${applicationNo}`;
      const prevCount = seenInSheet.get(sheetKey) || 0;
      seenInSheet.set(sheetKey, prevCount + 1);
      if (prevCount > 0) {
        applicationNo = `${applicationNo}-${prevCount + 1}`;
      }

      const numericSeq = parseInt(applicationNo.replace(/\D/g, ""), 10) || rowIndex - 1;

      // 2. ADI SOYADI & T.C. AYIKLAMA
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

      const nameStr = nameRaw !== undefined && nameRaw !== null ? String(nameRaw).trim() : "";
      const { tc: tcFromName, cleanText: cleanedApplicantName } = extractAndCleanTC(nameStr);

      const isNameEmpty =
        !cleanedApplicantName ||
        cleanedApplicantName === "" ||
        cleanedApplicantName.toLowerCase() === "boş" ||
        cleanedApplicantName.toLowerCase() === "bos" ||
        cleanedApplicantName.toLowerCase() === "boş dosya";

      // 3. EŞİNİN ADI SOYADI & T.C. AYIKLAMA
      let spouseRaw = customMapping?.spouseName
        ? row[customMapping.spouseName]
        : findColumnValue(row, [
            "Eşinin Adı Soyadı",
            "Eşinin Adı",
            "Eş Adı Soyadı",
            "Eş Adı",
            "Es Adı Soyadı",
            "Es Adi Soyadi",
            "Eş",
            "Es",
            "Eş Bilgisi",
          ]);

      const spouseStr = spouseRaw !== undefined && spouseRaw !== null ? String(spouseRaw).trim() : "";
      const { tc: tcFromSpouse, cleanText: cleanedSpouseName } = extractAndCleanTC(spouseStr);

      // 4. T.C. KİMLİK NUMARASI
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

      let finalTc = tcRaw !== undefined && tcRaw !== null ? String(tcRaw).replace(/\D/g, "").slice(0, 11) : "";
      if (!finalTc && tcFromName) {
        finalTc = tcFromName;
      }

      // 5. YARDIM TÜRÜ VEYA BAŞVURU TARİHİ & TARİH AYIKLAMA
      // Kullanıcı kuralı: "kayıt tarihi alanı yok ise veya yardım türü sütununda tarih var ise kayıt tarihi o olacak. herhangi bir tarih yok ise tarih alanı boş olsun."
      let dateColRaw = customMapping?.applicationDate
        ? row[customMapping.applicationDate]
        : findColumnValue(row, [
            "Başvuru Tarihi",
            "Kayıt Tarihi",
            "Basvuru Tarihi",
            "Kayit Tarihi",
            "Tarih",
          ]);

      let helpTypeColRaw = customMapping?.helpType
        ? row[customMapping.helpType]
        : findColumnValue(row, [
            "Yardım Türü veya Başvuru Tarihi",
            "Yardım Türü / Başvuru Tarihi",
            "Yardım Türü",
            "Yardim Turu",
            "Yardım",
            "Yardim",
          ]);

      let applicationDate: Date | null = null;
      let helpType = "";

      // Önce doğrudan tarih sütunu var mı kontrol et
      if (dateColRaw !== undefined && dateColRaw !== null && dateColRaw !== "") {
        const parsed = parseDateOrExtractDate(dateColRaw);
        if (parsed.date) {
          applicationDate = parsed.date;
        }
      }

      // Yardım Türü veya Başvuru Tarihi sütununu analiz et
      if (helpTypeColRaw !== undefined && helpTypeColRaw !== null && helpTypeColRaw !== "") {
        const parsed = parseDateOrExtractDate(helpTypeColRaw);
        if (parsed.date && !applicationDate) {
          applicationDate = parsed.date;
        }
        helpType = parsed.remainingText || "";
        if (!helpType && !parsed.date) {
          helpType = String(helpTypeColRaw).trim();
        }
      }

      // 6. MAHALLE / KÖY
      let neighborhoodRaw = customMapping?.neighborhood
        ? row[customMapping.neighborhood]
        : findColumnValue(row, [
            "Mahalle/Köy",
            "Mahalle / Köy",
            "Mahalle",
            "Köy",
            "Mahalle/Koy",
            "Mahalle / Koy",
            "Yerleşim Yeri",
            "Köyü",
            "Mahallesi",
          ]);
      const neighborhood =
        neighborhoodRaw !== undefined && neighborhoodRaw !== null ? String(neighborhoodRaw).trim() : "";

      // 7. TELEFON & ADRES
      let phoneRaw = customMapping?.phone
        ? row[customMapping.phone]
        : findColumnValue(row, ["Telefon", "Cep Telefonu", "GSM", "Tel", "İletişim"]);
      const phone = phoneRaw !== undefined && phoneRaw !== null ? String(phoneRaw).trim() : "";

      let addrRaw = customMapping?.address
        ? row[customMapping.address]
        : findColumnValue(row, ["Adres", "İkametgah", "Açık Adres"]);
      const address = addrRaw !== undefined && addrRaw !== null ? String(addrRaw).trim() : neighborhood;

      // 8. DURUM
      const fileStatus = isNameEmpty ? "Boş Dosya" : "Aktif";
      if (isNameEmpty) emptyFilesCount++;

      // 9. DİĞER EK SÜTUNLAR (Kaybı önlemek için)
      const extraData: Record<string, any> = {};
      for (const [k, v] of Object.entries(row)) {
        if (!k.startsWith("_")) {
          extraData[k] = v;
        }
      }

      // bulkWrite updateOne (upsert)
      bulkOps.push({
        updateOne: {
          filter: { applicationNo, sheetName },
          update: {
            $set: {
              applicationNo,
              applicationNoSeq: numericSeq,
              sheetName,
              applicantName: isNameEmpty ? "" : cleanedApplicantName,
              spouseName: cleanedSpouseName || "",
              tcNo: finalTc || "",
              spouseTcNo: tcFromSpouse || "",
              helpType: helpType || "",
              applicationDate: applicationDate, // null ise null olarak kalır!
              neighborhood: neighborhood || "",
              address: address || "",
              phone: phone || "",
              fileStatus: fileStatus,
              importBatchId: batchId,
              importBatchName: batchName,
              extraData: extraData,
              columnHeaders:
                columnHeaders && columnHeaders.length > 0
                  ? columnHeaders
                  : Object.keys(extraData),
              updatedBy: session.user.id,
            },
            $setOnInsert: {
              createdBy: session.user.id,
            },
          },
          upsert: true,
        },
      });
    }

    // Chunklar halinde hızlı ve güvenli bulkWrite çalıştır (Hata durumunda satır satır kurtarma)
    for (let i = 0; i < bulkOps.length; i += CHUNK_SIZE) {
      const chunk = bulkOps.slice(i, i + CHUNK_SIZE);
      try {
        const res = await ApplicationFile.bulkWrite(chunk, { ordered: false });
        insertedCount += res.upsertedCount || 0;
        updatedCount += res.modifiedCount || 0;
      } catch (chunkErr: any) {
        console.warn("bulkWrite chunk uyarısı, satır bazlı güvenli işleme geçiliyor:", chunkErr.message);
        for (const op of chunk) {
          try {
            const res = await ApplicationFile.updateOne(
              op.updateOne.filter,
              op.updateOne.update,
              { upsert: true }
            );
            if (res.upsertedCount) insertedCount++;
            else if (res.modifiedCount) updatedCount++;
          } catch (singleErr: any) {
            const appNo = op.updateOne?.filter?.applicationNo || "Bilinmeyen";
            errors.push(`Başvuru No: ${appNo} - ${singleErr.message}`);
            skippedCount++;
          }
        }
      }
    }

    try {
      await Log.create({
        userId: session.user.id,
        action: "Excel Dosyası Yüklendi",
        details: `${batchName} -> Toplam Satır: ${itemsToProcess.length}, Eklenen: ${insertedCount}, Güncellenen: ${updatedCount}, Boş Dosya: ${emptyFilesCount}, Atlanan: ${skippedCount}`,
      });
    } catch (err) {
      console.error("Log error:", err);
    }

    return NextResponse.json({
      success: true,
      batchId,
      batchName,
      summary: {
        totalProcessed: itemsToProcess.length,
        insertedCount,
        updatedCount,
        emptyFilesCount,
        skippedCount,
      },
      errors: errors.slice(0, 10),
    });
  } catch (error: any) {
    console.error("POST /api/application-files/import error:", error);
    return NextResponse.json(
      { error: error.message || "Excel verileri yüklenirken sunucu hatası oluştu." },
      { status: 500 }
    );
  }
}

// DELETE: Yüklenen Excel paketini silme veya tüm kayıtları sıfırlama
export async function DELETE(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "Yetkisiz erişim" }, { status: 401 });
    }

    // Yüklenen dosyayı silme işlemini süper admin veya yetkili kullanıcı yapabilir
    const canManage = await checkManagePermission(session);
    if (!canManage) {
      return NextResponse.json(
        { error: "Bu silme işlemi için yetkiniz bulunmamaktadır." },
        { status: 403 }
      );
    }

    await dbConnect();
    const { searchParams } = new URL(req.url);
    const batchId = searchParams.get("batchId");
    const clearAll = searchParams.get("clearAll") === "true";

    if (clearAll) {
      // Tüm kayıtları sıfırlama (Süper Admin veya Yetkilendirilmiş Kullanıcı)
      if (!canManage) {
        return NextResponse.json(
          { error: "Tüm kayıtları sıfırlama yetkiniz bulunmamaktadır." },
          { status: 403 }
        );
      }

      const count = await ApplicationFile.countDocuments();
      await ApplicationFile.deleteMany({});

      try {
        await Log.create({
          userId: session.user.id,
          action: "Tüm Başvuru Dosyaları Silindi",
          details: `Toplam ${count} dosya kaydı sistemden tamamen silindi.`,
        });
      } catch (err) {
        console.error("Log error:", err);
      }

      return NextResponse.json({
        success: true,
        message: `Sistemdeki tüm ${count} dosya kaydı başarıyla silindi. Yeni dosyanızı yükleyebilirsiniz.`,
        deletedCount: count,
      });
    }

    if (batchId) {
      // Belirli bir Excel yüklemesini silme
      const result = await ApplicationFile.deleteMany({ importBatchId: batchId });

      try {
        await Log.create({
          userId: session.user.id,
          action: "Excel Yükleme Paketi Silindi",
          details: `Paket ID: ${batchId}, Silinen Kayıt Sayısı: ${result.deletedCount}`,
        });
      } catch (err) {
        console.error("Log error:", err);
      }

      return NextResponse.json({
        success: true,
        message: `Yüklenen Excel paketine ait ${result.deletedCount} kayıt silindi.`,
        deletedCount: result.deletedCount,
      });
    }

    return NextResponse.json(
      { error: "Geçerli bir batchId veya clearAll parametresi belirtiniz." },
      { status: 400 }
    );
  } catch (error: any) {
    console.error("DELETE /api/application-files/import error:", error);
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 });
  }
}
