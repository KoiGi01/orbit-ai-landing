import assert from 'node:assert/strict';
import test from 'node:test';

import { CANVAS, computeLayout } from '../dashboard/src/signature-canvas.js';

test('shifts the text column right to make room for a photo', () => {
  const withPhoto = computeLayout({ hasPhoto: true });
  const withoutPhoto = computeLayout({ hasPhoto: false });
  assert.ok(
    withPhoto.textX > withoutPhoto.textX,
    `expected the text to start further right with a photo (${withPhoto.textX} vs ${withoutPhoto.textX})`
  );
});

test('reserves no photo box when there is no photo', () => {
  assert.equal(computeLayout({ hasPhoto: false }).photo, null);
  assert.ok(computeLayout({ hasPhoto: true }).photo);
});

test('keeps every drawn element inside the canvas', () => {
  for (const hasPhoto of [true, false]) {
    const layout = computeLayout({ hasPhoto });
    const boxes = [layout.photo, layout.bar, layout.logo].filter(Boolean);
    for (const box of boxes) {
      assert.ok(box.x >= 0, `element starts off the left edge (${box.x})`);
      assert.ok(box.y >= 0, `element starts above the top edge (${box.y})`);
      assert.ok(box.x + box.width <= CANVAS.width, `element overflows the right edge`);
      assert.ok(box.y + box.height <= CANVAS.height, `element overflows the bottom edge`);
    }
    for (const baseline of [layout.name.baseline, layout.role.baseline, layout.tagline.baseline]) {
      assert.ok(baseline > 0 && baseline <= CANVAS.height, `text baseline ${baseline} is outside the canvas`);
    }
  }
});

test('centres the photo vertically', () => {
  const { photo } = computeLayout({ hasPhoto: true });
  const topGap = photo.y;
  const bottomGap = CANVAS.height - (photo.y + photo.height);
  assert.ok(Math.abs(topGap - bottomGap) <= 1, `photo is not centred (${topGap} vs ${bottomGap})`);
});

test('exports at a retina scale so the PNG is not soft', () => {
  assert.ok(CANVAS.scale >= 2, `expected a scale of at least 2, got ${CANVAS.scale}`);
});

test('closes the gap under the name when there is no role', () => {
  const withRole = computeLayout({ hasPhoto: true, hasRole: true });
  const withoutRole = computeLayout({ hasPhoto: true, hasRole: false });
  assert.ok(
    withoutRole.tagline.baseline < withRole.tagline.baseline,
    `expected the tagline to move up without a role (${withoutRole.tagline.baseline} vs ${withRole.tagline.baseline})`
  );
});
