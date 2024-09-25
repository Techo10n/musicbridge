const createPlaylist = async (userId, accessToken) => {
  const url = `https://api.spotify.com/v1/users/${userId}/playlists`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name: "My New Playlist",
      public: true,
    }),
  });

  const playlistData = await response.json();
  return playlistData.id;  // Return the new playlist ID
};