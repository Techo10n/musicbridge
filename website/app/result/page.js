"use client";

import { useSearchParams } from 'next/navigation';
import { useState } from 'react';
import Link from 'next/link';

export default function Result() {
  const searchParams = useSearchParams();
  const link = searchParams.get('link');
  const service = searchParams.get('service');
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <main className="flex min-h-screen flex-col items-center justify-center">
      <div className="w-full font-mono text-sm">
        <div className="fixed flex h-48 w-full items-end justify-center bg-gradient-to-t from-white via-white dark:from-black dark:via-black">
          <Link href="/">musicbridge</Link>
        </div>
        <div className="flex flex-col items-center justify-center min-h-screen">
          {link && service ? (
            <div className="mt-8">
              <p>Converted Link:</p>
              <a href={link} target="_blank" rel="noopener noreferrer">
                {link}
              </a>
              <button
                  onClick={handleCopy}
                  className="border-2 border-gray-300 h-10 px-3 mx-2 text-white rounded focus:outline-none"
                >
                  {copied ? "Copied!" : "Copy"}
              </button>
              <p>Target Service: {service}</p>
            </div>
          ) : (
            <p>Loading...</p>
          )}
        </div>
      </div>
    </main>
  );
}