
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

    const response = await fetch('/api/create-playlist', {
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