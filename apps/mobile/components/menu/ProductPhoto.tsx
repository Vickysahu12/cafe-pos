// components/menu/ProductPhoto.tsx
// ADDED (2026-10-18): ITEM PHOTO — item edit screen pe (Owner/Manager)
// USE CASE: Customer website ke menu pe asli khane ki photo (photos se zyada order aate hain).
// Photo nahi → website pe purana artwork hi dikhta hai, kuch toot-ta nahi.
//  - Add / Change: Camera ya Gallery → square crop → phone pe chhota → upload (dekho lib/photo-upload.ts)
//  - Remove: confirm → photo hat-ti hai (ImageKit se bhi)
//  - Camera band hai → saaf message + "Open Settings"
//  - Upload fail (net) → purani photo wahi rehti hai, error dikhta hai, dobara try
// CONNECTED TO: lib/photo-upload.ts, lib/photo-url.ts, app/(admin)/menu/[categoryId]/create-product.tsx

import { useState } from 'react';
import { View, Text, StyleSheet, Pressable, Image, ActivityIndicator, Alert, Linking } from 'react-native';
import { Camera, ImagePlus } from 'lucide-react-native';
import { menuApi, Product } from '../../features/menu/menu.api';
import { pickSquarePhoto, uploadProductPhoto, PhotoError } from '../../lib/photo-upload';
import { photoThumb } from '../../lib/photo-url';
import { getErrorMessage } from '../../lib/api-client';
import { haptics } from '../../lib/haptics';
import { theme } from '../../theme';

const SIZE = 96;

export function ProductPhoto({
  productId,
  imageUrl,
  onChange,
}: {
  productId: string;
  imageUrl: string | null | undefined;
  onChange: (product: Product) => void;
}) {
  const [busy, setBusy] = useState<'upload' | 'remove' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async (source: 'camera' | 'gallery') => {
    setError(null);
    try {
      const photo = await pickSquarePhoto(source);
      if (!photo) return; // cancel
      setBusy('upload');
      onChange(await uploadProductPhoto(productId, photo));
      haptics.success();
    } catch (err) {
      haptics.error();
      if (err instanceof PhotoError && err.code === 'CAMERA_DENIED') {
        Alert.alert('Camera is off', err.message, [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Open Settings', onPress: () => Linking.openSettings() },
        ]);
      } else {
        setError(err instanceof PhotoError ? err.message : getErrorMessage(err));
      }
    } finally {
      setBusy(null);
    }
  };

  const choose = () => {
    if (busy) return;
    Alert.alert(imageUrl ? 'Change photo' : 'Add a photo', 'A clear, square photo of the dish looks best.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Gallery', onPress: () => run('gallery') },
      { text: 'Camera', onPress: () => run('camera') },
    ]);
  };

  const remove = () => {
    if (busy) return;
    Alert.alert('Remove this photo?', 'Customers will see the default picture instead.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          setBusy('remove');
          setError(null);
          try {
            onChange(await menuApi.removePhoto(productId));
          } catch (err) {
            setError(getErrorMessage(err));
          } finally {
            setBusy(null);
          }
        },
      },
    ]);
  };

  return (
    <View style={styles.card}>
      <Pressable onPress={choose} disabled={!!busy} accessibilityRole="button" accessibilityLabel={imageUrl ? 'Change photo' : 'Add a photo'}>
        {imageUrl ? (
          <Image source={{ uri: photoThumb(imageUrl, SIZE) }} style={styles.photo} accessibilityIgnoresInvertColors />
        ) : (
          <View style={[styles.photo, styles.empty]}>
            <ImagePlus size={26} color={theme.colors.textMuted} />
          </View>
        )}
        {busy === 'upload' && (
          <View style={[styles.photo, styles.overlay]}>
            <ActivityIndicator color={theme.colors.white} />
          </View>
        )}
      </Pressable>

      <View style={{ flex: 1 }}>
        <Text style={styles.title}>Photo</Text>
        <Text style={styles.hint}>
          {busy === 'upload'
            ? 'Uploading…'
            : imageUrl
              ? 'Shown on your QR menu and website.'
              : 'Optional. Items with photos usually sell more.'}
        </Text>
        <View style={styles.actions}>
          <Pressable style={styles.btn} onPress={choose} disabled={!!busy} accessibilityRole="button">
            <Camera size={14} color={theme.colors.textPrimary} />
            <Text style={styles.btnText}>{imageUrl ? 'Change' : 'Add photo'}</Text>
          </Pressable>
          {!!imageUrl && (
            <Pressable style={styles.btn} onPress={remove} disabled={!!busy} accessibilityRole="button">
              {busy === 'remove' ? (
                <ActivityIndicator size="small" color={theme.colors.danger} />
              ) : (
                <Text style={[styles.btnText, { color: theme.colors.danger }]}>Remove</Text>
              )}
            </Pressable>
          )}
        </View>
        {error && <Text style={styles.error}>{error}</Text>}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    gap: theme.spacing.md,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.md,
  },
  photo: { width: SIZE, height: SIZE, borderRadius: theme.radius.md },
  empty: { backgroundColor: theme.colors.background, borderWidth: 1, borderStyle: 'dashed', borderColor: theme.colors.borderStrong, justifyContent: 'center', alignItems: 'center' },
  overlay: { position: 'absolute', top: 0, left: 0, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: 15, fontFamily: theme.typography.font.semibold, color: theme.colors.textPrimary },
  hint: { fontSize: 12, lineHeight: 17, fontFamily: theme.typography.font.regular, color: theme.colors.textSecondary, marginTop: 2 },
  actions: { flexDirection: 'row', gap: theme.spacing.sm, marginTop: theme.spacing.sm },
  btn: {
    flexDirection: 'row', alignItems: 'center', gap: 6, height: 36, paddingHorizontal: 12,
    borderRadius: theme.radius.full, borderWidth: 1, borderColor: theme.colors.borderStrong, backgroundColor: theme.colors.surface,
  },
  btnText: { fontSize: 13, fontFamily: theme.typography.font.semibold, color: theme.colors.textPrimary },
  error: { fontSize: 12, fontFamily: theme.typography.font.medium, color: theme.colors.danger, marginTop: theme.spacing.sm },
});
