import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

// Reads width/height straight out of the PNG IHDR chunk so the test needs no
// image library.
function pngSize(path) {
  const buffer = fs.readFileSync(path);
  assert.equal(buffer.subarray(1, 4).toString('ascii'), 'PNG', `${path} is not a PNG`);
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20), bytes: buffer.length };
}

// The AutiveX ribbon is a landscape mark (~2.08:1) that ships inside a square
// source canvas padded with transparency. Exporting that square wholesale left
// the mark filling under 10% of the image, so it rendered tiny in mail clients.
// The signature asset must be cropped to the artwork itself.
const ARTWORK_ASPECT = 2.08;

test('ships the signature logo cropped to the ribbon artwork, not a padded square', () => {
  const { width, height } = pngSize('public/autivex-signature-logo.png');
  const aspect = width / height;
  assert.ok(
    Math.abs(aspect - ARTWORK_ASPECT) < 0.2,
    `expected an aspect near ${ARTWORK_ASPECT}:1, got ${aspect.toFixed(2)}:1 (${width}x${height}) — padding is back`
  );
});

test('keeps the signature logo small enough to embed in an email', () => {
  const { bytes } = pngSize('public/autivex-signature-logo.png');
  assert.ok(bytes < 20 * 1024, `expected under 20 KB, got ${(bytes / 1024).toFixed(1)} KB`);
});
