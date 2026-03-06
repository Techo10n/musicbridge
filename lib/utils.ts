export function cleanArtistName(artist: string): string {
  if (!artist) return '';
  return artist
    .replace(/ - Topic$/i, '')
    .replace(/VEVO$/i, '')
    .replace(/Official$/i, '')
    .trim();
}
