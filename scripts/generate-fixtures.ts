import fs from 'fs';
import path from 'path';
import http from 'http';
import Sharp from 'sharp';
import { TextStickerProcessor } from '../src/stickers/processors/text.processor';
import { BubbleProcessor } from '../src/stickers/processors/bubble.processor';
import { QuoteProcessor } from '../src/stickers/processors/quote.processor';
import { TtpProcessor } from '../src/stickers/processors/ttp.processor';
import { AttpProcessor } from '../src/stickers/processors/attp.processor';
import { ImageStickerProcessor } from '../src/stickers/processors/image.processor';
import { MemeProcessor } from '../src/stickers/processors/meme.processor';
import env from '../src/config/env';


async function main() {
  const outDir = '/tmp/wabot-fixtures';
  fs.mkdirSync(outDir, { recursive: true });

  console.log(`Generating fixtures to ${outDir}...`);

  // 1. Plain Text
  const textProc = new TextStickerProcessor();
  const textRes = await textProc.process('Halo Dunia! 😂🔥');
  fs.writeFileSync(path.join(outDir, 'text.webp'), textRes.buffer);
  console.log('✓ text.webp');

  // 1b. Complex Emoji & Graphemes
  const emojiRes = await textProc.process('👨‍👩‍👧‍👦 Keluarga Bahagia ❤️ 🇮🇩 Indonesia');
  fs.writeFileSync(path.join(outDir, 'emoji.webp'), emojiRes.buffer);
  console.log('✓ emoji.webp');

  // 1c. Long Text without Silent Truncation
  const longTextRes = await textProc.process('Stiker teks panjang adaptif '.repeat(7) + ' ' + 'a'.repeat(40));
  fs.writeFileSync(path.join(outDir, 'long-text.webp'), longTextRes.buffer);
  console.log('✓ long-text.webp');

  // 2. Chat Bubble
  const bubbleProc = new BubbleProcessor();
  const bubbleRes = await bubbleProc.process('Pesan bubble WhatsApp dengan layout adaptif', 'Seno', '123@lid');
  fs.writeFileSync(path.join(outDir, 'bubble.webp'), bubbleRes.buffer);
  console.log('✓ bubble.webp');

  // 3. Quote
  const quoteProc = new QuoteProcessor();
  const quoteRes = await quoteProc.process('Hiduplah seolah kamu akan mati besok.', 'Mahatma Gandhi');
  fs.writeFileSync(path.join(outDir, 'quote.webp'), quoteRes.buffer);
  console.log('✓ quote.webp');

  // 4. TTP
  const ttpProc = new TtpProcessor();
  const ttpRes = await ttpProc.process('Gradien Warna Indah');
  fs.writeFileSync(path.join(outDir, 'ttp.webp'), ttpRes.buffer);
  console.log('✓ ttp.webp');

  // 5. ATTP
  const attpProc = new AttpProcessor();
  const attpRes = await attpProc.process('Animasi Keren');
  fs.writeFileSync(path.join(outDir, 'attp.webp'), attpRes.buffer);
  console.log('✓ attp.webp');

  // Sample JPEG served via ephemeral local HTTP server matching WAHA URL
  const sampleJpg = await Sharp({
    create: { width: 400, height: 400, channels: 3, background: { r: 60, g: 120, b: 220 } },
  }).jpeg().toBuffer();

  const server = http.createServer((_req, res) => {
    res.writeHead(200, { 'Content-Type': 'image/jpeg' });
    res.end(sampleJpg);
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const port = (server.address() as any).port;
  const savedBase = env.wahaBaseUrl;
  const savedApi = env.wahaApiUrl;
  env.wahaBaseUrl = `http://127.0.0.1:${port}`;
  env.wahaApiUrl = `http://127.0.0.1:${port}`;

  try {
    const imageUrl = `http://127.0.0.1:${port}/sample.jpg`;


    // 6. Circle Image
    const imageProc = new ImageStickerProcessor();
    const circleRes = await imageProc.process(imageUrl, 'circle');
    fs.writeFileSync(path.join(outDir, 'circle.webp'), circleRes.buffer);
    console.log('✓ circle.webp');

    // 6b. Image Effects
    const blurRes = await imageProc.process(imageUrl, 'blur');
    fs.writeFileSync(path.join(outDir, 'blur.webp'), blurRes.buffer);
    console.log('✓ blur.webp');

    const grayRes = await imageProc.process(imageUrl, 'grayscale');
    fs.writeFileSync(path.join(outDir, 'grayscale.webp'), grayRes.buffer);
    console.log('✓ grayscale.webp');

    const pixelRes = await imageProc.process(imageUrl, 'pixel');
    fs.writeFileSync(path.join(outDir, 'pixel.webp'), pixelRes.buffer);
    console.log('✓ pixel.webp');

    const shadowRes = await imageProc.process(imageUrl, 'shadow');
    fs.writeFileSync(path.join(outDir, 'shadow.webp'), shadowRes.buffer);
    console.log('✓ shadow.webp');

    // 7. Caption
    const { CaptionGenerator } = await import('../src/stickers/generators/caption.generator');
    const capRes = await new CaptionGenerator().process(
      { type: 'caption', mediaUrl: imageUrl, text: 'Halo Sahabat!', options: { position: 'bottom' } },
      { chatId: 'c', senderId: 's' },
    );
    fs.writeFileSync(path.join(outDir, 'caption.webp'), capRes.buffer);
    console.log('✓ caption.webp');

    // 8. RemoveBG, Subject, Outline
    const { RemoveBgGenerator } = await import('../src/stickers/generators/removebg.generator');
    const { defaultBackgroundRemovalService } = await import('../src/stickers/background-removal/service');
    const { LocalBackgroundRemovalProvider } = await import('../src/stickers/background-removal/providers/local.provider');
    defaultBackgroundRemovalService.setProvider(new LocalBackgroundRemovalProvider());
    const rmbgGen = new RemoveBgGenerator(defaultBackgroundRemovalService);

    const rmbgRes = await rmbgGen.process(
      { type: 'removebg', mediaUrl: imageUrl },
      { chatId: 'c', senderId: 's' },
    );
    fs.writeFileSync(path.join(outDir, 'removebg.webp'), rmbgRes.buffer);
    console.log('✓ removebg.webp');

    const subjRes = await rmbgGen.process(
      { type: 'subject', mediaUrl: imageUrl },
      { chatId: 'c', senderId: 's' },
    );
    fs.writeFileSync(path.join(outDir, 'subject.webp'), subjRes.buffer);
    console.log('✓ subject.webp');

    const outlRes = await rmbgGen.process(
      { type: 'outline', mediaUrl: imageUrl, options: { color: 'black' } },
      { chatId: 'c', senderId: 's' },
    );
    fs.writeFileSync(path.join(outDir, 'outline.webp'), outlRes.buffer);
    console.log('✓ outline.webp');

    // 9. Meme
    const memeProc = new MemeProcessor();
    const memeRes = await memeProc.process(imageUrl, 'TEKS ATAS | TEKS BAWAH');
    fs.writeFileSync(path.join(outDir, 'meme.webp'), memeRes.buffer);
    console.log('✓ meme.webp');

    // 10. TTP Style Presets
    const ttpGold = await ttpProc.process('GOLD VIP EDITION', 'gold');
    fs.writeFileSync(path.join(outDir, 'ttp-gold.webp'), ttpGold.buffer);
    console.log('✓ ttp-gold.webp');

    // 11. ATTP Effect Presets
    const attpFade = await attpProc.process('FADE TEXT', 'fade');
    fs.writeFileSync(path.join(outDir, 'attp-fade.webp'), attpFade.buffer);
    console.log('✓ attp-fade.webp');

    // 12. Templates
    const { TerminalTemplate, BreakingTemplate } = await import('../src/stickers/templates/builtin.templates');
    const termRes = await new TerminalTemplate().render({ text: 'npm run build' });
    fs.writeFileSync(path.join(outDir, 'template-terminal.webp'), termRes.buffer);
    console.log('✓ template-terminal.webp');

    const breakRes = await new BreakingTemplate().render({ text: 'WAHA STIKER BOT RESMI DILUNCURKAN' });
    fs.writeFileSync(path.join(outDir, 'template-breaking.webp'), breakRes.buffer);
    console.log('✓ template-breaking.webp');

    // 13. Emoji Visual QA Fixtures
    const { EmojiGenerator } = await import('../src/stickers/generators/emoji.generator');
    const emojiGen = new EmojiGenerator();

    const emojiSingle = await emojiGen.process({ type: 'emoji', text: '😂' }, { chatId: 'c', senderId: 's' });
    fs.writeFileSync(path.join(outDir, 'emoji-single.webp'), emojiSingle.buffer);
    console.log('✓ emoji-single.webp');

    const emojiFamily = await emojiGen.process({ type: 'emoji', text: '👨‍👩‍👧‍👦' }, { chatId: 'c', senderId: 's' });
    fs.writeFileSync(path.join(outDir, 'emoji-family.webp'), emojiFamily.buffer);
    console.log('✓ emoji-family.webp');

    const emojiFlag = await emojiGen.process({ type: 'emoji', text: '🇮🇩' }, { chatId: 'c', senderId: 's' });
    fs.writeFileSync(path.join(outDir, 'emoji-flag.webp'), emojiFlag.buffer);
    console.log('✓ emoji-flag.webp');

    const { BadgeGenerator } = await import('../src/stickers/generators/badge.generator');
    const badgeSticker = await new BadgeGenerator().process({ type: 'badge', text: 'ONLINE' }, { chatId: 'c', senderId: 's' });
    fs.writeFileSync(path.join(outDir, 'badge-online.webp'), badgeSticker.buffer);
    console.log('✓ badge-online.webp');
  } finally {
    env.wahaBaseUrl = savedBase;
    env.wahaApiUrl = savedApi;
    server.close();
  }

  console.log(`\nAll sample fixtures generated successfully in ${outDir}`);
}

main().catch((err) => {
  console.error('Error generating fixtures:', err);
  process.exit(1);
});
