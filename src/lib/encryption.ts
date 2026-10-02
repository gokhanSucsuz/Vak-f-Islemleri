import crypto from 'crypto-js';

const SECRET_KEY = process.env.ENCRYPTION_KEY || 'default-super-secret-key-1234567890';

export function encryptData(text: string): string {
  if (!text) return text;
  return crypto.AES.encrypt(text, SECRET_KEY).toString();
}

export function decryptData(cipherText: string): string {
  if (!cipherText) return cipherText;
  try {
    const bytes = crypto.AES.decrypt(cipherText, SECRET_KEY);
    const decrypted = bytes.toString(crypto.enc.Utf8);
    return decrypted || cipherText; // Return original if decryption fails (e.g. not encrypted)
  } catch (error) {
    return cipherText;
  }
}
