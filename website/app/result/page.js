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

/*
"use client";

import { useSearchParams } from 'next/navigation';
import { useState } from 'react';

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
    <main className="flex min-h-screen flex-col items-center justify-center bg-gray-900 text-white">
      <div className="w-full text-center font-mono text-lg">
        <div className="fixed top-0 flex h-16 w-full items-center justify-center bg-gradient-to-t from-gray-800 via-gray-800 dark:from-black dark:via-black">
          <a className="text-2xl font-bold">musicbridge</a>
        </div>
        <div className="flex flex-col items-center justify-center min-h-screen">
          {link && service ? (
            <div className="mt-8 p-6 bg-gray-800 rounded-lg shadow-md">
              <p className="mb-4 text-xl font-semibold">Converted Link:</p>
              <div className="flex items-center space-x-2">
                <a href={link} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline break-all">
                  {link}
                </a>
                <button
                  onClick={handleCopy}
                  className="ml-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg focus:outline-none"
                >
                  {copied ? "Copied!" : "Copy"}
                </button>
              </div>
              <p className="mt-4 text-lg">Target Service: <span className="font-bold">{service}</span></p>
            </div>
          ) : (
            <p>Loading...</p>
          )}
        </div>
      </div>
    </main>
  );
}
*/