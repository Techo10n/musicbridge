"use client";

import { useState } from "react";
import Link from "next/link";
// import { useRouter } from 'next/navigation';

export default function Home() {
  const [playlistLink, setPlaylistLink] = useState("");
  const [targetService, setTargetService] = useState("Spotify");
  const [message, setMessage] = useState("");
  const [songs, setSongs] = useState([]);
  const [accessToken, setAccessToken] = useState(""); // Initialize accessToken state
  const tracksNotFound = [];

  const getSpotifyAccessToken = async () => {
    try {
      const response = await fetch('/api/authenticate-spotify');
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      setAccessToken(data.access_token);
      return data.access_token;
    } catch (error) {
      console.error("Error fetching Spotify access token:", error);
      return null;
    }
  };

  const searchSpotifyTrack = async (songTitle, artistName, accessToken) => {
    try {
      // Format the query for the Spotify Search API
      const query = encodeURIComponent(`track:${songTitle} artist:${artistName}`);
      console.log('Query:', query);
      const response = await fetch(`https://api.spotify.com/v1/search?q=${query}&type=track&limit=1`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });
  
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
  
      const data = await response.json();
      if (data.tracks.items.length > 0) {
        // Return the URI of the first matching track
        return data.tracks.items[0].uri;
      } else {
        console.warn(`No Spotify track found for: ${songTitle} by ${artistName}`);
        tracksNotFound.push({ songTitle, artistName });
        return null;
      }
    } catch (error) {
      console.error('Error searching for Spotify track:', error);
      return null;
    }
  };
  
  const handleSubmit = async (e) => {
    e.preventDefault();
    setMessage('Scraping playlist...');
  
    // Step 1: Scrape the playlist from source
    let source = '';
    if (playlistLink.includes('spotify')) {
      source = '/api/read-playlist-spotify';
    } else if (playlistLink.includes('music.apple')) {
      source = '/api/read-playlist-apple';
    } else if (playlistLink.includes('music.youtube')) {
      source = '/api/read-playlist-ytmusic';
    } else {
      setMessage('Invalid playlist link');
      return;
    }
  
    // return read playlist
    const scrapeResponse = await fetch(source, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        playlistLink,
      }),
    });
  
    if (scrapeResponse.ok) {
      const data = await scrapeResponse.json();
      setSongs(data.message);
      setMessage('Playlist scraped successfully!');
  

      //========================================================================SPOTIFY PLAYLIST CREATION========================================================================================
      if (targetService === 'Spotify') {
        // Step 2: Get Spotify access token
        const accessToken = await getSpotifyAccessToken();
        //console.log('Access Token:', accessToken); //for debugging. dont uncomment if deploying
        if (!accessToken) {
          setMessage('Failed to get Spotify access token');
          return;
        }
    
        // Step 3: Map song names and artists to Spotify track URIs
        setMessage('Searching for Spotify tracks...');
        const trackUris = [];
        for (const song of data.message) {
          const uri = await searchSpotifyTrack(song.songTitle, song.artistName, accessToken);
          if (uri) {
            trackUris.push(uri);
          }
        }
    
        if (trackUris.length === 0) {
          setMessage('No valid Spotify tracks found');
          return;
        }
    
        // Step 4: Create the playlist
        setMessage('Creating spotify playlist...');
        const target = '/api/create-playlist-spotify';
        const playlistName = "My Playlist"; // Replace with dynamic name or user input
        const createdPlaylist = await fetch(target, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            accessToken,
            playlistName,
            trackUris,
          }),
        });
    
        if (createdPlaylist.ok) {
          const data = await createdPlaylist.json();
          const playlistUrl = `https://open.spotify.com/playlist/${data.playlistId}`;
          setMessage(
            <>
              Playlist created successfully! Playlist URL:{" "}
              <a className="underline" href={playlistUrl} target="_blank" rel="noopener noreferrer">
                {playlistUrl}
              </a>
              <div className="mt-6">
                Unable to Find Songs: {tracksNotFound.map((track, index) => (
                  <p key={index}>{track.songTitle} by {track.artistName}</p>
                ))}
              </div>
            </>
          );
          
          //CURRENTLY NOT WORKING
            //router.push(`/result?playlistUrl=${playlistUrl}&targetService=${targetService}`).catch(err => console.error('Navigation error:', err));

        } else {
          setMessage('Failed to create playlist');
        }
      }
      //==================================================================YOUTUBE MUSIC PLAYLIST CREATION================================================================================
      else if (targetService === 'YouTube Music') {
        // Handle YouTube Music playlist creation
        setMessage('YouTube Music playlist creation is not yet implemented.');
      }
      
    } else {
      setMessage('Failed to scrape playlist');
    }
  };

  return (
    <main className="flex min-h-screen flex-col items-center justify-center">
      <div className="w-full font-mono text-sm">
        <div className="fixed flex h-48 w-full items-end justify-center bg-gradient-to-t from-white via-white dark:from-black dark:via-black">
          <Link href="/">musicbridge</Link>
        </div>
        <div className="flex flex-col items-center justify-center min-h-screen">
        <form onSubmit={handleSubmit} className="flex flex-col items-center space-y-4">
          <div className="flex items-center space-x-2">
            <input
              type="text"
              name="playlistLink"
              value={playlistLink}
              onChange={(e) => setPlaylistLink(e.target.value)}
              placeholder="Enter playlist link"
              required
              className="w-[400px] appearance-none border-b border-[#D7D7D7] bg-transparent px-1 py-2 leading-tight text-white focus:outline-none"
            />
            <select
              name="targetService"
              value={targetService}
              onChange={(e) => setTargetService(e.target.value)}
              className="h-10 bg-black text-white border-2 border-gray-300 rounded px-2 py-1 focus:outline-none"
            >
              <option value="Spotify">Spotify</option>
              <option value="Apple Music">Apple Music</option>
              <option value="YouTube Music">YouTube Music</option>
            </select>
          </div>
          <button
            type="submit"
            className="border-2 border-gray-300 h-10 w-16 text-white rounded focus:outline-none"
          >
            Go
          </button>
        </form>
          {message && <p className="mt-4 text-white text-center">{message}</p>}
          {songs.length > 0 && (
            <div className="mt-2 w-[70%] p-4 border border-white rounded-lg flex fixed bottom-28 max-h-[200px] overflow-y-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
              <ul className="flex flex-wrap text-white list-none p-0 -mt-1">
              <p className="mr-2 font-bold">Scraped Songs: </p>
                {songs.map((song, index) => (
                  <li key={index} className="whitespace-nowrap mr-2">
                    {song.songTitle} by {song.artistName}{index !== songs.length - 1 ? ',' : ''}
                  </li>
                ))}
                <div className="w-full h-px my-3" />
              </ul>
            </div>
          )}
        </div>
      </div>
      <footer className="font-mono text-sm fixed bottom-10 w-full text-center text-white">
        Made with {"<"}3 by <a className="underline" href="https://github.com/techo10n" target="_blank" rel="noopener noreferrer">Zechariah Frierson</a>
      </footer>
    </main>
  );
}
