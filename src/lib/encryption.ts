import crypto from "crypto";
import CryptoJS from "crypto-js";
import type { Schema } from "mongoose";

const PREFIX = "enc:v1:";
const LEGACY_CRYPTOJS_PREFIX = "U2FsdGVkX1";
const BUF_MAGIC = Buffer.from("ENC1", "ascii");
const SALT = "vakif-aes256gcm-v1-salt";

export const LEGACY_ENCRYPTION_KEY =
  "FDS%+6+^%+^&%+/&%RUFGbvddYTYgfde9878.,.,.,*YH&/y64gr6yuhjkjklsfds%+&__-?09786OOPPLJHN:bnhgvcf9Y%/%/&&978%+&%++^575687998//&+^popoxzaQW^+3asdASzZWQ";
const DEFAULT_OLD_SECRET = "default-super-secret-key-1234567890";

let cachedKey: Buffer | null = null;
let cachedRawKey: string | undefined = undefined;
let cachedLegacyScryptKey: Buffer | null = null;

function getDerivedKey(): Buffer | null {
  const raw = (process.env.DATA_ENCRYPTION_KEY || process.env.ENCRYPTION_KEY || "").trim();
  if (!raw) return null;
  if (cachedKey && cachedRawKey === raw) return cachedKey;
  cachedKey = crypto.scryptSync(raw, SALT, 32);
  cachedRawKey = raw;
  return cachedKey;
}

function getLegacyScryptKey(): Buffer {
  if (!cachedLegacyScryptKey) {
    cachedLegacyScryptKey = crypto.scryptSync(LEGACY_ENCRYPTION_KEY, SALT, 32);
  }
  return cachedLegacyScryptKey;
}

export function isEncryptionEnabled(): boolean {
  return Boolean((process.env.DATA_ENCRYPTION_KEY || process.env.ENCRYPTION_KEY || "").trim());
}

export function isEncryptedString(val: unknown): val is string {
  return (
    typeof val === "string" &&
    (val.startsWith(PREFIX) || val.startsWith(LEGACY_CRYPTOJS_PREFIX))
  );
}

function decryptLegacyCryptoJs(cipherText: string): string {
  if (!cipherText || !cipherText.startsWith(LEGACY_CRYPTOJS_PREFIX)) return cipherText;
  const candidateKeys = Array.from(
    new Set(
      [
        LEGACY_ENCRYPTION_KEY,
        (process.env.ENCRYPTION_KEY || "").trim(),
        (process.env.DATA_ENCRYPTION_KEY || "").trim(),
        DEFAULT_OLD_SECRET,
      ].filter(Boolean)
    )
  );

  for (const secret of candidateKeys) {
    try {
      const bytes = CryptoJS.AES.decrypt(cipherText, secret);
      const out = bytes.toString(CryptoJS.enc.Utf8);
      if (out && out.trim().length > 0) {
        return out;
      }
    } catch {
      /* try next key */
    }
  }
  return cipherText;
}

function tryAesGcmDecrypt(val: string, key: Buffer): string | null {
  try {
    const raw = Buffer.from(val.slice(PREFIX.length), "base64");
    if (raw.length < 29) return null;
    const iv = raw.subarray(0, 12);
    const authTag = raw.subarray(12, 28);
    const ciphertext = raw.subarray(28);

    const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(authTag);
    const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return decrypted.toString("utf8");
  } catch {
    return null;
  }
}

export function encryptText(plain: unknown): any {
  if (plain === null || plain === undefined) return plain;
  let str = String(plain);
  if (str === "") return "";

  // Eğer eski anahtar ile şifrelenmiş veya iç içe şifrelenmişse önce düz metne çöz
  if (str.startsWith(PREFIX) || str.startsWith(LEGACY_CRYPTOJS_PREFIX)) {
    const unwrapped = decryptText(str);
    if (
      typeof unwrapped === "string" &&
      unwrapped !== str &&
      !unwrapped.startsWith(PREFIX) &&
      !unwrapped.startsWith(LEGACY_CRYPTOJS_PREFIX)
    ) {
      str = unwrapped;
    } else if (str.startsWith(PREFIX)) {
      const primaryKey = getDerivedKey();
      if (primaryKey && tryAesGcmDecrypt(str, primaryKey) !== null) {
        return str;
      }
    }
  }

  const key = getDerivedKey();
  if (!key) return str;

  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(str, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return PREFIX + Buffer.concat([iv, authTag, encrypted]).toString("base64");
}

export function decryptText(val: unknown): any {
  if (typeof val !== "string") return val;
  if (!val.startsWith(PREFIX) && !val.startsWith(LEGACY_CRYPTOJS_PREFIX)) return val;

  let current = val;
  for (let depth = 0; depth < 3; depth++) {
    if (current.startsWith(PREFIX)) {
      const primaryKey = getDerivedKey();
      let out = primaryKey ? tryAesGcmDecrypt(current, primaryKey) : null;
      if (out === null) {
        out = tryAesGcmDecrypt(current, getLegacyScryptKey());
      }
      if (out === null || out === current) break;
      current = out;
    } else if (current.startsWith(LEGACY_CRYPTOJS_PREFIX)) {
      const out = decryptLegacyCryptoJs(current);
      if (out === current) break;
      current = out;
    } else {
      break;
    }
  }
  return current;
}

export const encryptData = encryptText;
export const decryptData = decryptText;

export function encryptJson(obj: unknown): any {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj === "object" && typeof (obj as any).__enc === "string") return obj;

  const key = getDerivedKey();
  if (!key) return obj;

  const jsonStr = JSON.stringify(obj);
  return { __enc: encryptText(jsonStr) };
}

