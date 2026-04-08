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
  const uri = asset.uri;

  try {
    // Fetch the image as a blob
    const response = await fetch(uri);
    const blob = await response.blob();

    // Derive a consistent file extension
    const ext = asset.mimeType === 'image/png' ? 'png' : 'jpg';
    const path = `${userId}/avatar.${ext}`;

    // Upload to Supabase Storage
    const { error: uploadError } = await supabase.storage
      .from('avatars')
      .upload(path, blob, {
        contentType: asset.mimeType ?? 'image/jpeg',
        upsert: true,
      });

    if (uploadError) {
      console.error('[avatarUpload] upload error:', uploadError);
      return null;
    }

    // Get the public URL
    const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(path);
    const publicUrl = urlData.publicUrl;

    // Save to users table
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
