import {inject, injectable, BindingScope} from '@loopback/core';
import {DeviceRepository} from '../repositories';
import {Device, ImageFormat, Resolution} from '../models';
import puppeteer, {Page} from 'puppeteer';
import fs from 'fs';
import path from 'path';
import {HttpErrors} from '@loopback/rest';

const RESOLUTION_MAP: Record<Resolution, {width: number; height: number}> = {
  '1080p': {width: 1920, height: 1080},
  '4k': {width: 3840, height: 2160},
};

@injectable({scope: BindingScope.TRANSIENT})
export class DeviceService {
  constructor(
    @inject('repositories.DeviceRepository')
    private deviceRepository: DeviceRepository,
  ) {}

  async createDevice(device: Device): Promise<Device> {
    const now = new Date().toISOString();
    const created = await this.deviceRepository.create({
      ...device,
      status: 'syncing',
      lastSync: now,
    });
    try {
      const screenshots = await this.takeScreenshot(
        device.contentUrl,
        device.resolution,
        device.accountId,
        device.deviceName,
        device.imageFormat,
      );
      await this.deviceRepository.updateById(device.accountId, {
        screenshots,
        status: 'active',
        lastSync: now,
      });
    } catch (err) {
      await this.deviceRepository.updateById(device.accountId, {
        status: 'error',
        lastSync: now,
      });
      throw err;
    }
    return this.deviceRepository.findById(device.accountId);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(res => setTimeout(res, ms));
  }

