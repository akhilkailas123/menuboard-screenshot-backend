import {inject} from '@loopback/core';
import {del, get, param, patch, post, requestBody, response} from '@loopback/rest';
import {Device} from '../models';
import {DeviceService} from '../services';
import {authenticate} from '@loopback/authentication';
import {AUTHENTICATION_STRATEGY} from '../util/constants';

// @authenticate(AUTHENTICATION_STRATEGY)
export class DeviceController {
  constructor(
    @inject('services.DeviceService')
    private deviceService: DeviceService,
  ) {}

  @post('/devices')
  @response(200, {
    description: 'Create device and generate screenshots',
    content: {
      'application/json': {
        schema: {type: 'object'},
      },
    },
  })
  async create(
    @requestBody({
      content: {
        'application/json': {
          schema: {
            type: 'object',
            required: [
              'accountId',
              'deviceEDUID',
              'contentUrl',
              'displayGroupId',
              'accountName',
              'deviceName',
              'displayGroup',
              'macAddress',
              'syncInterval',
              'imageFormat',
              'resolution',
            ],
            properties: {
              accountId: {type: 'string'},
              deviceEDUID: {type: 'string'},
              contentUrl: {type: 'string'},
              displayGroupId: {type: 'string'},
              accountName: {type: 'string'},
              deviceName: {type: 'string'},
              displayGroup: {type: 'string'},
              macAddress: {type: 'string'},
              syncInterval: {
                type: 'string',
                enum: ['30s', '1m', '5m', '10m', '30m', '1h'],
              },
              imageFormat: {
                type: 'string',
                enum: ['png', 'jpg'],
              },
              resolution: {
                type: 'string',
                enum: ['1080p', '4k'],
              },
            },
          },
        },
      },
    })
    device: Omit<Device, 'screenshots' | 'lastSync' | 'status'>,
  ): Promise<Device> {
    return this.deviceService.createDevice(device as Device);
  }

  @get('/devices')
  @response(200, {
    description: 'Get all devices',
    content: {
      'application/json': {
        schema: {
          type: 'array',
          items: {'x-ts-type': Device},
        },
      },
    },
  })
  async findAll(): Promise<Device[]> {
    return this.deviceService.getAllDevices();
  }

  @get('/devices/{accountId}')
  @response(200, {
    description: 'Get device by accountId',
    content: {
      'application/json': {
        schema: {'x-ts-type': Device},
      },
    },
  })
  async findByAccountId(
    @param.path.string('accountId') accountId: string,
  ): Promise<Device> {
    return this.deviceService.getDeviceByAccountId(accountId);
  }

  @post('/devices/sync/{accountId}')
  @response(200, {
    description: 'Sync device and regenerate screenshots',
    content: {
      'application/json': {
        schema: {'x-ts-type': Device},
      },
    },
  })
  async syncDevice(
    @param.path.string('accountId') accountId: string,
  ): Promise<Device> {
    return this.deviceService.syncDevice(accountId);
  }

  @post('/devices/sync-all')
  @response(200, {
    description: 'Sync all devices and regenerate screenshots',
    content: {
      'application/json': {
        schema: {
          type: 'array',
          items: {'x-ts-type': Device},
        },
      },
    },
  })
  async syncAll(): Promise<Device[]> {
    return this.deviceService.syncAllDevices();
  }

  @patch('/devices/{accountId}')
  @response(200, {
    description: 'Update device fields (partial)',
    content: {
      'application/json': {
        schema: {'x-ts-type': Device},
      },
    },
  })
  async updateDevice(
    @param.path.string('accountId') accountId: string,
    @requestBody({
      content: {
        'application/json': {
          schema: {
            type: 'object',
            properties: {
              deviceEDUID: {type: 'string'},
              contentUrl: {type: 'string'},
              displayGroupId: {type: 'string'},
              accountName: {type: 'string'},
              deviceName: {type: 'string'},
              displayGroup: {type: 'string'},
              macAddress: {type: 'string'},
              syncInterval: {
                type: 'string',
                enum: ['30s', '1m', '5m', '10m', '30m', '1h'],
              },
              imageFormat: {
                type: 'string',
                enum: ['png', 'jpg'],
              },
              resolution: {
                type: 'string',
                enum: ['1080p', '4k'],
              },
            },
          },
        },
      },
    })
    devicePatch: Partial<
      Omit<Device, 'accountId' | 'screenshots' | 'lastSync' | 'status'>
    >,
  ): Promise<Device> {
    return this.deviceService.updateDevice(accountId, devicePatch);
  }

  @del('/devices/{accountId}')
  @response(204, {
    description: 'Device deleted successfully',
  })
  async deleteDevice(
    @param.path.string('accountId') accountId: string,
  ): Promise<void> {
    return this.deviceService.deleteDevice(accountId);
  }
}
