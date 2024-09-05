import { NextResponse } from 'next/server';
import puppeteer from 'puppeteer';

export async function POST(request) {
  const { playlistLink } = await request.json();

  try {
    const songs = await readPlaylistYTMusic(playlistLink);
    return NextResponse.json({ message: songs }, { status: 200 });
  } catch (error) {
    console.error('Error scraping playlist:', error);
    return NextResponse.json({ message: 'Error scraping playlist' }, { status: 500 });
  }
}

async function readPlaylistYTMusic(playlistUrl) {
  const browser = await puppeteer.launch({ headless: false });
  const page = await browser.newPage();

  await page.goto(playlistUrl, { waitUntil: 'networkidle2' });

  // Wait for the playlist to load
  await page.waitForSelector('div[class="style-scope ytmusic-section-list-renderer"]');
  // Extract the songs and artists
  const songs = await page.evaluate(() => {
    const songElements = Array.from(document.querySelectorAll('ytmusic-responsive-list-item-renderer'));
    return songElements.map(el => {
      const outerText = el.outerText.split('\n').filter(line => line.trim() !== '');
      const songTitle = outerText[0];
      const artistName = outerText[1];
      return { songTitle, artistName };
    });
  });

  await browser.close();
  return songs;
}