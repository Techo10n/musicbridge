# MusicBridge Ideas

---

## Social & Feed

- Activity feed — see what friends have recently shared or saved
- Comments + reactions on shared songs and playlists
- Real-time listening status — Discord-style "currently listening to" shown on friend profiles
- Listening streaks — share a song with a friend daily to keep a streak alive (Snapchat model)
- Taste compatibility score — per-friend % match based on overlapping artists and genres
- Music polls — post two songs and let friends vote on which is better
- Group listening rooms — synchronized playback with friends, live chat alongside

---

## Discovery & Explore

- For You feed — algorithmic recommendations based on friend activity and listening history
- Friend trending chart — top songs gaining traction in your friend group this week
- Explore page — trending playlists, rising songs, and popular shares across all users
- Music challenges — TikTok-style prompts where friends all share their pick for a theme
- "You might also like" — surfaced when friends share something in a genre you already love

---

## Collaborative

- Cross-platform collaborative playlists — anyone can add songs; syncs to each collaborator's streaming account
- *Shared queue — add songs to a joint real-time queue with a friend - listenable on different devices at the same time, or on one device.
- Friend blend — auto-generated playlist built from two friends' libraries, updated weekly

---

## Sharing & Import

- Song of the Day — send one song to all your friends at once
- Deep-link share previews — rich Open Graph previews when sharing MusicBridge links externally
- QR code profile sharing — scan a friend's code to instantly follow them

---

## Notifications

- Push notifications for story reactions (deferred — Stories not yet built)

---

## Gamification

- Leaderboards — most songs shared, most diverse taste, most playlists built
- Badges — "First Share", "Playlist Builder", "Genre Explorer", "Streak Keeper", etc.
- Music trivia — guess the song from a short clip, compete with friends in real time

---

## Platform & Infrastructure

- ISRC-based track matching for higher-fidelity cross-platform conversion
- Unified search across all connected services at once
- Offline mode — cache recently shared items for browsing without a connection

## Parked

- **Taste grid on your own profile** — removed 2026-10-01. The 2x2 of top artist, top song,
  favourite and top genre is built (`components/TasteGrid`) and still runs on *other* people's
  profiles, where comparing taste is the point. On your own it told you things you already know.
  Bring it back when there is something there you could not have guessed: a change over time, a
  comparison against friends, or a genuine discovery.

## Follow-ups

- Blocking — a block list, plus report/mute on someone's profile. Nothing exists today.
- Artist pages — followed artists currently search the library by name instead
- Per-person notification preferences — mute one sender rather than every share
- Reaction notifications — `send-notification` knows `new_share` and `new_follow` only
- Self-serve account deletion — an Edge Function, so the row stops being a mail draft
- Friend Blend — the cross-platform two-person blend playlist flow

The legal, support and rating rows are wired and gated on `EXPO_PUBLIC_*` config; what they need is
the documents and the store listing, not code.


## Custom notes from me

- in the "send" modal, instead of add a message at the bottom, it should be a search for users, and only when you click on a user to send to, the option to add a message should appear/be accessible
- a lot of the tabs (for you, people, etc.) have purple pill buttons under centered text, but the buttons are left-aligned. center the buttons.\
- remove the taste section of the profile. log it to be a potential future feature.
- we need to redesign the home page. the album covers are way too big, and it looks bad that they're left-aligned because theyre so big. also, the reactions can be collapsed into a single emoji button
- rename the "play in [service]" button to "open in [service]"
- purple send button in the navbar:
  - redesign it to be similar to youtube. make it a circle, and ensure that the top and bottom line up with the top of the other icons, and the bottom of the text of the other icons
  - make the paper plane icon rounded, like the rest of the app
- make the send modal default to the playlists screen, and make the other tab list all songs in the users library, keeping the search bar at the top
- redesign the library to look like the send modal. no card backgrounds, no colored dot for the streaming service, no send icon. just the album cover, name, number of tracks, and arrow.