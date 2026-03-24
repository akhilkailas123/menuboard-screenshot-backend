import {inject, injectable, BindingScope} from '@loopback/core';
import {DeviceRepository} from '../repositories';
import {Device} from '../models';
import puppeteer, {Page} from 'puppeteer';
import fs from 'fs';
import path from 'path';
import {HttpErrors} from '@loopback/rest';

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
      lastUpdated: now,
    });

    const screenshots = await this.takeScreenshot(
      device.url,
      device.deviceResolution,
      device.deviceId,
      device.deviceName,
    );

    await this.deviceRepository.updateById(device.deviceId, {
      screenshots,
      lastUpdated: now,
    });

    return this.deviceRepository.findById(device.deviceId);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(res => setTimeout(res, ms));
  }

  private ensureDir(dir: string): void {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir);
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
    url: string,
    resolution: string,
    deviceId: string,
    deviceName: string,
  ): Promise<string[]> {
    const [width, height] = resolution.split('x').map(Number);

    const browser = await puppeteer.launch({
      headless: true,
      defaultViewport: {width, height},
    });

    const page: Page = await browser.newPage();
    page.setDefaultNavigationTimeout(60000);

    await page.goto(url, {waitUntil: 'domcontentloaded'});

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

    const filePath = path.join(dir, `${deviceId}_${safeName}.png`);

    await page.screenshot({
      path: filePath,
      fullPage: true,
    });

    console.log('Saved screenshot:', filePath);
    await browser.close();
    return [filePath];
  }

  async getAllDevices(): Promise<Device[]> {
    return this.deviceRepository.find();
  }

  async getDeviceByDeviceId(deviceId: string): Promise<Device> {
    const device = await this.deviceRepository.findById(deviceId);

    if (!device) {
      throw new Error(`Device with deviceId ${deviceId} not found`);
    }

    return device;
  }

  async syncDevice(deviceId: string): Promise<Device> {
    const device = await this.deviceRepository.findById(deviceId);

    if (!device) {
      throw new HttpErrors.NotFound(
        `Device with deviceId ${deviceId} not found`,
      );
    }

    if (device.screenshots && device.screenshots.length) {
      for (const file of device.screenshots) {
        if (fs.existsSync(file)) {
          fs.unlinkSync(file);
        }
      }
    }

    const screenshots = await this.takeScreenshot(
      device.url,
      device.deviceResolution,
      device.deviceId,
      device.deviceName,
    );

    const now = new Date().toISOString();

    await this.deviceRepository.updateById(device.deviceId, {
      screenshots,
      lastUpdated: now,
    });

    return this.deviceRepository.findById(device.deviceId);
  }

  async syncAllDevices(): Promise<Device[]> {
    const devices = await this.deviceRepository.find();

    const updatedDevices: Device[] = [];

    for (const device of devices) {
      try {
        if (device.screenshots && device.screenshots.length) {
          for (const file of device.screenshots) {
            if (fs.existsSync(file)) {
              fs.unlinkSync(file);
            }
          }
        }

        const screenshots = await this.takeScreenshot(
          device.url,
          device.deviceResolution,
          device.deviceId,
          device.deviceName,
        );

        const now = new Date().toISOString();

        await this.deviceRepository.updateById(device.deviceId, {
          screenshots,
          lastUpdated: now,
        });

        const updated = await this.deviceRepository.findById(device.deviceId);
        updatedDevices.push(updated);
      } catch (err) {
        console.error(`Failed syncing device ${device.deviceId}`, err);
      }
    }

    return updatedDevices;
  }

  async updateDevice(
    deviceId: string,
    devicePatch: Partial<Omit<Device, 'id' | 'deviceId' | 'screenshots' | 'lastUpdated'>>,
  ): Promise<Device> {
    const existing = await this.deviceRepository.findById(deviceId);
    if (!existing) {
      throw new HttpErrors.NotFound(`Device with deviceId ${deviceId} not found`);
    }

    const now = new Date().toISOString();

    const resolutionChanged =
      devicePatch.deviceResolution !== undefined &&
      devicePatch.deviceResolution !== existing.deviceResolution;
    const urlChanged =
      devicePatch.url !== undefined && devicePatch.url !== existing.url;

    await this.deviceRepository.updateById(deviceId, {
      ...devicePatch,
      lastUpdated: now,
    });

    if (urlChanged || resolutionChanged) {
      if (existing.screenshots && existing.screenshots.length) {
        for (const file of existing.screenshots) {
          if (fs.existsSync(file)) {
            fs.unlinkSync(file);
          }
        }
      }
      const updatedDevice = await this.deviceRepository.findById(deviceId);
      const screenshots = await this.takeScreenshot(
        updatedDevice.url,
        updatedDevice.deviceResolution,
        updatedDevice.deviceId,
        updatedDevice.deviceName,
      );
      await this.deviceRepository.updateById(deviceId, {screenshots, lastUpdated: now});
    }

    return this.deviceRepository.findById(deviceId);
  }

  async deleteDevice(deviceId: string): Promise<void> {
    const device = await this.deviceRepository.findById(deviceId);
    if (!device) {
      throw new HttpErrors.NotFound(`Device with deviceId ${deviceId} not found`);
    }

    if (device.screenshots && device.screenshots.length) {
      for (const file of device.screenshots) {
        if (fs.existsSync(file)) {
          fs.unlinkSync(file);
        }
      }
    }

    await this.deviceRepository.deleteById(deviceId);
  }
}
