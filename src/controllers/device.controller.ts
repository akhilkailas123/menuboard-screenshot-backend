import {inject} from '@loopback/core';
import {
  get,
  param,
  post,
  requestBody,
  response,
  RestBindings,
} from '@loopback/rest';
import {Device} from '../models';
import {DeviceService} from '../services';
import {authenticate} from '@loopback/authentication';
import {AUTHENTICATION_STRATEGY} from '../util/constants';
// import {SecurityBindings, UserProfile} from '@loopback/security';

@authenticate(AUTHENTICATION_STRATEGY)
export class DeviceController {
  constructor(
    // @inject(SecurityBindings.USER) private userProfile: UserProfile,
    // @inject(RestBindings.Http.REQUEST)
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
  ): Promise<Device> {
    return this.deviceService.createDevice(device);
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

  @get('/devices/{deviceId}')
  @response(200, {
    description: 'Get device by deviceId',
    content: {
      'application/json': {
        schema: {'x-ts-type': Device},
      },
    },
  })
  async findByDeviceId(
    @param.path.string('deviceId') deviceId: string,
  ): Promise<Device> {
    return this.deviceService.getDeviceByDeviceId(deviceId);
  }

  @post('/devices/sync/{deviceId}')
  @response(200, {
    description: 'Sync device and regenerate screenshots',
    content: {
      'application/json': {
        schema: {'x-ts-type': Device},
      },
    },
  })
  async syncDevice(
    @param.path.string('deviceId') deviceId: string,
  ): Promise<Device> {
    return this.deviceService.syncDevice(deviceId);
  }
}
