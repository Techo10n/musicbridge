import { NextResponse } from 'next/server';
import puppeteer from 'puppeteer';

const YTMUSIC_EMAIL = 'musicbridge0@gmail.com';
const YTMUSIC_PASSWORD = 'musicBridge11';

export async function POST(request) {
  const { songs } = await request.json();

  try {
    const playlistURL = await createYTMusicPlaylist(songs);
    return NextResponse.json({ message: playlistURL }, { status: 200 });
  } catch (error) {
    console.error('Error creating playlist:', error);
    return NextResponse.json({ message: 'Error creating playlist' }, { status: 500 });
  }
}

async function createYTMusicPlaylist(songs) {
  const browser = await puppeteer.launch({ headless: false });
  const page = await browser.newPage();

  // Go to YouTube Music login page
  await page.goto('https://music.youtube.com/history', { waitUntil: 'networkidle2' });

  // Log in
  await page.waitForSelector('input[type="email"]');
  await page.type('input[type="email"]', YTMUSIC_EMAIL);
  await page.click('#identifierNext');
  await page.waitForTimeout(2000);

  await page.waitForSelector('input[type="password"]', { visible: true });
  await page.type('input[type="password"]', YTMUSIC_PASSWORD);
  await page.click('#passwordNext');
  await page.waitForNavigation();

  // Navigate to library to create playlist
  await page.goto('https://music.youtube.com/library/playlists', { waitUntil: 'networkidle2' });
  await page.waitForSelector('ytmusic-library-playlists', { visible: true });

  // Create a new playlist
  await page.click('ytmusic-library-playlists ytmusic-card-shelf-renderer button[aria-label="Create new playlist"]');
  await page.waitForSelector('input[id="input-0"]', { visible: true });
  await page.type('input[id="input-0"]', 'My Playlist');
  await page.click('ytmusic-edit-playlist-dialog ytmusic-button-renderer button');

  // Search and add songs
  for (let song of songs) {
    const searchQuery = `${song.songTitle} ${song.artistName}`;
    await page.waitForSelector('ytmusic-search-box input', { visible: true });
    await page.click('ytmusic-search-box input', { clickCount: 3 });
    await page.type('ytmusic-search-box input', searchQuery);

    await delay(1500);

    await page.keyboard.press('Enter');
    await page.waitForSelector('ytmusic-shelf-renderer', { visible: true });
    const addButton = await page.$('ytmusic-shelf-renderer ytmusic-menu-renderer button[aria-label="Add to playlist"]');
    if (addButton) {
      await addButton.click();
    }

    // Clear the search input
    await page.waitForSelector('ytmusic-search-box input', { visible: true });
    await page.click('ytmusic-search-box input', { clickCount: 3 });
    await page.keyboard.press('Backspace');
  }

  // Get the URL of the created playlist
  await page.goto('https://music.youtube.com/library/playlists', { waitUntil: 'networkidle2' });
  const playlistURL = await page.evaluate(() => {
    const playlist = document.querySelector('ytmusic-library-playlist-shelf-renderer a');
    return playlist ? playlist.href : null;
  });

  // Close the browser
  await browser.close();

  return playlistURL;
}

function delay(time) {
  return new Promise(function(resolve) { 
    setTimeout(resolve, time);
  });
}