  private ensureDir(dir: string): void {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, {recursive: true});
    }
  }

  private async waitForFullLoad(page: Page): Promise<void> {
    await page.waitForSelector('body');
    await page.evaluate(async () => {
      await (document as any).fonts.ready;
    });
    try {
      await page.waitForSelector('.loading', {timeout: 10000});
      await page.waitForFunction(() => !document.querySelector('.loading'), {
        timeout: 30000,
      });
      console.log('Loader disappeared, page fully loaded');
    } catch (err) {
      console.log('Loader not found or timeout, continuing...');
    }
    await this.sleep(2000);
  }

  private async takeScreenshot(
    contentUrl: string,
    resolution: Resolution,
    accountId: string,
    deviceName: string,
    imageFormat: ImageFormat,
  ): Promise<string[]> {
    const {width, height} = RESOLUTION_MAP[resolution];
    const browser = await puppeteer.launch({
      headless: true,
      defaultViewport: {width, height},
    });
    const page: Page = await browser.newPage();
    page.setDefaultNavigationTimeout(60000);
    await page.goto(contentUrl, {waitUntil: 'domcontentloaded'});
    await this.waitForFullLoad(page);
    // NOTE: Do NOT inject animation:none globally here — it would freeze the
    // player's rotation logic and prevent tokens from ever changing.
    // Animations are frozen only at the instant we take each screenshot,
    // then immediately restored so the playlist can keep advancing.

    const dir = path.resolve(process.cwd(), 'screenshots');
    this.ensureDir(dir);
    const safeName = deviceName.replace(/\s+/g, '_');
    const ext = imageFormat === 'jpg' ? 'jpeg' : 'png';
    const filePaths: string[] = [];

    // Freeze animations just long enough to take a clean screenshot,
    // then restore them so the player can continue rotating.
    const captureStableScreenshot = async (filePath: string): Promise<void> => {
      // Inject freeze style
      await page.evaluate(() => {
        const style = document.createElement('style');
        style.id = '__screenshot_freeze__';
        style.textContent = '* { animation-play-state: paused !important; transition: none !important; }';
        document.head.appendChild(style);
      });
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await page.screenshot({
        path: filePath,
        fullPage: true,
        type: ext as 'png' | 'jpeg',
      });
      // Remove freeze style so rotation can continue
      await page.evaluate(() => {
        const el = document.getElementById('__screenshot_freeze__');
        if (el) el.remove();
      });
    };

    // Helper: read both token AND assetid from the current showed-app.
    // - token  → changes every rotation (always a new UUID, even for same content)
    // - assetid → stays the same for the same slide content
    // We use assetid for deduplication and token only to detect a slide change.
    const getShowedSlide = (): Promise<{token: string; assetId: string} | null> =>
      page.evaluate(() => {
        const el = document.querySelector('.player-app.showed-app');
        if (!el) return null;
        const token = el.getAttribute('data-apptoken') ?? '';
        const assetId = el.getAttribute('data-assetid') ?? '';
        return token ? {token, assetId} : null;
      });

    // ── Step 1: capture first slide immediately ────────────────────────────
    const firstSlide = await getShowedSlide();
    console.log(
      `[Screenshot] First slide — token: ${firstSlide?.token ?? 'none'}, assetId: ${firstSlide?.assetId ?? 'none (static page)'}`,
    );

    const firstFilePath = path.join(
      dir,
      `${accountId}_${safeName}_slide_1.${imageFormat}`,
    );
    await captureStableScreenshot(firstFilePath);
    console.log('[Screenshot] Saved:', firstFilePath);
    filePaths.push(firstFilePath);

    // No player tokens → fully static page, nothing more to do
    if (!firstSlide) {
      await browser.close();
      return filePaths;
    }

    // ── Step 2: poll for new slides, deduplicated by assetId ──────────────
    // Token changes every rotation even for the same asset, so we MUST use
    // assetId to know whether content is actually different.
    const seenAssetIds = new Set<string>([firstSlide.assetId]);
    const firstAssetId = firstSlide.assetId;
    let lastSeenToken = firstSlide.token; // track token to detect any change
    let duplicateStreak = 0; // consecutive rotations all pointing to already-seen assets

    const MAX_WAIT_MS = 120_000;    // up to 2 min to observe a full rotation
    const POLL_INTERVAL_MS = 1_000;
    const startTime = Date.now();

    console.log('[Screenshot] Watching for slide rotation…');

    while (Date.now() - startTime < MAX_WAIT_MS) {
      await this.sleep(POLL_INTERVAL_MS);

      const current = await getShowedSlide();

      // Mid-transition — no showed-app visible yet
      if (!current) continue;

      // Token unchanged → same slide still showing, keep waiting
      if (current.token === lastSeenToken) continue;

      // Token changed — a new slide has rotated in
      lastSeenToken = current.token;
      console.log(
        `[Screenshot] Slide changed — token: ${current.token}, assetId: ${current.assetId}`,
      );

      // Cycled back to the first asset → full playlist rotation complete
      if (current.assetId === firstAssetId && seenAssetIds.size > 1) {
        console.log('[Screenshot] Full rotation complete (back to first asset), stopping.');
        break;
      }

      // New asset we haven't seen yet → capture it
      if (!seenAssetIds.has(current.assetId)) {
        seenAssetIds.add(current.assetId);
        duplicateStreak = 0; // reset — we found a genuinely new slide

        const slideIndex = seenAssetIds.size; // 2, 3, 4 …
        console.log(`[Screenshot] New unique slide #${slideIndex} (assetId: ${current.assetId})`);

        // Wait for the slide iframe content to finish rendering
        await this.sleep(1500);

        const slideFilePath = path.join(
          dir,
          `${accountId}_${safeName}_slide_${slideIndex}.${imageFormat}`,
        );
        await captureStableScreenshot(slideFilePath);
        console.log('[Screenshot] Saved:', slideFilePath);
        filePaths.push(slideFilePath);
      } else {
        duplicateStreak++;
        console.log(
          `[Screenshot] Skipping duplicate assetId: ${current.assetId} (streak: ${duplicateStreak})`,
        );
        // 3 consecutive rotations all pointing to already-seen assets →
        // the full playlist has cycled, stop early instead of waiting 2 min.
        if (duplicateStreak >= 3) {
          console.log('[Screenshot] Full rotation confirmed (3 consecutive duplicates), stopping.');
          break;
        }
      }
    }

    if (seenAssetIds.size === 1) {
      console.log('[Screenshot] No rotation detected — single-slide playlist.');
    } else {
      console.log(
        `[Screenshot] Captured ${filePaths.length} unique slides out of ${seenAssetIds.size} assets.`,
      );
    }

    await browser.close();
    return filePaths;
  }

  async getAllDevices(): Promise<Device[]> {
    return this.deviceRepository.find();
  }

  async getDeviceByAccountId(accountId: string): Promise<Device> {
    const device = await this.deviceRepository.findById(accountId);
    if (!device) {
      throw new HttpErrors.NotFound(`Device with accountId ${accountId} not found`);
    }
    return device;
  }

  async syncDevice(accountId: string): Promise<Device> {
    const device = await this.deviceRepository.findById(accountId);
    if (!device) {
      throw new HttpErrors.NotFound(`Device with accountId ${accountId} not found`);
    }
    await this.deviceRepository.updateById(accountId, {status: 'syncing'});
    try {
      if (device.screenshots && device.screenshots.length) {
        for (const file of device.screenshots) {
          if (fs.existsSync(file)) {
            fs.unlinkSync(file);
          }
        }
      }
      const screenshots = await this.takeScreenshot(
        device.contentUrl,
        device.resolution,
        device.accountId,
        device.deviceName,
        device.imageFormat,
      );
      const now = new Date().toISOString();
      await this.deviceRepository.updateById(device.accountId, {
        screenshots,
        status: 'active',
        lastSync: now,
      });
    } catch (err) {
      await this.deviceRepository.updateById(accountId, {status: 'error'});
      throw err;
    }
    return this.deviceRepository.findById(device.accountId);
  }

  async syncAllDevices(): Promise<Device[]> {
    const devices = await this.deviceRepository.find();
    const updatedDevices: Device[] = [];
    for (const device of devices) {
      try {
        await this.deviceRepository.updateById(device.accountId, {status: 'syncing'});
        if (device.screenshots && device.screenshots.length) {
          for (const file of device.screenshots) {
            if (fs.existsSync(file)) {
              fs.unlinkSync(file);
            }
          }
        }
        const screenshots = await this.takeScreenshot(
          device.contentUrl,
          device.resolution,
          device.accountId,
          device.deviceName,
          device.imageFormat,
        );
        const now = new Date().toISOString();
        await this.deviceRepository.updateById(device.accountId, {
          screenshots,
          status: 'active',
          lastSync: now,
        });
        const updated = await this.deviceRepository.findById(device.accountId);
        updatedDevices.push(updated);
      } catch (err) {
        console.error(`Failed syncing device ${device.accountId}`, err);
        await this.deviceRepository.updateById(device.accountId, {status: 'error'});
      }
    }
    return updatedDevices;
  }

  async updateDevice(
    accountId: string,
    devicePatch: Partial<
      Omit<Device, 'accountId' | 'screenshots' | 'lastSync' | 'status'>
    >,
  ): Promise<Device> {
    const existing = await this.deviceRepository.findById(accountId);
    if (!existing) {
      throw new HttpErrors.NotFound(`Device with accountId ${accountId} not found`);
    }
    const now = new Date().toISOString();
    const resolutionChanged =
      devicePatch.resolution !== undefined &&
      devicePatch.resolution !== existing.resolution;
    const urlChanged =
      devicePatch.contentUrl !== undefined &&
      devicePatch.contentUrl !== existing.contentUrl;
    const formatChanged =
      devicePatch.imageFormat !== undefined &&
      devicePatch.imageFormat !== existing.imageFormat;

    await this.deviceRepository.updateById(accountId, {
      ...devicePatch,
      lastSync: now,
    });

    if (urlChanged || resolutionChanged || formatChanged) {
      await this.deviceRepository.updateById(accountId, {status: 'syncing'});
      try {
        if (existing.screenshots && existing.screenshots.length) {
          for (const file of existing.screenshots) {
            if (fs.existsSync(file)) {
              fs.unlinkSync(file);
            }
          }
        }
        const updatedDevice = await this.deviceRepository.findById(accountId);
        const screenshots = await this.takeScreenshot(
          updatedDevice.contentUrl,
          updatedDevice.resolution,
          updatedDevice.accountId,
          updatedDevice.deviceName,
          updatedDevice.imageFormat,
        );
        await this.deviceRepository.updateById(accountId, {
          screenshots,
          status: 'active',
          lastSync: now,
        });
      } catch (err) {
        await this.deviceRepository.updateById(accountId, {status: 'error'});
        throw err;
      }
    }
    return this.deviceRepository.findById(accountId);
  }

  async deleteDevice(accountId: string): Promise<void> {
    const device = await this.deviceRepository.findById(accountId);
    if (!device) {
      throw new HttpErrors.NotFound(`Device with accountId ${accountId} not found`);
    }
    if (device.screenshots && device.screenshots.length) {
      for (const file of device.screenshots) {
        if (fs.existsSync(file)) {
          fs.unlinkSync(file);
        }
      }
    }
    await this.deviceRepository.deleteById(accountId);
  }
}
