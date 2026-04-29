import * as ImagePicker from 'expo-image-picker';
import { supabase } from './supabase';

export interface AvatarUploadResult {
  localUri: string;
  publicUrl: string;
}

/**
 * Opens the device image picker, uploads the selected image to Supabase Storage,
 * saves the public URL to users.avatar_url, and returns both the local preview
 * URI and the remote URL. Returns null if the user cancels or an error occurs.
 */
export async function pickAndUploadAvatar(userId: string): Promise<AvatarUploadResult | null> {
  // Request permissions
  const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (status !== 'granted') {
    return null;
  }

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsEditing: true,
    aspect: [1, 1],
    quality: 0.7,
    base64: false,
  });

  if (result.canceled || !result.assets[0]) return null;

  const asset = result.assets[0];
  const localUri = asset.uri;

  // Keep the storage path stable so profile rows only need a cache-busting query.
  const path = `${userId}/avatar`;

  try {
    const response = await fetch(asset.uri);
    const imageBuffer = await response.arrayBuffer();

    const { error: uploadError } = await supabase.storage
      .from('avatars')
      .upload(path, imageBuffer, {
        contentType: asset.mimeType ?? 'image/jpeg',
        cacheControl: '0',
        upsert: true,
      });

    if (uploadError) {
      console.error('[avatarUpload] upload error:', uploadError);
      return null;
    }

    // Add cache-busting timestamp so React Native re-fetches the image
    const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(path);
    const publicUrl = `${urlData.publicUrl}?t=${Date.now()}`;

    const { error: updateError } = await supabase
      .from('users')
      .update({ avatar_url: publicUrl })
      .eq('id', userId);

    if (updateError) {
      console.error('[avatarUpload] update error:', updateError);
      return null;
    }

    return { localUri, publicUrl };
  } catch (err) {
    console.error('[avatarUpload] exception:', err);
    return null;
  }
}
