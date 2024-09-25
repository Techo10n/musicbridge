"use client";

import { useState } from "react";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function Home() {
  const router = useRouter();
  const [playlistLink, setPlaylistLink] = useState("");
  const [targetService, setTargetService] = useState("Spotify");
  const [message, setMessage] = useState("");
  const [songs, setSongs] = useState([]);
  const [accessToken, setAccessToken] = useState("");
  const clientId = "cb9e6121711242898b38500c88a7fcd9";
  const params = new URLSearchParams(window.location.search);
  const code = params.get("code");
  const [isFetchingToken, setIsFetchingToken] = useState(false);

  useEffect(() => {
      // Step 1: Check if there is a code
      if (!code) {
          // Redirect only if the code is not present
          if (!isFetchingToken) {
              redirectToAuthCodeFlow(clientId); // Redirect to Spotify auth page
          }
      } else if (!isFetchingToken) {
          // Step 2: Fetch access token if we have a code
          const fetchAccessToken = async () => {
              setIsFetchingToken(true); // Prevent further fetches
              try {
                  const verifier = localStorage.getItem("verifier"); // Get the verifier from localStorage
                  const accessToken = await getAccessToken(clientId, code, verifier);
                  setAccessToken(accessToken);
                  const profile = await fetchProfile(accessToken);
                  console.log(profile);
              } catch (error) {
                  console.error("Error:", error);
              } finally {
                  setIsFetchingToken(false); // Reset the fetching state
              }
          };

          fetchAccessToken(); // Call the function to fetch the access token
      }
  }, [code, isFetchingToken]);

  async function redirectToAuthCodeFlow(clientId) {
      const verifier = generateCodeVerifier(128);
      const challenge = await generateCodeChallenge(verifier);

      localStorage.setItem("verifier", verifier);

      const params = new URLSearchParams();
      params.append("client_id", clientId);
      params.append("response_type", "code");
      params.append("redirect_uri", "http://localhost:3000/");
      params.append("scope", "playlist-modify-public playlist-modify-private playlist-modify-public playlist-read-private playlist-modify-private");
      params.append("code_challenge_method", "S256");
      params.append("code_challenge", challenge);

      // Redirect to Spotify's authorization endpoint
      document.location = `https://accounts.spotify.com/authorize?${params.toString()}`;
  }

  function generateCodeVerifier(length) {
      let text = '';
      let possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

      for (let i = 0; i < length; i++) {
          text += possible.charAt(Math.floor(Math.random() * possible.length));
      }
      return text;
  }

  async function generateCodeChallenge(codeVerifier) {
      const data = new TextEncoder().encode(codeVerifier);
      const digest = await window.crypto.subtle.digest('SHA-256', data);
      return btoa(String.fromCharCode.apply(null, [...new Uint8Array(digest)]))
          .replace(/\+/g, '-')
          .replace(/\//g, '_')
          .replace(/=+$/, '');
  }

  async function getAccessToken(clientId, code, verifier) {
    const response = await fetch("/api/spotify/auth", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify({ code, verifier }), // Pass the code and verifier
    });

    const data = await response.json();
    return data.accessToken; // Return the access token
}

  async function fetchProfile(token) {
      const result = await fetch("https://api.spotify.com/v1/me", {
          method: "GET", headers: { Authorization: `Bearer ${token}` }
      });

      return await result.json();
  }


  const handleSubmit = async (e) => {
    e.preventDefault();
    setMessage('Scraping playlist...');

    // Step 1: Scrape the playlist from source
    //determine source
    let source = '';
    if (playlistLink.includes('spotify')) {
      source = '/api/read-playlist-spotify';
    }
    else if (playlistLink.includes('music.apple')) {
      source = '/api/read-playlist-apple';
    }
    else if (playlistLink.includes('music.youtube')) {
      source = '/api/read-playlist-ytmusic';
    }
    else {
      setMessage('Invalid playlist link');
      return;
    }

    //scrape playlist
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
      const songTitles = songs.map(song => song.songTitle);
      const artistNames = songs.map(song => song.artistName);

      // Log the results for debugging
      console.log('Song Titles:', songTitles);
      console.log('Artist Names:', artistNames);

      setMessage('Playlist scraped successfully');
      setMessage('Creating playlist...');

      /* Step 2: Create the user-selected-service playlist with the scraped songs
      //determine target
      let target = '';
      if (targetService === 'Spotify') {
        target = '/api/create-playlist-spotify';
      }
      else if (targetService === 'Apple Music') {
        target = '/api/create-playlist-apple';
      }
      else if (targetService === 'YouTube Music') {
        target = '/api/create-playlist-ytmusic';
      }
      else {
        setMessage('Invalid target service');
        return;
      }
        */

      //create playlist
      const createResponse = await fetch('/api/spotify/create-playlist', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          clientId,
          accessToken,
        }),
      });

      if (createResponse.ok) {
        const playlistId = await createResponse.json();
        setMessage('Blank playlist created successfully');
        setMessage('Searching songs...');

        //populate playlist
        const populateResponse = await fetch('/api/spotify/search-track', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            songTitles,
            artistNames,
            accessToken,
          }),
        });

        if (populateResponse.ok) {
          const trackIds = await populateResponse.json();
          setMessage('Songs searched successfully');
          setMessage('Adding songs to playlist...');

          //add songs to playlist
          const addResponse = await fetch('/api/spotify/add-track', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              playlistId,
              trackIds,
              accessToken,
            }),
          });

          if (addResponse.ok) {
            setMessage('Songs added to playlist successfully');
            router.push(`/playlist/${playlistId}`);
          } else {
            const error = await addResponse.text();
            setMessage(`Error adding songs to playlist: ${error}`);
          }
        } else {
          const error = await populateResponse.text();
          setMessage(`Error populating playlist: ${error}`);
        }
      } else {
        const error = await createResponse.text();
        setMessage(`Error creating blank playlist: ${error}`);
      }

    } else {
      const error = await scrapeResponse.text();
      setMessage(`Error scraping playlist: ${error}`);
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
          {message && <p className="mt-4 text-white">{message}</p>}
          {songs.length > 0 && (
            <div className="mt-4">
              <h2 className="text-lg font-bold text-white">Scraped Songs:</h2>
              <ul className="text-white">
                {songs.map((song, index) => (
                  <li key={index}>
                    {song.songTitle} by {song.artistName}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}