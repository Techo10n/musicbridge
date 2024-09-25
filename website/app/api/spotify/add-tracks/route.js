const addTracksToPlaylist = async (playlistId, trackURIs, accessToken) => {
    const url = `https://api.spotify.com/v1/playlists/${playlistId}/tracks`;
  
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        uris: trackURIs.map(trackId => `spotify:track:${trackId}`),
      }),
    });
  
    const result = await response.json();
    return result;
  };
  