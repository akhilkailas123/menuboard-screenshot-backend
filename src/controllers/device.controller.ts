import {inject} from '@loopback/core';
import {
  post,
  requestBody,
  response,
} from '@loopback/rest';
import {Device} from '../models';
import {DeviceRepository} from '../repositories';

export class DeviceController {
  constructor(
    @inject('repositories.DeviceRepository')
    private deviceRepository: DeviceRepository,
  ) {}

  @post('/devices')
  @response(200, {
    description: 'Device model instance',
    content: {
      'application/json': {
        schema: {
          'x-ts-type': Device,
        },
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
  ): Promise<Device> {
    return this.deviceRepository.create(device);
  }
}
