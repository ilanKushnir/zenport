import { describe, expect, it } from 'vitest';
import { classifyYouTubeUrl } from './youtube.js';

describe('classifyYouTubeUrl', () => {
  it('classifies a standard watch URL', () => {
    const r = classifyYouTubeUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
    expect(r).toEqual({ kind: 'video', videoId: 'dQw4w9WgXcQ' });
  });

  it('classifies youtu.be short links', () => {
    const r = classifyYouTubeUrl('https://youtu.be/dQw4w9WgXcQ?t=42');
    expect(r).toEqual({ kind: 'video', videoId: 'dQw4w9WgXcQ' });
  });

  it('classifies shorts and live URLs as videos', () => {
    expect(classifyYouTubeUrl('https://www.youtube.com/shorts/aAbBcCdDeE1')).toEqual({
      kind: 'video',
      videoId: 'aAbBcCdDeE1',
    });
    expect(classifyYouTubeUrl('https://youtube.com/live/aAbBcCdDeE1')).toEqual({
      kind: 'video',
      videoId: 'aAbBcCdDeE1',
    });
  });

  it('classifies playlist URLs', () => {
    const r = classifyYouTubeUrl('https://www.youtube.com/playlist?list=PL1234567890abcdef');
    expect(r).toEqual({ kind: 'playlist', playlistId: 'PL1234567890abcdef' });
  });

  it('prefers the video when a watch URL also carries a list', () => {
    const r = classifyYouTubeUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=PLxyz1234567');
    expect(r).toEqual({ kind: 'video', videoId: 'dQw4w9WgXcQ', playlistId: 'PLxyz1234567' });
  });

  it('classifies handle, channel-id, and legacy channel URLs', () => {
    expect(classifyYouTubeUrl('https://www.youtube.com/@SomeTeacher')).toEqual({
      kind: 'channel',
      channelRef: '@SomeTeacher',
    });
    expect(classifyYouTubeUrl('https://www.youtube.com/channel/UCabcdefghij1234567890xx')).toEqual({
      kind: 'channel',
      channelRef: 'UCabcdefghij1234567890xx',
    });
    expect(classifyYouTubeUrl('https://www.youtube.com/c/SomeTeacher')).toEqual({
      kind: 'channel',
      channelRef: 'SomeTeacher',
    });
  });

  it('accepts music.youtube.com and m.youtube.com hosts', () => {
    expect(classifyYouTubeUrl('https://m.youtube.com/watch?v=dQw4w9WgXcQ')).toEqual({
      kind: 'video',
      videoId: 'dQw4w9WgXcQ',
    });
  });

  it('rejects non-YouTube hosts', () => {
    expect(classifyYouTubeUrl('https://vimeo.com/12345')).toEqual({
      kind: 'invalid',
      reason: 'unsupported-host',
    });
    expect(classifyYouTubeUrl('https://youtube.com.evil.example/watch?v=dQw4w9WgXcQ')).toEqual({
      kind: 'invalid',
      reason: 'unsupported-host',
    });
  });

  it('rejects malformed URLs and non-http schemes', () => {
    expect(classifyYouTubeUrl('not a url')).toEqual({ kind: 'invalid', reason: 'malformed' });
    expect(classifyYouTubeUrl('javascript:alert(1)')).toEqual({
      kind: 'invalid',
      reason: 'unsupported-host',
    });
  });

  it('rejects youtube URLs with no recognizable target', () => {
    expect(classifyYouTubeUrl('https://www.youtube.com/feed/library')).toEqual({
      kind: 'invalid',
      reason: 'unrecognized-path',
    });
    expect(classifyYouTubeUrl('https://www.youtube.com/watch')).toEqual({
      kind: 'invalid',
      reason: 'unrecognized-path',
    });
  });

  it('rejects malformed video ids', () => {
    expect(classifyYouTubeUrl('https://www.youtube.com/watch?v=short')).toEqual({
      kind: 'invalid',
      reason: 'bad-video-id',
    });
  });
});
