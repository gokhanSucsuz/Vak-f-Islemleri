import crypto from "crypto";
import type { Schema } from "mongoose";

const PREFIX = "enc:v1:";
const BUF_MAGIC = Buffer.from("ENC1", "ascii");
const SALT = "vakif-aes256gcm-v1-salt";

let cachedKey: Buffer | null = null;
let cachedRawKey: string | undefined = undefined;

function getDerivedKey(): Buffer | null {
  const raw = (process.env.DATA_ENCRYPTION_KEY || "").trim();
  if (!raw) return null;
  if (cachedKey && cachedRawKey === raw) return cachedKey;
  cachedKey = crypto.scryptSync(raw, SALT, 32);
  cachedRawKey = raw;
  return cachedKey;
}

export function isEncryptionEnabled(): boolean {
  return Boolean((process.env.DATA_ENCRYPTION_KEY || "").trim());
}

export function isEncryptedString(val: unknown): val is string {
  return typeof val === "string" && val.startsWith(PREFIX);
}

export function encryptText(plain: unknown): any {
  if (plain === null || plain === undefined) return plain;
  const str = String(plain);
  if (str === "") return "";
  if (str.startsWith(PREFIX)) return str;

  const key = getDerivedKey();
  if (!key) return str;

  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(str, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return PREFIX + Buffer.concat([iv, authTag, encrypted]).toString("base64");
}

export function decryptText(val: unknown): any {
  if (typeof val !== "string" || !val.startsWith(PREFIX)) return val;

  const key = getDerivedKey();
  if (!key) return val;

  try {
    const raw = Buffer.from(val.slice(PREFIX.length), "base64");
    if (raw.length < 29) return val;
    const iv = raw.subarray(0, 12);
    const authTag = raw.subarray(12, 28);
    const ciphertext = raw.subarray(28);

    const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(authTag);
    const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return decrypted.toString("utf8");
  } catch {
    return val;
  }
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
    if (typeof target[field] === "string" && target[field].startsWith(PREFIX)) {
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
