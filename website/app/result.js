"use client";

import { useSearchParams } from 'next/navigation';
import { useState, useEffect } from 'react';
import Link from 'next/link';

export default function Result() {
  const searchParams = useSearchParams();
  const link = searchParams.get('playlistUrl');
  const service = searchParams.get('targetService');
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(true);
  
  useEffect(() => {
    if (link && service) {
      setLoading(false);
    }
  }, [link, service]);

  const handleCopy = () => {
    if (link) {
      navigator.clipboard.writeText(link).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }).catch(err => console.error("Failed to copy link:", err));
    }
  };

  return (
    <main className="flex min-h-screen flex-col items-center justify-center">
      <div className="w-full font-mono text-sm">
        <div className="fixed flex h-48 w-full items-end justify-center bg-gradient-to-t from-white via-white dark:from-black dark:via-black">
          <Link href="/">musicbridge</Link>
        </div>
        <div className="flex flex-col items-center justify-center min-h-screen">
          {loading ? (
            <p className="text-white text-lg">Loading...</p>
          ) : link && service ? (
            <div className="mt-8 p-4 border border-white rounded-lg text-white text-center">
              <p className="text-lg font-bold">Playlist Successfully Created!</p>
              <p className="mt-2">Converted Link:</p>
              <a href={link} target="_blank" rel="noopener noreferrer" className="text-blue-400 underline break-all">
                {link}
              </a>
              <div className="mt-4 flex items-center justify-center space-x-2">
                <button
                  onClick={handleCopy}
                  className="border-2 border-gray-300 h-10 px-3 text-white rounded focus:outline-none"
                >
                  {copied ? "Copied!" : "Copy"}
                </button>
              </div>
              <p className="mt-2">Target Service: <span className="font-semibold">{service}</span></p>
            </div>
          ) : (
            <p className="text-red-500 text-lg">Error: Invalid or missing data</p>
          )}
        </div>
      </div>
    </main>
  );
}