import sharp from 'sharp';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const imagesDir = path.join(__dirname, '..', 'assets', 'images');
const sourceImage = path.join(imagesDir, 'logo.jpg');
const pngOptions = {
  compressionLevel: 9,
  quality: 80,
  adaptiveFiltering: true,
  palette: true,
};

async function generateIcons() {
  console.log('🖼️  Generating app icons from foodiefinder.jpg...\n');

  // Check if source exists
  if (!fs.existsSync(sourceImage)) {
    console.error('❌ Source image not found:', sourceImage);
    process.exit(1);
  }

  const icons = [
    { name: 'icon.png', size: 1024 },
    { name: 'android-icon-foreground.png', size: 432 },
    { name: 'android-icon-background.png', size: 432 },
    { name: 'android-icon-monochrome.png', size: 432 },
    { name: 'splash-icon.png', size: 288 },
    { name: 'favicon.png', size: 48 },
  ];

  for (const icon of icons) {
    const outputPath = path.join(imagesDir, icon.name);
    
    try {
      if (icon.name === 'android-icon-background.png') {
        // Create a solid color background
        await sharp({
          create: {
            width: icon.size,
            height: icon.size,
            channels: 4,
            background: { r: 107, g: 163, b: 190, alpha: 1 }, // #6BA3BE
          }
        })
          .png(pngOptions)
          .toFile(outputPath);
      } else if (icon.name === 'android-icon-monochrome.png') {
        // Create grayscale version
        await sharp(sourceImage)
          .resize(icon.size, icon.size, { fit: 'cover' })
          .grayscale()
          .png(pngOptions)
          .toFile(outputPath);
      } else {
        // Regular resize
        await sharp(sourceImage)
          .resize(icon.size, icon.size, { fit: 'cover' })
          .png(pngOptions)
          .toFile(outputPath);
      }
      
      console.log(`✅ Created ${icon.name} (${icon.size}x${icon.size})`);
    } catch (err) {
      console.error(`❌ Failed to create ${icon.name}:`, err.message);
    }
  }

  console.log('\n🎉 Icon generation complete!');
}

generateIcons();
