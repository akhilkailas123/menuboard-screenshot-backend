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

    await page.addStyleTag({
      content: `
      * {
        animation: none !important;
        transition: none !important;
      }
    `,
    });

    const dir = path.resolve(process.cwd(), 'screenshots');
    this.ensureDir(dir);

    const safeName = deviceName.replace(/\s+/g, '_');

    await page.evaluate(() => {
      window.scrollTo(0, document.body.scrollHeight);
    });

    const ext = imageFormat === 'jpg' ? 'jpeg' : 'png';
    const filePath = path.join(dir, `${accountId}_${safeName}.${imageFormat}`);

    await page.screenshot({
      path: filePath,
      fullPage: true,
      type: ext as 'png' | 'jpeg',
    });

    console.log('Saved screenshot:', filePath);
    await browser.close();
    return [filePath];
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
