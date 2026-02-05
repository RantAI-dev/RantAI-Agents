import sharp from 'sharp';
import path from 'path';
import fs from 'fs';

const INPUT_FILE = path.join(process.cwd(), 'public/logo/logo-rantai-border.png');
const OUTPUT_DIR = path.join(process.cwd(), 'public/logo');

interface FaviconSize {
  name: string;
  size: number;
}

const sizes: FaviconSize[] = [
  { name: 'favicon-16x16.png', size: 16 },
  { name: 'favicon-32x32.png', size: 32 },
  { name: 'apple-touch-icon.png', size: 180 },
  { name: 'android-chrome-192x192.png', size: 192 },
  { name: 'android-chrome-512x512.png', size: 512 },
];

async function generateFavicons() {
  console.log('🎨 Generating favicons from logo-rantai-border.png...\n');

  // Check if input file exists
  if (!fs.existsSync(INPUT_FILE)) {
    console.error('❌ Error: Input file not found:', INPUT_FILE);
    process.exit(1);
  }

  // Ensure output directory exists
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  // Generate each size
  for (const { name, size } of sizes) {
    const outputPath = path.join(OUTPUT_DIR, name);
    
    try {
      await sharp(INPUT_FILE)
        .resize(size, size, {
          fit: 'contain',
          background: { r: 255, g: 255, b: 255, alpha: 0 }
        })
        .png()
        .toFile(outputPath);
      
      console.log(`✅ Generated: ${name} (${size}x${size})`);
    } catch (error) {
      console.error(`❌ Failed to generate ${name}:`, error);
    }
  }

  console.log('\n🎉 Favicon generation complete!');
  console.log('\nGenerated files:');
  sizes.forEach(({ name }) => {
    console.log(`  - public/logo/${name}`);
  });
}

generateFavicons().catch(console.error);
