import { NextResponse } from 'next/server';

export async function POST(request) {
    try {
        const { accessToken, playlistName, trackUris } = await request.json();

        if (!accessToken || !playlistName || !trackUris) {
            return NextResponse.json({ message: 'Missing required fields' }, { status: 400 });
        }

        const playlistId = await createSpotifyPlaylist(accessToken, playlistName, trackUris);
        return NextResponse.json({ playlistId: playlistId }, { status: 200 });
    } catch (error) {
        console.error('Error creating playlist:', error);
        return NextResponse.json({ message: 'Error creating playlist' }, { status: 500 });
    }
}

const getUserProfile = async (accessToken) => {
    const response = await fetch("https://api.spotify.com/v1/me", {
        method: "GET",
        headers: {
            Authorization: `Bearer ${accessToken}`,
        },
    });

    if (!response.ok) {
        throw new Error("Failed to fetch user profile");
    }

    const data = await response.json();
    return data.id; // Returns the user's Spotify ID
};

const createPlaylist = async (accessToken, userId, playlistName, description = "") => {
    const response = await fetch(`https://api.spotify.com/v1/users/${userId}/playlists`, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            name: playlistName,
            description: description,
            public: true, // Set to true if you want the playlist to be public
        }),
    });

    if (!response.ok) {
        throw new Error("Failed to create playlist");
    }

    const data = await response.json();
    return data; // Returns the created playlist details
};

const addTracksToPlaylist = async (accessToken, playlistId, trackUris) => {
    const response = await fetch(`https://api.spotify.com/v1/playlists/${playlistId}/tracks`, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            uris: trackUris, // Array of Spotify track URIs
        }),
    });

    if (!response.ok) {
        throw new Error("Failed to add tracks to playlist");
    }

    const data = await response.json();
    return data; // Returns the snapshot ID of the playlist
};

async function createSpotifyPlaylist(accessToken, playlistName, trackUris, description = "") {
    try {
        // Step 1: Get the user's Spotify ID
        const userId = await getUserProfile(accessToken);

        // Step 2: Create the playlist
        const playlist = await createPlaylist(accessToken, userId, playlistName, description);
        const playlistId = playlist.id;

        // Step 3: Add tracks to the playlist
        const result = await addTracksToPlaylist(accessToken, playlistId, trackUris);

        console.log("Playlist created and tracks added successfully:", result);
        return playlistId; // Return the playlist ID for further use
    } catch (error) {
        console.error("Error creating playlist:", error);
        throw error;
    }
}
