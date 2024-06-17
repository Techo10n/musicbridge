
import { NextResponse } from 'next/server';
import puppeteer from 'puppeteer';

const SPOTIFY_EMAIL = 'musicbridge0@gmail.com';
const SPOTIFY_PASSWORD = 'musicBridge11';
const SONGS = [
  'feel it d4vd',
  'suki eric reprid',
  'too many nights (feat. don toliver) metro boomin & future'
];

export async function POST(request) {
  const { playlistLink, targetService } = await request.json();

  try {
    const playlistURL = await createSpotifyPlaylist(playlistLink, targetService, SONGS);
    return NextResponse.json({ message: playlistURL }, { status: 200 });
  } catch (error) {
    if (error.timeout > 30000) {
      console.error('Timeout error creating playlist:', error);
      return NextResponse.json({ message: 'Try again' }, { status: 500 });
    } else {
      console.error('Error creating playlist:', error);
      return NextResponse.json({ message: 'Error creating playlist' }, { status: 500 });
    }
  }
}

async function createSpotifyPlaylist(playlistLink, targetService, songs) {
  const browser = await puppeteer.launch({ headless: false }); // Set to true if you don't need to see the browser
  const page = await browser.newPage();

  // Go to Spotify login page
  await page.goto('https://accounts.spotify.com/en/login');
  //NextResponse.json({ message: 'Logging in...' }, { status: 201 });

  // Log in
  await page.type('#login-username', SPOTIFY_EMAIL);
  await page.type('#login-password', SPOTIFY_PASSWORD);
  await page.click('#login-button');
  await page.waitForNavigation();

  // Navigate to the main Spotify web player
  await page.goto('https://open.spotify.com/');

  // Create a new playlist
  await page.waitForSelector('button[aria-label="Create playlist or folder"]');
  await page.click('button[aria-label="Create playlist or folder"]');
  await page.waitForSelector('button[class="mWj8N7D_OlsbDgtQx5GW"]');
  await page.click('button[class="mWj8N7D_OlsbDgtQx5GW"]');

  // Search and add songs
  for (let song of songs) {
    await page.waitForSelector('input[class="encore-text encore-text-body-small FeWwGSRANj36qpOBoxdx"]');
    await page.click('input[class="encore-text encore-text-body-small FeWwGSRANj36qpOBoxdx"]');
    await page.type('input[class="encore-text encore-text-body-small FeWwGSRANj36qpOBoxdx"]', song);

    await delay(1500);
    
    await page.waitForSelector('button[data-testid="add-to-playlist-button"]', { visible: true });
    const buttons = await page.$$('button[data-testid="add-to-playlist-button"]');
    await buttons[0].click();

    // Clear the search input
    await page.waitForSelector('input[class="encore-text encore-text-body-small FeWwGSRANj36qpOBoxdx"]');
    await page.click('input[class="encore-text encore-text-body-small FeWwGSRANj36qpOBoxdx"]');
    await page.click('input[class="encore-text encore-text-body-small FeWwGSRANj36qpOBoxdx"]', { clickCount: 3 });
    await page.keyboard.press('Backspace');
  }

  await page.waitForSelector('button[data-testid="more-button"]');
  const playlistURL = await page.evaluate(() => {
    const moreButton = document.querySelector('button[data-testid="more-button"]');
    const baseURI = moreButton ? moreButton.baseURI : '';
    return baseURI;
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