import { NextResponse } from 'next/server';
import axios from 'axios';
import { Buffer } from 'buffer';

export async function GET() {
  try {
    const data = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: process.env.SPOTIFY_REFRESH_TOKEN,
      client_id: process.env.SPOTIFY_CLIENT_ID,
      client_secret: process.env.SPOTIFY_CLIENT_SECRET,
    });

    const response = await axios.post('https://accounts.spotify.com/api/token', data, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: {
        grant_type: 'refresh_token',
        refresh_token: process.env.SPOTIFY_REFRESH_TOKEN,
        client_id: process.env.SPOTIFY_CLIENT_ID,
        client_secret: process.env.SPOTIFY_CLIENT_SECRET,
      }
    });

    return NextResponse.json({ access_token: response.data.access_token });

  } catch (error) {
    console.error('Spotify Auth Error:', error.response?.data || error.message);
    return NextResponse.json({ error: 'Failed to fetch access token' }, { status: 500 });
  }
}