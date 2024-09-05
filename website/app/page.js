"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function Home() {
  const [playlistLink, setPlaylistLink] = useState("");
  const [targetService, setTargetService] = useState("Spotify");
  const router = useRouter();
  const [message, setMessage] = useState('');
  const [songs, setSongs] = useState([]);

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
      setMessage('Playlist scraped successfully');
      setMessage('Creating playlist...');


      // Step 2: Create the user-selected-service playlist with the scraped songs
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

      //create playlist
      const createResponse = await fetch(target, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          songs: data.message,
        }),
      });

      if (createResponse.ok) {
        const result = await createResponse.json();
        router.push(`/result?link=${encodeURIComponent(result.message)}&service=${targetService}`);
      } else {
        const error = await createResponse.text();
        setMessage(`Error creating playlist: ${error}`);
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


/*"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function Home() {
  const [playlistLink, setPlaylistLink] = useState("");
  const [targetService, setTargetService] = useState("Spotify");
  const router = useRouter();
  const [message, setMessage] = useState('');
  const [songs, setSongs] = useState([]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setMessage('Scraping playlist...');

    const response = await fetch('/api/read-playlist-ytmusic', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        playlistLink,
      }),
    });

    if (response.ok) {
      const data = await response.json();
      setSongs(data.message);
      setMessage('Playlist scraped successfully');
    } else {
      const error = await response.text();
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


PLAYLIST CREATOR:
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function Home() {
  const [playlistLink, setPlaylistLink] = useState("");
  const [targetService, setTargetService] = useState("Spotify");
  const router = useRouter();
  const [message, setMessage] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setMessage('Creating playlist...');

    const response = await fetch('/api/create-playlist-spotify', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        playlistLink,
        targetService,
      }),
    });

    if (response.ok) {
      const data = await response.json();
      router.push(`/result?link=${encodeURIComponent(data.message)}&service=${targetService}`);
    } else {
      const error = await response.text();
      setMessage(`Error creating playlist: ${error}`);
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
        </div>
      </div>
    </main>
  );
}
  */