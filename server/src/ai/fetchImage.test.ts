import { describe, expect, it } from 'vitest';
import { downloadImage, isPrivateAddress, imageAddresses } from './fetchImage.js';

describe('fetching a suggested image', () => {
  it('knows the addresses it must never reach', () => {
    for (const ip of [
      '127.0.0.1',
      '10.1.2.3',
      '192.168.1.120',
      '172.20.0.2',
      '169.254.169.254',
      '100.64.1.1',
      '0.0.0.0',
      '::1',
      'fd12::1',
      'fe80::1',
      '::ffff:192.168.1.1',
    ]) {
      expect(isPrivateAddress(ip), ip).toBe(true);
    }
    for (const ip of ['1.1.1.1', '140.82.112.3', '2606:4700::6810:85e5']) {
      expect(isPrivateAddress(ip), ip).toBe(false);
    }
  });

  it('refuses plain http and internal hosts before sending anything', async () => {
    await expect(downloadImage('http://example.com/a.jpg')).rejects.toThrow('only https');
    await expect(downloadImage('https://127.0.0.1/a.jpg')).rejects.toThrow('not a public address');
    await expect(downloadImage('https://[::1]/a.jpg')).rejects.toThrow('not a public address');
    await expect(downloadImage('not a url')).rejects.toThrow('not an address');
  });

  it('asks Wikimedia for a width it serves, then the original', () => {
    expect(
      imageAddresses(
        'https://upload.wikimedia.org/wikipedia/commons/thumb/a/a7/Some_Person.jpg/640px-Some_Person.jpg',
      ),
    ).toEqual([
      'https://upload.wikimedia.org/wikipedia/commons/thumb/a/a7/Some_Person.jpg/960px-Some_Person.jpg',
      'https://upload.wikimedia.org/wikipedia/commons/a/a7/Some_Person.jpg',
    ]);
    expect(imageAddresses('https://example.org/a/portrait.jpg')).toEqual([
      'https://example.org/a/portrait.jpg',
    ]);
  });
});
