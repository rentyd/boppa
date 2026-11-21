function youtubeMusicCanonicalVideoId(html, requestedVideoId) {
  const tags = String(html || '').match(/<link\b[^>]*>/gi) || [];
  for (const tag of tags) {
    const rel = (tag.match(/\brel=["']([^"']+)["']/i) || [])[1];
    if (!rel || !rel.split(/\s+/).some(function(value) {
      return value.toLowerCase() === 'canonical';
    })) continue;
    const href = (tag.match(/\bhref=["']([^"']+)["']/i) || [])[1];
    if (!href) continue;
    try {
      const canonical = new URL(href.replace(/&amp;/g, '&'));
      const videoId = canonical.searchParams.get('v');
      if (canonical.protocol === 'https:'
        && canonical.hostname === 'music.youtube.com'
        && canonical.pathname === '/watch'
        && /^[a-zA-Z0-9_-]{11}$/.test(String(videoId || ''))
        && videoId !== String(requestedVideoId)) return videoId;
    } catch (_) {}
  }
  return null;
}

function youtubeMusicReplacementDuration(timeStr) {
  const parts = String(timeStr || '').split(':').map(function(part) { return parseInt(part, 10); });
  if (parts.some(function(part) { return !Number.isFinite(part); })) return undefined;
  if (parts.length === 2) return (parts[0] * 60 + parts[1]) * 1000;
  if (parts.length === 3) return (parts[0] * 3600 + parts[1] * 60 + parts[2]) * 1000;
  return undefined;
}

function youtubeMusicReplacementArtwork(url) {
  if (!url) return url;
  if (url.indexOf('ytimg.com') !== -1) {
    return url.replace(/\/[^\/?]+\.(jpg|jpeg|webp)(\?.*)?$/i, '/maxresdefault.jpg');
  }
  return url.replace(/=w\d+-h\d+/, '=w544-h544');
}

async function youtubeMusicCanonicalReplacement(track, requestedVideoId, signal) {
  const pageResponse = await fetch(
    'https://music.youtube.com/watch?v=' + encodeURIComponent(requestedVideoId),
    {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
      },
      credentials: 'omit',
      signal: signal
    }
  );
  if (!pageResponse.ok) return null;
  const canonicalVideoId = youtubeMusicCanonicalVideoId(
    await pageResponse.text(), requestedVideoId
  );
  if (!canonicalVideoId) return null;

  const apiKey = boppa.store.get('YOUTUBE_MUSIC_API_KEY');
  const clientVersion = boppa.store.get('YOUTUBE_MUSIC_CLIENT_VERSION');
  const visitorData = boppa.store.get('YOUTUBE_MUSIC_VISITOR_DATA') || '';
  if (!apiKey || !clientVersion) {
    throw new Error('YouTube Music credentials are missing while resolving a moved track');
  }

  const client = {
    clientName: 'WEB_REMIX',
    clientVersion: clientVersion,
    hl: 'en',
    gl: 'US'
  };
  if (visitorData) client.visitorData = visitorData;
  const headers = {
    'Content-Type': 'application/json',
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
    'X-YouTube-Client-Name': '67',
    'X-YouTube-Client-Version': clientVersion
  };
  if (visitorData) headers['X-Goog-Visitor-Id'] = visitorData;

  const nextResponse = await credentialFetch(
    'https://music.youtube.com/youtubei/v1/next?prettyPrint=false&key=' +
      encodeURIComponent(apiKey),
    {
      method: 'POST',
      headers: headers,
      body: JSON.stringify({ context: { client: client }, videoId: canonicalVideoId }),
      signal: signal
    }
  );
  if (!nextResponse.ok) {
    throw new Error('YouTube Music replacement lookup failed with ' + nextResponse.status);
  }
  const data = await nextResponse.json();
  const panel = data.contents?.singleColumnMusicWatchNextResultsRenderer
    ?.tabbedRenderer?.watchNextTabbedResultsRenderer?.tabs?.[0]?.tabRenderer
    ?.content?.musicQueueRenderer?.content?.playlistPanelRenderer;
  const renderer = (panel?.contents || [])
    .map(function(item) { return item.playlistPanelVideoRenderer; })
    .find(function(item) { return item?.videoId === canonicalVideoId; });
  if (!renderer) {
    throw new Error('YouTube Music returned no metadata for replacement track ' + canonicalVideoId);
  }

  const artists = [];
  const tracklists = [];
  let year;
  for (const run of (renderer.longBylineText?.runs || renderer.shortBylineText?.runs || [])) {
    const browse = run.navigationEndpoint?.browseEndpoint;
    const pageType = browse?.browseEndpointContextSupportedConfigs
      ?.browseEndpointContextMusicConfig?.pageType;
    if ((pageType === 'MUSIC_PAGE_TYPE_ARTIST' || pageType === 'MUSIC_PAGE_TYPE_USER_CHANNEL')
      && run.text) {
      const artistId = browse.browseId || run.text;
      if (!artists.some(function(artist) { return artist.id === artistId; })) {
        artists.push({
          id: artistId,
          name: run.text,
          metadata: browse.browseId ? { browseId: browse.browseId } : {}
        });
      }
    } else if (pageType === 'MUSIC_PAGE_TYPE_ALBUM' && browse?.browseId && run.text) {
      tracklists.push({
        id: browse.browseId,
        title: run.text,
        metadata: { browseId: browse.browseId }
      });
    } else if (run.text && /^\d{4}$/.test(run.text.trim())) {
      year = parseInt(run.text.trim(), 10);
    }
  }
  if (!artists.length && renderer.shortBylineText?.runs?.[0]?.text) {
    const name = renderer.shortBylineText.runs[0].text;
    artists.push({ id: name, name: name });
  }

  const thumbnails = renderer.thumbnail?.thumbnails || [];
  const lowResArtworkUrl = thumbnails[1]?.url || thumbnails[0]?.url;
  const highResArtworkUrl = youtubeMusicReplacementArtwork(
    thumbnails[thumbnails.length - 1]?.url || lowResArtworkUrl
  );
  for (const tracklist of tracklists) {
    tracklist.lowResArtworkUrl = lowResArtworkUrl;
    tracklist.highResArtworkUrl = highResArtworkUrl;
    if (year !== undefined) tracklist.year = year;
  }

  const replacement = {
    id: canonicalVideoId,
    title: renderer.title?.runs?.[0]?.text || '',
    subtitle: artists.map(function(artist) { return artist.name; }).join(', ') || undefined,
    duration: youtubeMusicReplacementDuration(renderer.lengthText?.runs?.[0]?.text),
    lowResArtworkUrl: lowResArtworkUrl,
    highResArtworkUrl: highResArtworkUrl,
    url: 'https://music.youtube.com/watch?v=' + encodeURIComponent(canonicalVideoId),
    metadata: {}
  };
  if (!replacement.title) {
    throw new Error('YouTube Music replacement track has no title');
  }
  if (artists.length) replacement.profiles = artists;
  if (tracklists.length) replacement.tracklists = tracklists;

  const result = typeof boppa.replaceTrack === 'function'
    ? await boppa.replaceTrack(String(track.id), replacement)
    : { replaced: false, reason: 'replace-track-unavailable' };
  return {
    videoId: canonicalVideoId,
    replacement: replacement,
    result: result,
    track: Object.assign({}, track, replacement, {
      id: canonicalVideoId,
      trackId: canonicalVideoId,
      metadata: replacement.metadata
    })
  };
}
