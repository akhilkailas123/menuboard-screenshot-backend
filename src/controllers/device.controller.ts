import {inject} from '@loopback/core';
import {post, requestBody, response} from '@loopback/rest';
import {Device} from '../models';
import {DeviceService} from '../services';

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
            required: ['deviceId', 'deviceName', 'deviceResolution', 'url'],
            properties: {
              deviceId: {type: 'string'},
              deviceName: {type: 'string'},
              deviceResolution: {type: 'string'},
              url: {type: 'string'},
            },
          },
        },
      },
    })
    device: Omit<Device, 'id'>,
  ): Promise<any> {
    return this.deviceService.createDevice(device);
  }
}
