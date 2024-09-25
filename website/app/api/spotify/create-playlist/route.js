import fetch from 'node-fetch';

// Function to refresh the Spotify access token if it's expired
async function refreshAccessToken() {
  const refreshToken = process.env.SPOTIFY_REFRESH_TOKEN;
  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;

  const response = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: 'Basic ' + Buffer.from(`${clientId}:${clientSecret}`).toString('base64'),
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    }),
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(`Failed to refresh access token: ${data.error}`);
  }

  // Save the new access token and return it
  process.env.SPOTIFY_ACCESS_TOKEN = data.access_token;
  return data.access_token;
}

// Function to create a playlist
export async function POST(req) {
  const { playlistName, isPublic } = await req.json(); // Get playlist name and public/private from request

  const accessToken = process.env.SPOTIFY_ACCESS_TOKEN || await refreshAccessToken();
  const userId = process.env.SPOTIFY_USER_ID; // The Spotify account user ID for which you want to create playlists

  const createPlaylistUrl = `https://api.spotify.com/v1/users/${userId}/playlists`;

  const response = await fetch(createPlaylistUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: playlistName || 'My New Playlist',
      public: isPublic || true,
    }),
  });

  const playlistData = await response.json();
  if (!response.ok) {
    throw new Error(`Failed to create playlist: ${playlistData.error.message}`);
  }

  return new Response(JSON.stringify({ playlistId: playlistData.id }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}