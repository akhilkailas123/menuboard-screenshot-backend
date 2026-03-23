import {inject, injectable, BindingScope} from '@loopback/core';
import {DeviceRepository} from '../repositories';
import {Device} from '../models';
import puppeteer, {Page} from 'puppeteer';
import fs from 'fs';
import path from 'path';

@injectable({scope: BindingScope.TRANSIENT})
export class DeviceService {
  constructor(
    @inject('repositories.DeviceRepository')
    private deviceRepository: DeviceRepository,
  ) {}

  async createDevice(device: Omit<Device, 'id'>): Promise<any> {
    const created = await this.deviceRepository.create(device);
    const screenshots = await this.takeScreenshot(
      device.url,
      device.deviceResolution,
      device.deviceId,
      device.deviceName,
    );
    return {
      ...created,
      screenshots,
    };
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(res => setTimeout(res, ms));
  }

  private ensureDir(dir: string): void {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir);
    }
  }

  private getTimestamp(): string {
    return new Date().toISOString().replace(/[:.]/g, '-');
  }

  private async waitForFullLoad(page: Page): Promise<void> {
    await page.waitForSelector('body');
    await page.evaluate(async () => {
      await document.fonts.ready;
    });
    try {
      await page.waitForFunction(
        () => {
          const loaders = document.querySelectorAll(
            '.loading, .loader, .spinner',
          );
          return loaders.length === 0;
        },
        {timeout: 10000},
      );
    } catch {
      console.log('No loader detected or timeout reached');
    }
    await this.sleep(2000);
  }

  private async takeScreenshot(
    url: string,
    resolution: string,
    deviceId: string,
    deviceName: string,
  ): Promise<string[]> {
    const [width, height] = resolution.split('x').map(Number);

    console.log('Launching browser...');
    const browser = await puppeteer.launch({
      headless: true,
      defaultViewport: {
        width,
        height,
      },
    });

    const page: Page = await browser.newPage();
    page.setDefaultNavigationTimeout(60000);

    console.log(`Opening: ${url}`);
    await page.goto(url, {
      waitUntil: 'domcontentloaded',
    });

    console.log('Waiting for full page load...');
    await this.waitForFullLoad(page);
    await page.addStyleTag({
      content: `
        * {
          animation: none !important;
          transition: none !important;
        }
      `,
    });

    const dir = 'screenshots';
    this.ensureDir(dir);

    const safeName = deviceName.replace(/\s+/g, '_');
    await page.evaluate(() => {
      window.scrollTo(0, document.body.scrollHeight);
    });

    const file1 = path.join(
      dir,
      `${deviceId}_${safeName}_${this.getTimestamp()}_initial.png`,
    );
    await page.screenshot({
      path: file1,
      fullPage: true,
    });
    console.log('Saved first screenshot:', file1);
    console.log('Waiting 15 seconds...');
    await this.sleep(15000);
    await page.evaluate(() => {
      window.scrollTo(0, document.body.scrollHeight);
    });
    const file2 = path.join(
      dir,
      `${deviceId}_${safeName}_${this.getTimestamp()}_after_15s.png`,
    );
    await page.screenshot({
      path: file2,
      fullPage: true,
    });
    console.log('Saved second screenshot:', file2);

    await browser.close();
    console.log('Done.');

    return [file1, file2];
  }
}
