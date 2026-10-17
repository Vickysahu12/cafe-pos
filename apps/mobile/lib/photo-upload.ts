// lib/photo-upload.ts
// ADDED (2026-10-18): ITEM PHOTOS — photo lo → phone pe chhota karo → seedha ImageKit → item pe lagao
// USE CASE: Owner/Manager menu item ki photo daale. Phone ki photo 3-5 MB hoti hai — 4G pe dheemi
// aur ImageKit bandwidth (Free 20GB/month) jaldi khatam. Isliye upload se PEHLE yahin 800×800
// JPEG ~70% (≈60-120 KB). Hamara server photo nahi uthata — sirf ek baar ka signature deta hai aur
// upload ke baad verify karta hai (ISI cafe ke folder ki image hai) — dekho backend utils/imagekit.ts.
// Permissions: Gallery = Android ka system photo picker (koi permission nahi). Camera = sirf tab
// maangte hain jab Owner "Take photo" dabaye.
// CONNECTED TO: features/menu/menu.api.ts, components/menu/ProductPhoto.tsx

import * as ImagePicker from 'expo-image-picker';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { menuApi, Product } from '../features/menu/menu.api';

const MAX_SIDE = 800;

/** Galti jo user ko dikhani hai (message seedha Alert/banner mein) */
export class PhotoError extends Error {
  constructor(message: string, public code: 'CAMERA_DENIED' | 'UPLOAD_FAILED' | 'TOO_BIG' = 'UPLOAD_FAILED') {
    super(message);
  }
}

/** Camera / gallery se square photo. null = user ne cancel kiya */
export async function pickSquarePhoto(source: 'camera' | 'gallery'): Promise<{ uri: string; width: number } | null> {
  const options: ImagePicker.ImagePickerOptions = {
    mediaTypes: 'images',
    allowsEditing: true, // square crop — menu card pe photo beech mein, kat-ta nahi
    aspect: [1, 1],
    quality: 1, // compression neeche hum khud karte hain (ek hi baar)
  };
  if (source === 'camera') {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      throw new PhotoError('Camera access is off for BillRaw. Turn it on in Settings, or choose a photo from your gallery.', 'CAMERA_DENIED');
    }
  }
  const result = source === 'camera' ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
  if (result.canceled || !result.assets?.[0]) return null;
  const a = result.assets[0];
  return { uri: a.uri, width: a.width };
}

/** 800px se bada ho to chhota + JPEG 70%. Chhoti photo ko bada nahi karte (dhundli ho jaati). */
async function shrink(photo: { uri: string; width: number }): Promise<string> {
  const ctx = ImageManipulator.manipulate(photo.uri);
  if (photo.width > MAX_SIDE) ctx.resize({ width: MAX_SIDE });
  const image = await ctx.renderAsync();
  const saved = await image.saveAsync({ compress: 0.7, format: SaveFormat.JPEG });
  return saved.uri;
}

/** Poora flow: shrink → signature → ImageKit upload → server verify + item pe lagao. Updated product lautata hai. */
export async function uploadProductPhoto(productId: string, photo: { uri: string; width: number }): Promise<Product> {
  const uri = await shrink(photo);
  const auth = await menuApi.getPhotoUploadAuth(productId);

  const form = new FormData();
  // React Native ka file part: { uri, name, type }
  form.append('file', { uri, name: auth.fileName, type: 'image/jpeg' } as unknown as Blob);
  form.append('fileName', auth.fileName);
  form.append('publicKey', auth.publicKey);
  form.append('signature', auth.signature);
  form.append('expire', String(auth.expire));
  form.append('token', auth.token);
  form.append('folder', auth.folder);
  form.append('useUniqueFileName', 'true');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 45000);
  let fileId: string | undefined;
  try {
    const res = await fetch(auth.uploadUrl, { method: 'POST', body: form, signal: controller.signal });
    const json = await res.json().catch(() => null);
    if (!res.ok || !json?.fileId) throw new PhotoError("The photo didn't upload. Check your internet and try again.");
    fileId = json.fileId as string;
  } catch (err) {
    if (err instanceof PhotoError) throw err;
    throw new PhotoError("The photo didn't upload. Check your internet and try again.");
  } finally {
    clearTimeout(timer);
  }
  return menuApi.setPhoto(productId, fileId);
}
