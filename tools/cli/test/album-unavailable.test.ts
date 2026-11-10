import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import vm from "node:vm";

type DataHandler = (params: Record<string, any>) => Promise<Record<string, any>>;

function loadHandler(sourcePath: string, response: Record<string, any>): DataHandler {
  const handlers: Record<string, DataHandler> = {};
  const source = readFileSync(new URL(sourcePath, import.meta.url), "utf8");
  vm.runInNewContext(source, {
    boppa: {
      data: { register: (registered: Record<string, DataHandler>) => Object.assign(handlers, registered) },
      store: {
        get: (key: string) => ({
          YOUTUBE_MUSIC_API_KEY: "api-key",
          YOUTUBE_MUSIC_CLIENT_VERSION: "client-version",
        })[key] ?? null,
      },
    },
    credentialedData: (_keys: string[], registered: Record<string, DataHandler>) => registered,
    credentialFetch: async () => ({ ok: true, status: 200, json: async () => response }),
    encodeURIComponent,
  });
  return Object.values(handlers)[0];
}

const removedAlbumResponse = {
  responseContext: {},
  trackingParams: "tracking",
  microformat: { microformatDataRenderer: { noindex: true } },
};

test("removed YouTube Music album metadata reports that the album is unavailable", async () => {
  const handler = loadHandler(
    "../../../youtube-music/container/50-get-tracklist-album.js",
    removedAlbumResponse,
  );

  await assert.rejects(
    handler({ id: "removed-album" }),
    /This album is no longer available on YouTube Music/,
  );
});

test("removed YouTube Music album tracks report that the album is unavailable", async () => {
  const handler = loadHandler(
    "../../../youtube-music/container/50-list-tracklist-album.js",
    removedAlbumResponse,
  );

  await assert.rejects(
    handler({ id: "removed-album" }),
    /This album is no longer available on YouTube Music/,
  );
});

test("a valid YouTube Music album with no tracks remains an empty album", async () => {
  const validEmptyAlbumResponse = {
    contents: {
      twoColumnBrowseResultsRenderer: {
        tabs: [{
          tabRenderer: {
            content: {
              sectionListRenderer: {
                contents: [{
                  musicResponsiveHeaderRenderer: {
                    title: { runs: [{ text: "Empty album" }] },
                  },
                }],
              },
            },
          },
        }],
      },
    },
  };
  const handler = loadHandler(
    "../../../youtube-music/container/50-list-tracklist-album.js",
    validEmptyAlbumResponse,
  );

  const result = await handler({ id: "empty-album" });

  assert.equal(result.items.length, 0);
});
