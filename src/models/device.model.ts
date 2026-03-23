import {Entity, model, property} from '@loopback/repository';

@model()
export class Device extends Entity {
  @property({
    type: 'number',
    id: true,
    generated: true,
  })
  id?: number;

  @property({
    type: 'string',
    required: true,
  })
  deviceId: string;

  @property({
    type: 'string',
    required: true,
  })
  deviceName: string;

  @property({
    type: 'string',
    required: true,
  })
  deviceResolution: string;

  @property({
    type: 'string',
    required: true,
  })
  url: string;

  @property({
    type: 'array',
    itemType: 'string',
  })
  screenshots?: string[];

  constructor(data?: Partial<Device>) {
    super(data);
  }
}

export interface DeviceRelations {}

export type DeviceWithRelations = Device & DeviceRelations;
