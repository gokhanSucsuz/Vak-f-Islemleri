import type jsPDF from "jspdf";

let cachedRegularB64: string | null = null;
let cachedBoldB64: string | null = null;

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = "";
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

/**
 * jsPDF içine tam Türkçe UTF-8 karakter destekli Arial (Normal + Bold) fontlarını yükler.
 * İndirilen fontlar istemci belleğinde önbelleğe alınır.
 */
export async function registerTurkishFont(doc: jsPDF): Promise<string> {
  if (!cachedRegularB64 || !cachedBoldB64) {
    const [regRes, boldRes] = await Promise.all([
      fetch("/fonts/arial.ttf"),
      fetch("/fonts/arialbd.ttf"),
    ]);

    if (!regRes.ok || !boldRes.ok) {
      throw new Error("Türkçe PDF font dosyaları yüklenemedi.");
    }

    const [regBuf, boldBuf] = await Promise.all([
      regRes.arrayBuffer(),
      boldRes.arrayBuffer(),
    ]);

    cachedRegularB64 = arrayBufferToBase64(regBuf);
    cachedBoldB64 = arrayBufferToBase64(boldBuf);
  }

  doc.addFileToVFS("arial.ttf", cachedRegularB64);
  doc.addFont("arial.ttf", "TurkishArial", "normal");

  doc.addFileToVFS("arialbd.ttf", cachedBoldB64);
  doc.addFont("arialbd.ttf", "TurkishArial", "bold");

  doc.setFont("TurkishArial", "normal");
  return "TurkishArial";
}
