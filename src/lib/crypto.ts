import { MAX_SHA256_SIZE_BYTES } from './constants';

function bufferToHex(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let hex = '';
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, '0');
  }
  return hex;
}

function hexToUint8Array(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

export function generateSaltHex(byteLength = 16): string {
  const array = new Uint8Array(byteLength);
  crypto.getRandomValues(array);
  return bufferToHex(array.buffer);
}

export async function hashPasswordPBKDF2(
  password: string,
  saltHex: string,
  iterations = 600_000
): Promise<string> {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode(password),
    { name: 'PBKDF2' },
    false,
    ['deriveBits']
  );
  const saltBytes = hexToUint8Array(saltHex);
  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: saltBytes.buffer as ArrayBuffer,
      iterations,
      hash: 'SHA-256',
    },
    keyMaterial,
    256
  );
  return bufferToHex(derivedBits);
}

export async function computeBlobSha256(blob: Blob): Promise<string | null> {
  if (blob.size > MAX_SHA256_SIZE_BYTES) {
    return null;
  }
  try {
    const buffer = await blob.arrayBuffer();
    const digest = await crypto.subtle.digest('SHA-256', buffer);
    return bufferToHex(digest);
  } catch {
    return null;
  }
}

export async function generateImageThumbnailBlob(blob: Blob, maxWidth = 320): Promise<Blob | null> {
  if (typeof document === 'undefined' || !blob.type.startsWith('image/')) {
    return null;
  }
  // Do not rasterize untrusted SVGs through canvas if blocked; handle standard images cleanly
  const url = URL.createObjectURL(blob);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('Failed to load image for thumbnail'));
      image.src = url;
    });

    const naturalW = img.naturalWidth || maxWidth;
    const naturalH = img.naturalHeight || Math.round(maxWidth * 0.75);
    const scale = Math.min(1, maxWidth / naturalW);
    const targetW = Math.max(1, Math.round(naturalW * scale));
    const targetH = Math.max(1, Math.round(naturalH * scale));

    const canvas = document.createElement('canvas');
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    ctx.drawImage(img, 0, 0, targetW, targetH);
    const thumbBlob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob((b) => resolve(b), 'image/png');
    });
    return thumbBlob;
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
}
