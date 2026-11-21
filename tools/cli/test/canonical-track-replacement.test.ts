import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import vm from "node:vm";

const oldVideoId = "TUjvd_-rX0E";
const newVideoId = "6quHuS5o6KQ";

function replacementResponse() {
  return {
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
                            videoId: newVideoId,
                            title: { runs: [{ text: "Pit Stop (Interlude)" }] },
                            longBylineText: {
                              runs: [
                                {
                                  text: "Yeat",
                                  navigationEndpoint: {
                                    browseEndpoint: {
                                      browseId: "UCXvxWMFHlTAXlhpwkQ4Y2Hw",
                                      browseEndpointContextSupportedConfigs: {
                                        browseEndpointContextMusicConfig: {
                                          pageType: "MUSIC_PAGE_TYPE_ARTIST",
                                        },
                                      },
                                    },
                                  },
                                },
                                { text: " • " },
                                {
                                  text: "Different Creature",
                                  navigationEndpoint: {
                                    browseEndpoint: {
                                      browseId: "MPREb_Pg9pLduRiDZ",
                                      browseEndpointContextSupportedConfigs: {
                                        browseEndpointContextMusicConfig: {
                                          pageType: "MUSIC_PAGE_TYPE_ALBUM",
                                        },
                                      },
                                    },
                                  },
                                },
                                { text: " • " },
                                { text: "2019" },
                              ],
                            },
                            shortBylineText: { runs: [{ text: "Yeat" }] },
                            lengthText: { runs: [{ text: "1:43" }] },
                            thumbnail: {
                              thumbnails: [
                                { url: "https://yt3.googleusercontent.com/new=w60-h60-l90-rj" },
                                { url: "https://yt3.googleusercontent.com/new=w120-h120-l90-rj" },
                                { url: "https://yt3.googleusercontent.com/new=w544-h544-l90-rj" },
                              ],
                            },
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
}

type ReplacementCall = { trackId: string; replacement: Record<string, any> };

function loadCanonicalHelper(canonicalId: string | null) {
  const replaceCalls: ReplacementCall[] = [];
  const fetchCalls: Array<{ url: string; options: Record<string, any> }> = [];
  const credentialFetchCalls: Array<{ url: string; options: Record<string, any> }> = [];
  const values: Record<string, string> = {
    YOUTUBE_MUSIC_API_KEY: "api-key",
    YOUTUBE_MUSIC_CLIENT_VERSION: "client-version",
    YOUTUBE_MUSIC_VISITOR_DATA: "visitor-data",
  };
  const context = vm.createContext({
    boppa: {
      store: { get: (key: string) => values[key] ?? null },
      replaceTrack: async (trackId: string, replacement: Record<string, any>) => {
        replaceCalls.push({ trackId, replacement });
        return { replaced: true };
      },
    },
    fetch: async (url: string, options: Record<string, any>) => {
      fetchCalls.push({ url, options });
      const href = canonicalId
        ? `https://music.youtube.com/watch?v=${canonicalId}`
        : `https://music.youtube.com/watch?v=${oldVideoId}`;
      return {
        ok: true,
        text: async () => `<html><head><link rel="canonical" href="${href}"></head></html>`,
      };
    },
    credentialFetch: async (url: string, options: Record<string, any>) => {
      credentialFetchCalls.push({ url, options });
      return { ok: true, status: 200, json: async () => replacementResponse() };
    },
    URL,
    encodeURIComponent,
  });
  const source = readFileSync(
    new URL("../../../youtube-music/container/45-canonical-track.js", import.meta.url),
    "utf8",
  );
  vm.runInContext(source, context);
  const resolve = vm.runInContext("youtubeMusicCanonicalReplacement", context) as (
    track: Record<string, any>, videoId: string, signal?: AbortSignal
  ) => Promise<Record<string, any> | null>;
  const parseCanonicalId = vm.runInContext("youtubeMusicCanonicalVideoId", context) as (
    html: string, videoId: string
  ) => string | null;
  return { resolve, parseCanonicalId, replaceCalls, fetchCalls, credentialFetchCalls };
}

test("canonical YouTube Music track replacement updates the track and album ids", async () => {
  const harness = loadCanonicalHelper(newVideoId);
  const signal = new AbortController().signal;

  const result = await harness.resolve({
    id: oldVideoId,
    title: "Pit Stop (Interlude)",
    url: `https://music.youtube.com/watch?v=${oldVideoId}`,
    metadata: { old: true },
  }, oldVideoId, signal);

  assert.ok(result);
  assert.equal(harness.replaceCalls.length, 1);
  assert.equal(harness.replaceCalls[0].trackId, oldVideoId);
  assert.equal(harness.replaceCalls[0].replacement.id, newVideoId);
  assert.equal(harness.replaceCalls[0].replacement.title, "Pit Stop (Interlude)");
  assert.equal(harness.replaceCalls[0].replacement.subtitle, "Yeat");
  assert.equal(harness.replaceCalls[0].replacement.duration, 103000);
  assert.equal(harness.replaceCalls[0].replacement.metadata.old, undefined);
  assert.equal(harness.replaceCalls[0].replacement.profiles[0].id, "UCXvxWMFHlTAXlhpwkQ4Y2Hw");
  assert.equal(harness.replaceCalls[0].replacement.tracklists[0].id, "MPREb_Pg9pLduRiDZ");
  assert.equal(harness.replaceCalls[0].replacement.tracklists[0].year, 2019);
  assert.equal(result.videoId, newVideoId);
  assert.equal(result.track.id, newVideoId);
  assert.equal(result.track.trackId, newVideoId);
  assert.equal(result.track.metadata.old, undefined);
  assert.equal(harness.fetchCalls[0].options.credentials, "omit");
  assert.equal(harness.fetchCalls[0].options.signal, signal);
  assert.equal(harness.credentialFetchCalls.length, 1);
  const requestBody = JSON.parse(harness.credentialFetchCalls[0].options.body);
  assert.equal(requestBody.videoId, newVideoId);
  assert.equal(requestBody.context.client.visitorData, "visitor-data");
});

test("an unchanged canonical URL does not replace the track", async () => {
  const harness = loadCanonicalHelper(null);

  const result = await harness.resolve({ id: oldVideoId }, oldVideoId);

  assert.equal(result, null);
  assert.equal(harness.replaceCalls.length, 0);
  assert.equal(harness.credentialFetchCalls.length, 0);
});

test("canonical track parsing accepts reordered attributes and rejects unsafe URLs", () => {
  const { parseCanonicalId } = loadCanonicalHelper(null);

  assert.equal(
    parseCanonicalId(
      `<link href="https://music.youtube.com/watch?feature=share&amp;v=${newVideoId}" rel="alternate canonical">`,
      oldVideoId,
    ),
    newVideoId,
  );
  assert.equal(
    parseCanonicalId(
      `<link rel="canonical" href="http://music.youtube.com/watch?v=${newVideoId}">`,
      oldVideoId,
    ),
    null,
  );
  assert.equal(
    parseCanonicalId(
      `<link rel="canonical" href="https://evil.music.youtube.com/watch?v=${newVideoId}">`,
      oldVideoId,
    ),
    null,
  );
  assert.equal(
    parseCanonicalId(
      `<link rel="canonical" href="https://music.youtube.com/watch?v=too-short">`,
      oldVideoId,
    ),
    null,
  );
});

test("an untrusted canonical URL does not replace the track", async () => {
  const replaceCalls: ReplacementCall[] = [];
  const context = vm.createContext({
    boppa: {
      store: { get: () => null },
      replaceTrack: async (trackId: string, replacement: Record<string, any>) => {
        replaceCalls.push({ trackId, replacement });
      },
    },
    fetch: async () => ({
      ok: true,
      text: async () => `<link rel="canonical" href="https://example.com/watch?v=${newVideoId}">`,
    }),
    credentialFetch: async () => assert.fail("replacement metadata should not be requested"),
    URL,
    encodeURIComponent,
  });
  const source = readFileSync(
    new URL("../../../youtube-music/container/45-canonical-track.js", import.meta.url),
    "utf8",
  );
  vm.runInContext(source, context);
  const resolve = vm.runInContext("youtubeMusicCanonicalReplacement", context) as (
    track: Record<string, any>, videoId: string
  ) => Promise<Record<string, any> | null>;

  const result = await resolve({ id: oldVideoId }, oldVideoId);

  assert.equal(result, null);
  assert.equal(replaceCalls.length, 0);
});
