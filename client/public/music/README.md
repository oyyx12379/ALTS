Place background music files in this folder.

Recommended formats:
- `.mp3`
- `.ogg`
- `.m4a`

After adding files, register them in:

`client/src/music/bgmTracks.ts`

Example:

```ts
{
  id: 'main-theme',
  title: 'Main Theme',
  artist: 'Unknown',
  src: '/music/main-theme.mp3',
  scene: 'global',
  loop: true,
}
```
