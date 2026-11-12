import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import vm from "node:vm";

type DataHandler = (params: Record<string, any>) => Promise<Record<string, any>>;

const artistRun = {
  text: "Example Artist",
  navigationEndpoint: {
    browseEndpoint: {
      browseId: "UC-example-artist",
      browseEndpointContextSupportedConfigs: {
        browseEndpointContextMusicConfig: { pageType: "MUSIC_PAGE_TYPE_ARTIST" },
      },
    },
  },
};

const albumRun = {
  text: "Example Album",
  navigationEndpoint: {
    browseEndpoint: {
      browseId: "MPRE-example-album",
      browseEndpointContextSupportedConfigs: {
        browseEndpointContextMusicConfig: { pageType: "MUSIC_PAGE_TYPE_ALBUM" },
      },
    },
  },
};

function loadHandler(sourcePath: string, response: Record<string, any>, handlerName: string): DataHandler {
  const handlers: Record<string, DataHandler> = {};
  const source = readFileSync(new URL(sourcePath, import.meta.url), "utf8");
  vm.runInNewContext(source, {
    boppa: {
      data: { register: (registered: Record<string, DataHandler>) => Object.assign(handlers, registered) },
      store: { get: () => "test-value" },
    },
    credentialedData: (_keys: string[], registered: Record<string, DataHandler>) => registered,
    credentialFetch: async () => ({ ok: true, status: 200, json: async () => response }),
    Set,
  });
  return handlers[handlerName];
}

function searchResponse() {
  return {
    contents: {
      tabbedSearchResultsRenderer: {
        tabs: [{
          tabRenderer: {
            content: {
              sectionListRenderer: {
                contents: [
                  {
                    musicCardShelfRenderer: {
                      title: {
                        runs: [{
                          text: "Top result song",
                          navigationEndpoint: { watchEndpoint: { videoId: "top-result" } },
                        }],
                      },
                      subtitle: { runs: [artistRun, { text: " • " }, albumRun, { text: " • " }, { text: "3:10" }] },
                    },
                  },
                  {
                    musicShelfRenderer: {
                      contents: [{
                        musicResponsiveListItemRenderer: {
                          playlistItemData: { videoId: "shelf-result" },
                          flexColumns: [
                            { musicResponsiveListItemFlexColumnRenderer: { text: { runs: [{ text: "Shelf song" }] } } },
                            {
                              musicResponsiveListItemFlexColumnRenderer: {
                                text: { runs: [artistRun, { text: " • " }, albumRun, { text: " • " }, { text: "2:45" }] },
                              },
                            },
                          ],
                        },
                      }],
                    },
                  },
                ],
              },
            },
          },
        }],
      },
    },
  };
}

test("YouTube Music song search attaches the artist subtitle to album metadata", async () => {
  const handler = loadHandler(
    "../../../youtube-music/container/50-search-tracks-song.js",
    searchResponse(),
    "search/tracks/song",
  );

  const result = await handler({ query: "example" });

  assert.equal(result.items.length, 2);
  assert.equal(result.items[0].tracklists[0].subtitle, "Example Artist");
  assert.equal(result.items[1].tracklists[0].subtitle, "Example Artist");
});

test("YouTube Music song lookup attaches the artist subtitle to album metadata", async () => {
  const response = {
    contents: {
      singleColumnMusicWatchNextResultsRenderer: {
        tabbedRenderer: {
          watchNextTabbedResultsRenderer: {
            tabs: [{
              tabRenderer: {
                content: {
                  musicQueueRenderer: {
                    content: {
                      playlistPanelRenderer: {
                        contents: [{
                          playlistPanelVideoRenderer: {
                            videoId: "looked-up-song",
                            title: { runs: [{ text: "Looked-up song" }] },
                            longBylineText: {
                              runs: [artistRun, { text: " • " }, albumRun, { text: " • " }, { text: "2024" }],
                            },
                            lengthText: { runs: [{ text: "4:05" }] },
                          },
                        }],
                      },
                    },
                  },
                },
              },
            }],
          },
        },
      },
    },
  };
  const handler = loadHandler(
    "../../../youtube-music/container/50-get-track-song.js",
    response,
    "get/track/song",
  );

  const result = await handler({ id: "looked-up-song" });

  assert.equal(result.tracklists[0].subtitle, "Example Artist");
});
