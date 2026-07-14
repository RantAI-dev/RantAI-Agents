import sharp from 'sharp';
import path from 'path';
import fs from 'fs';

const LOGO_DIR = path.join(process.cwd(), 'public/logo');

// Two colourways of the same mark: navy+blue for light surfaces, white+blue for
// dark ones. The mark is 130x100 — wider than tall — so every square output
// centres it with padding rather than stretching it.
const MARK_LIGHT = path.join(LOGO_DIR, 'rantai-agents-light.svg');
const MARK_DARK = path.join(LOGO_DIR, 'rantai-agents-dark.svg');

const BRAND_NAVY = { r: 5, g: 10, b: 48, alpha: 1 }; // --brand-2, #050A30
const TRANSPARENT = { r: 0, g: 0, b: 0, alpha: 0 };
const PADDING_RATIO = 0.14;

interface Target {
  name: string;
  size: number;
  mark: string;
  background: { r: number; g: number; b: number; alpha: number };
}

const targets: Target[] = [
  { name: 'favicon-16x16.png', size: 16, mark: MARK_LIGHT, background: TRANSPARENT },
  { name: 'favicon-32x32.png', size: 32, mark: MARK_LIGHT, background: TRANSPARENT },
  { name: 'android-chrome-192x192.png', size: 192, mark: MARK_LIGHT, background: TRANSPARENT },
  { name: 'android-chrome-512x512.png', size: 512, mark: MARK_LIGHT, background: TRANSPARENT },
  // iOS ignores transparency on home-screen icons and composites them onto black,
  // which would swallow the navy mark whole. So this one is opaque on purpose:
  // brand navy carrying the white colourway.
  { name: 'apple-touch-icon.png', size: 180, mark: MARK_DARK, background: BRAND_NAVY },
];

async function generateFavicons() {
  console.log('🎨 Generating favicons from the RantAI Agents mark...\n');

  for (const file of [MARK_LIGHT, MARK_DARK]) {
    if (!fs.existsSync(file)) {
      console.error('❌ Error: Input file not found:', file);
      process.exit(1);
    }
  }

  for (const { name, size, mark, background } of targets) {
    const outputPath = path.join(LOGO_DIR, name);
    const pad = Math.round(size * PADDING_RATIO);
    const inner = size - pad * 2;

    try {
      // Rasterise at high density first, so the 16px output stays crisp.
      const rendered = await sharp(fs.readFileSync(mark), { density: 2400 })
        .resize(inner, inner, { fit: 'contain', background: TRANSPARENT })
        .png()
        .toBuffer();

      await sharp({
        create: { width: size, height: size, channels: 4, background },
      })
        .composite([{ input: rendered, gravity: 'center' }])
        .png()
        .toFile(outputPath);

      const bg = background.alpha === 0 ? 'transparent' : 'navy';
      console.log(`✅ Generated: ${name} (${size}x${size}, ${bg})`);
    } catch (error) {
      console.error(`❌ Failed to generate ${name}:`, error);
    }
  }

  console.log('\n🎉 Favicon generation complete!');
}

generateFavicons().catch(console.error);
