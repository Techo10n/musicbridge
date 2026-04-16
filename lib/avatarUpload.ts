import * as ImagePicker from 'expo-image-picker';
import { supabase } from './supabase';

/**
 * Opens the device image picker, uploads the selected image to Supabase Storage
 * under avatars/{userId}/avatar.jpg, saves the public URL to users.avatar_url,
 * and returns the public URL. Returns null if the user cancels or an error occurs.
 */
export async function pickAndUploadAvatar(userId: string): Promise<string | null> {
  // Request permissions
  const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (status !== 'granted') {
    return null;
  }

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ImagePicker.MediaTypeOptions.Images,
    allowsEditing: true,
    aspect: [1, 1],
    quality: 0.7,
    base64: false,
  });

  if (result.canceled || !result.assets[0]) return null;

  const asset = result.assets[0];

  // Derive a consistent file extension
  const ext = asset.mimeType === 'image/png' ? 'png' : 'jpg';
  const path = `${userId}/avatar.${ext}`;

  try {
    const response = await fetch(asset.uri);
    const imageBlob = await response.blob();

    const { error: uploadError } = await supabase.storage
      .from('avatars')
      .upload(path, imageBlob, {
        contentType: asset.mimeType ?? 'image/jpeg',
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

    return publicUrl;
  } catch (err) {
    console.error('[avatarUpload] exception:', err);
    return null;
  }
}
