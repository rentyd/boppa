import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import vm from "node:vm";

type DataHandler = (params: Record<string, any>) => Promise<Record<string, any>>;

function loadHandler(
  sourcePath: string,
  storeValues: Record<string, string>,
  credentialFetch: (url: string, options?: Record<string, any>) => Promise<any>,
): DataHandler {
  const handlers: Record<string, DataHandler> = {};
  const source = readFileSync(new URL(sourcePath, import.meta.url), "utf8");
  vm.runInNewContext(source, {
    boppa: {
      data: { register: (registered: Record<string, DataHandler>) => Object.assign(handlers, registered) },
      store: { get: (key: string) => storeValues[key] },
    },
    credentialedData: (_keys: string[], registered: Record<string, DataHandler>) => registered,
    credentialFetch,
    encodeURIComponent,
    setTimeout,
  });
  return handlers["list/trackRadio"];
}

function youtubePanel(contents: unknown[]) {
  return {
    contents: {
      singleColumnMusicWatchNextResultsRenderer: {
        tabbedRenderer: {
          watchNextTabbedResultsRenderer: {
            tabs: [{
              tabRenderer: {
                content: {
                  musicQueueRenderer: {
                    content: { playlistPanelRenderer: { contents } },
                  },
                },
              },
            }],
          },
        },
      },
    },
  };
}

test("YouTube Music radio returns separate low- and high-resolution artwork", async () => {
  const response = youtubePanel([
    {
      playlistPanelVideoRenderer: {
        videoId: "recommended-video",
        title: { runs: [{ text: "Recommended video" }] },
        thumbnail: {
          thumbnails: [
            { url: "https://i.ytimg.com/vi/recommended-video/hqdefault.jpg?sqp=token", width: 400, height: 225 },
            { url: "https://i.ytimg.com/vi/recommended-video/hq720.jpg?sqp=token", width: 800, height: 450 },
            { url: "https://i.ytimg.com/vi/recommended-video/hq720.jpg?sqp=other", width: 853, height: 479 },
          ],
        },
      },
    },
    {
      playlistPanelVideoRenderer: {
        videoId: "recommended-song",
        title: { runs: [{ text: "Recommended song" }] },
        thumbnail: {
          thumbnails: [{
            url: "https://lh3.googleusercontent.com/album-art=w544-h544-l90-rj",
            width: 544,
            height: 544,
          }],
        },
      },
    },
  ]);
  const handler = loadHandler(
    "../../../youtube-music/container/50-list-trackRadio.js",
    {
      YOUTUBE_MUSIC_API_KEY: "api-key",
      YOUTUBE_MUSIC_CLIENT_VERSION: "client-version",
    },
    async () => ({ ok: true, json: async () => response }),
  );

  const result = await handler({ id: "seed-video", type: "song" });

  assert.equal(result.items.length, 2);
  assert.equal(
    result.items[0].lowResArtworkUrl,
    "https://i.ytimg.com/vi/recommended-video/mqdefault.jpg",
  );
  assert.equal(
    result.items[0].highResArtworkUrl,
    "https://i.ytimg.com/vi/recommended-video/maxresdefault.jpg",
  );
  assert.equal(
    result.items[1].lowResArtworkUrl,
    "https://lh3.googleusercontent.com/album-art=w160-h160-l90-rj",
  );
  assert.equal(
    result.items[1].highResArtworkUrl,
    "https://lh3.googleusercontent.com/album-art=w544-h544-l90-rj",
  );
});

test("SoundCloud radio keeps the API's low-resolution artwork and adds high-resolution artwork", async () => {
  const artworkUrl = "https://i1.sndcdn.com/artworks-example-large.jpg";
  const handler = loadHandler(
    "../../../soundcloud/container/50-list-trackRadio.js",
    { SOUNDCLOUD_CLIENT_ID: "client-id" },
    async () => ({
      json: async () => ({
        collection: [{
          id: 123,
          title: "Related track",
          artwork_url: artworkUrl,
          user: { id: 456, username: "Artist" },
          media: { transcodings: [] },
        }],
        next_href: null,
      }),
    }),
  );

  const result = await handler({ id: "seed-track" });

  assert.equal(result.items.length, 1);
  assert.equal(result.items[0].lowResArtworkUrl, artworkUrl);
  assert.equal(
    result.items[0].highResArtworkUrl,
    "https://i1.sndcdn.com/artworks-example-t1080x1080.jpg",
  );
  assert.notEqual(result.items[0].lowResArtworkUrl, result.items[0].highResArtworkUrl);
});
