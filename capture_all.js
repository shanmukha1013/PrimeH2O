import puppeteer from 'puppeteer-core';
import fs from 'fs';
import path from 'path';

const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

async function run() {
  console.log('Launching Chrome with puppeteer-core...');
  const browser = await puppeteer.launch({
    executablePath: chromePath,
    headless: true,
    defaultViewport: { width: 1440, height: 900 },
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu'],
  });

  const page = await browser.newPage();
  await page.goto('http://127.0.0.1:3000', { waitUntil: 'networkidle0' });
  console.log('Page loaded!');

  // Wait 1s for entrance animations
  await new Promise((r) => setTimeout(r, 1000));

  // 1. Desktop Full Page
  await page.screenshot({ path: 'shots/full_page_desktop.png', fullPage: true });
  console.log('Saved shots/full_page_desktop.png');

  // 2. Sections
  const sections = [
    { id: '#home', name: 'shots/section_hero.png' },
    { id: '#about', name: 'shots/section_about.png' },
    { id: '#products', name: 'shots/section_products.png' },
    { id: '#why-prime', name: 'shots/section_why.png' },
    { id: '#promise', name: 'shots/section_promise.png' },
    { id: '#contact', name: 'shots/section_contact.png' },
  ];

  for (const sec of sections) {
    const el = await page.$(sec.id);
    if (el) {
      await el.scrollIntoView();
      await new Promise((r) => setTimeout(r, 500));
      await el.screenshot({ path: sec.name });
      console.log(`Saved ${sec.name}`);
    }
  }

  // 3. Test Product Modal
  console.log('Testing Product Modal...');
  const exploreBtns = await page.$$('button');
  for (const btn of exploreBtns) {
    const text = await page.evaluate(el => el.textContent, btn);
    if (text && text.includes('Explore Product')) {
      await btn.click();
      await new Promise(r => setTimeout(r, 600));
      await page.screenshot({ path: 'shots/modal_product.png' });
      console.log('Saved shots/modal_product.png');
      // Close modal
      const closeBtn = await page.$('button[aria-label="Close Product Details"]');
      if (closeBtn) await closeBtn.click();
      await new Promise(r => setTimeout(r, 400));
      break;
    }
  }

  // 4. Test Brand Story Modal ("Discover PRIME")
  console.log('Testing Brand Story Modal...');
  await page.evaluate(() => window.scrollTo(0, 0));
  await new Promise(r => setTimeout(r, 500));
  const discoverBtn = await page.evaluateHandle(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    return btns.find(b => b.textContent.includes('Discover PRIME'));
  });
  if (discoverBtn) {
    await discoverBtn.click();
    await new Promise(r => setTimeout(r, 600));
    await page.screenshot({ path: 'shots/modal_brand_story.png' });
    console.log('Saved shots/modal_brand_story.png');
    const closeStory = await page.$('button[aria-label="Close Story Dialog"]');
    if (closeStory) await closeStory.click();
    await new Promise(r => setTimeout(r, 400));
  }

  // 5. Mobile Viewport (iPhone 14 style: 390 x 844)
  console.log('Testing Mobile Viewport...');
  await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
  await page.goto('http://127.0.0.1:3000', { waitUntil: 'networkidle0' });
  await new Promise(r => setTimeout(r, 800));
  await page.screenshot({ path: 'shots/mobile_hero.png' });
  console.log('Saved shots/mobile_hero.png');

  // Open mobile menu
  const menuBtn = await page.$('button[aria-label="Open Navigation Menu"]');
  if (menuBtn) {
    await menuBtn.click();
    await new Promise(r => setTimeout(r, 500));
    await page.screenshot({ path: 'shots/mobile_menu_open.png' });
    console.log('Saved shots/mobile_menu_open.png');
  }

  await browser.close();
  console.log('All visual screenshots successfully captured!');
}

run().catch(err => {
  console.error('Error running capture:', err);
  process.exit(1);
});
