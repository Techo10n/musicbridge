export default async function handler(req, res) {
  try {
    // Load environment variables
    const client_id = process.env.SPOTIFY_CLIENT_ID;
    const client_secret = process.env.SPOTIFY_CLIENT_SECRET;
    const refresh_token = process.env.SPOTIFY_REFRESH_TOKEN;

    // Spotify token URL
    const token_url = "https://accounts.spotify.com/api/token";

    // Encode client ID and secret
    const credentials = Buffer.from(`${client_id}:${client_secret}`).toString("base64");

    // Request a new access token using the refresh token
    const response = await fetch(token_url, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${credentials}`,
      },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: refresh_token,
      }),
    });

    // Parse response
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Failed to refresh access token");
    }

    // Return new access token
    res.status(200).json({ access_token: data.access_token });
  } catch (error) {
    console.error("Error refreshing token:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
}