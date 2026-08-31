// Renders the AutiveX signature to a canvas so it can be exported as a PNG.
//
// Going to an image buys two things HTML email cannot: the real brand typeface
// (mail clients strip webfonts) and a photo that needs no public hosting,
// because it is drawn into the bitmap rather than referenced by URL.
//
// It costs interactivity — an image carries no links — which is why the studio
// pairs it with a separate clickable line from signature-template.js.
//
// Geometry lives in computeLayout so it can be asserted without a canvas.

export const CANVAS = { width: 560, height: 130, scale: 2 };

export const PALETTE = {
  background: '#ffffff',
  ink: '#071631',
  muted: '#4d5b78',
  accentInk: '#0b6f68',
  cyan: '#47e6de',
};

export const FONT = 'Manrope Variable';

const PHOTO_SIZE = 72;
const GUTTER = 6;
const BAR_WIDTH = 3;
const LOGO = { width: 48, height: 23 };
// Width the brand lockup (mark + wordmark) reserves on the right.
const BRAND_BLOCK = 124;

export function computeLayout({ hasPhoto, hasRole = true }) {
  const photo = hasPhoto
    ? { x: GUTTER, y: Math.round((CANVAS.height - PHOTO_SIZE) / 2), width: PHOTO_SIZE, height: PHOTO_SIZE }
    : null;

  const barX = hasPhoto ? photo.x + photo.width + 12 : GUTTER;
  const bar = { x: barX, y: 22, width: BAR_WIDTH, height: CANVAS.height - 44 };
  const textX = bar.x + bar.width + 13;

  // Brand lockup sits right-aligned and vertically centred, clear of the copy.
  const logo = {
    x: CANVAS.width - GUTTER - BRAND_BLOCK,
    y: Math.round((CANVAS.height - LOGO.height) / 2),
    width: LOGO.width,
    height: LOGO.height,
  };

  return {
    photo,
    bar,
    textX,
    name: { x: textX, baseline: 47, size: 21, weight: 800, color: PALETTE.ink },
    role: { x: textX, baseline: 69, size: 13.5, weight: 700, color: PALETTE.accentInk },
    // Without a role the tagline rises into its slot instead of leaving a hole.
    tagline: { x: textX, baseline: hasRole ? 94 : 72, size: 11.5, weight: 500, color: PALETTE.muted },
    logo,
    wordmark: { x: logo.x + LOGO.width + 9, baseline: logo.y + 17, size: 15, weight: 800, color: PALETTE.ink },
  };
}

function font(weight, size) {
  return `${weight} ${size}px "${FONT}", Arial, sans-serif`;
}

// Draws the signature. `photoImage` and `logoImage` are already-loaded
// HTMLImageElements; the caller owns loading so this stays synchronous.
export function drawSignature(ctx, { fields = {}, locale = 'es', photoImage = null, logoImage = null, copy }) {
  const layout = computeLayout({ hasPhoto: Boolean(photoImage), hasRole: Boolean(fields.role) });
  const { width, height, scale } = CANVAS;

  ctx.save();
  ctx.scale(scale, scale);

  ctx.fillStyle = PALETTE.background;
  ctx.fillRect(0, 0, width, height);

  if (photoImage && layout.photo) {
    const { x, y, width: w, height: h } = layout.photo;
    ctx.save();
    ctx.beginPath();
    ctx.arc(x + w / 2, y + h / 2, w / 2, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();
    // Cover-fit so a non-square upload is cropped rather than squashed.
    const ratio = Math.max(w / photoImage.naturalWidth, h / photoImage.naturalHeight);
    const dw = photoImage.naturalWidth * ratio;
    const dh = photoImage.naturalHeight * ratio;
    ctx.drawImage(photoImage, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
    ctx.restore();
  }

  ctx.fillStyle = PALETTE.cyan;
  ctx.fillRect(layout.bar.x, layout.bar.y, layout.bar.width, layout.bar.height);

  ctx.textBaseline = 'alphabetic';

  ctx.fillStyle = layout.name.color;
  ctx.font = font(layout.name.weight, layout.name.size);
  ctx.fillText(fields.name || '', layout.name.x, layout.name.baseline);

  if (fields.role) {
    ctx.fillStyle = layout.role.color;
    ctx.font = font(layout.role.weight, layout.role.size);
    ctx.fillText(fields.role, layout.role.x, layout.role.baseline);
  }

  ctx.fillStyle = layout.tagline.color;
  ctx.font = font(layout.tagline.weight, layout.tagline.size);
  ctx.fillText(copy.tagline, layout.tagline.x, layout.tagline.baseline);

  if (logoImage) {
    ctx.drawImage(logoImage, layout.logo.x, layout.logo.y, layout.logo.width, layout.logo.height);
  }
  ctx.fillStyle = layout.wordmark.color;
  ctx.font = font(layout.wordmark.weight, layout.wordmark.size);
  ctx.fillText('AutiveX', layout.wordmark.x, layout.wordmark.baseline);

  ctx.restore();
  return layout;
}