export function decryptJson(val: unknown): any {
  if (!val || typeof val !== "object") return val;
  const encStr = (val as any).__enc;
  if (typeof encStr !== "string" || !encStr.startsWith(PREFIX)) return val;

  const plain = decryptText(encStr);
  if (typeof plain !== "string" || plain.startsWith(PREFIX)) return val;
  try {
    return JSON.parse(plain);
  } catch {
    return val;
  }
}

export function encryptBuffer(buf: Buffer): Buffer {
  if (!buf || !Buffer.isBuffer(buf) || buf.length === 0) return buf;
  if (buf.length >= 4 && buf.subarray(0, 4).equals(BUF_MAGIC)) return buf;

  const key = getDerivedKey();
  if (!key) return buf;

  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(buf), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return Buffer.concat([BUF_MAGIC, iv, authTag, encrypted]);
}

export function decryptBuffer(buf: any): Buffer {
  if (!buf) return buf;
  const raw = Buffer.isBuffer(buf) ? buf : Buffer.from(buf.buffer || buf);
  if (raw.length < 33 || !raw.subarray(0, 4).equals(BUF_MAGIC)) return raw;

  const key = getDerivedKey();
  if (!key) return raw;

  try {
    const iv = raw.subarray(4, 16);
    const authTag = raw.subarray(16, 32);
    const ciphertext = raw.subarray(32);

    const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(authTag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  } catch {
    return raw;
  }
}

export interface FieldEncryptionOptions {
  stringFields?: string[];
  jsonFields?: string[];
  bufferFields?: string[];
}

function encryptTarget(target: any, opts: FieldEncryptionOptions) {
  if (!target || !isEncryptionEnabled()) return;

  for (const field of opts.stringFields || []) {
    if (target[field] !== undefined && target[field] !== null && target[field] !== "") {
      target[field] = encryptText(target[field]);
    }
  }
  for (const field of opts.jsonFields || []) {
    if (target[field] !== undefined && target[field] !== null) {
      target[field] = encryptJson(target[field]);
    }
  }
  for (const field of opts.bufferFields || []) {
    if (target[field]) {
      const b = Buffer.isBuffer(target[field])
        ? target[field]
        : Buffer.from(target[field].buffer || target[field]);
      target[field] = encryptBuffer(b);
    }
  }
}

function decryptTarget(target: any, opts: FieldEncryptionOptions) {
  if (!target || typeof target !== "object") return;

  for (const field of opts.stringFields || []) {
    if (
      typeof target[field] === "string" &&
      (target[field].startsWith(PREFIX) || target[field].startsWith(LEGACY_CRYPTOJS_PREFIX))
    ) {
      target[field] = decryptText(target[field]);
    }
  }
  for (const field of opts.jsonFields || []) {
    if (target[field] && typeof target[field] === "object" && (target[field] as any).__enc) {
      target[field] = decryptJson(target[field]);
    }
  }
  for (const field of opts.bufferFields || []) {
    if (target[field]) {
      target[field] = decryptBuffer(target[field]);
    }
  }
}

export function applyFieldEncryption(schema: Schema, opts: FieldEncryptionOptions) {
  schema.pre("save", function () {
    encryptTarget(this, opts);
  });

  schema.pre("insertMany", function (docs: any[]) {
    if (Array.isArray(docs)) {
      for (const doc of docs) encryptTarget(doc, opts);
    }
  });

  const handleUpdate = function (this: any) {
    const update = this.getUpdate();
    if (!update || !isEncryptionEnabled()) return;
    if (update.$set) encryptTarget(update.$set, opts);
    encryptTarget(update, opts);
  };

  schema.pre("findOneAndUpdate", handleUpdate);
  schema.pre("updateOne", handleUpdate);
  schema.pre("updateMany", handleUpdate);

  schema.post("init", function (doc: any) {
    decryptTarget(doc, opts);
  });

  schema.post("find", function (docs: any[]) {
    if (Array.isArray(docs)) {
      for (const doc of docs) decryptTarget(doc, opts);
    }
  });

  schema.post("findOne", function (doc: any) {
    decryptTarget(doc, opts);
  });

  schema.post("findOneAndUpdate", function (doc: any) {
    decryptTarget(doc, opts);
  });
}
