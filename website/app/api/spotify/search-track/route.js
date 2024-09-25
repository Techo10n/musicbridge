// api/spotify/search-track.js
import { NextResponse } from 'next/server';

export async function POST(request) {
  const { songTitles, artistNames, accessToken } = await request.json();
  const trackIds = [];

  for (let i = 0; i < songTitles.length; i++) {
    const songTitle = songTitles[i];
    const artistName = artistNames[i];

    const trackId = await searchTrack(songTitle, artistName, accessToken); // Use the access token here
    if (trackId) {
      trackIds.push(trackId);
    }
  }

  return NextResponse.json({ trackIds }, { status: 200 });
}

async function searchTrack(songTitle, artistName, accessToken) {
  const response = await fetch(`https://api.spotify.com/v1/search?q=${encodeURIComponent(songTitle)}%20artist:${encodeURIComponent(artistName)}&type=track`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
    },
  });

  const data = await response.json();
  if (data.tracks && data.tracks.items.length > 0) {
    return data.tracks.items[0].id; // Return the first track ID found
  }
  return null;
}