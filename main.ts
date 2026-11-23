import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

// The checked-in artwork is the complete, deterministic offline deliverable.
const artwork = readFileSync(new URL('entry.png', import.meta.url));
const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
if (artwork.length > 1048576 || !artwork.subarray(0, 8).equals(signature)) {
  throw new Error('Artwork must be a PNG no larger than 1 MiB');
}
if (artwork.length < 33 || artwork.toString('ascii', 12, 16) !== 'IHDR' ||
    artwork.readUInt32BE(16) !== 1024 || artwork.readUInt32BE(20) !== 1024) {
  throw new Error('Artwork must measure exactly 1024 by 1024 pixels');
}
const destination = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
// Verify every chunk checksum and the terminal marker before publishing bytes.
let cursor = 8;
let sawData = false;
let sawEnd = false;
while (cursor < artwork.length) {
  if (cursor + 12 > artwork.length) throw new Error('Truncated PNG chunk');
  const length = artwork.readUInt32BE(cursor);
  const end = cursor + 12 + length;
  if (end > artwork.length) throw new Error('Incomplete PNG payload');
  const kind = artwork.toString('ascii', cursor + 4, cursor + 8);
  let checksum = 0xffffffff;
  for (const byte of artwork.subarray(cursor + 4, end - 4)) {
    checksum ^= byte;
    for (let bit = 0; bit < 8; bit++) {
      checksum = (checksum >>> 1) ^ ((checksum & 1) ? 0xedb88320 : 0);
    }
  }
  if (((checksum ^ 0xffffffff) >>> 0) !== artwork.readUInt32BE(end - 4)) {
    throw new Error('PNG chunk checksum mismatch');
  }
  if (kind === 'IDAT') sawData = true;
  cursor = end;
  if (kind === 'IEND') {
    if (length !== 0 || cursor !== artwork.length) throw new Error('Invalid PNG ending');
    sawEnd = true;
    break;
  }
}
if (!sawData || !sawEnd) throw new Error('PNG lacks image data or end marker');
mkdirSync(destination, { recursive: true });
writeFileSync(resolve(destination, 'entry.png'), artwork);
