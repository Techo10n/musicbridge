import { NextResponse } from 'next/server';

export async function GET() {
  try {
    // Check for required environment variables
    if (!process.env.SPOTIFY_CLIENT_ID || !process.env.SPOTIFY_CLIENT_SECRET || !process.env.SPOTIFY_REFRESH_TOKEN) {
      return NextResponse.json(
        { error: "Missing required environment variables" },
        { status: 500 }
      );
    }

    const authString = `${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`;
    const base64Auth = Buffer.from(authString).toString("base64");

    const tokenResponse = await fetch("https://accounts.spotify.com/api/token", {
      method: "POST",
      headers: {
        "Authorization": `Basic ${base64Auth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: process.env.SPOTIFY_REFRESH_TOKEN,
      }),
    });

    const tokenData = await tokenResponse.json();

    if (!tokenResponse.ok) {
      throw new Error(tokenData.error || "Failed to refresh token");
    }

    if (!tokenData.access_token) {
      throw new Error("Access token not found in response");
    }

    return NextResponse.json({ access_token: tokenData.access_token }, { status: 200 });
  } catch (error) {
    console.error("Error refreshing token:", error);
    return NextResponse.json(
      { error: error.message || "Internal Server Error" },
      { status: 500 }
    );
  }
}