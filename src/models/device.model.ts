import {Entity, model, property} from '@loopback/repository';

export type Resolution = '1080p' | '4k';
export type ImageFormat = 'png' | 'jpg';
export type SyncInterval = '30s' | '1m' | '5m' | '10m' | '30m' | '1h';
export type DeviceStatus = 'active' | 'syncing' | 'error';

@model()
export class Device extends Entity {
  @property({
    type: 'string',
    id: true,
    required: true,
  })
  accountId: string;

  @property({
    type: 'string',
    required: true,
  })
  deviceEDUID: string;

  @property({
    type: 'string',
    required: true,
  })
  contentUrl: string;

  @property({
    type: 'string',
    required: true,
  })
  displayGroupId: string;

  @property({
    type: 'string',
    required: true,
  })
  accountName: string;

  @property({
    type: 'string',
    required: true,
  })
  deviceName: string;

  @property({
    type: 'string',
    required: true,
  })
  displayGroup: string;

  @property({
    type: 'string',
    required: true,
  })
  macAddress: string;

  @property({
    type: 'string',
    required: true,
    jsonSchema: {
      enum: ['30s', '1m', '5m', '10m', '30m', '1h'],
    },
  })
  syncInterval: SyncInterval;

  @property({
    type: 'string',
    required: true,
    jsonSchema: {
      enum: ['png', 'jpg'],
    },
  })
  imageFormat: ImageFormat;

  @property({
    type: 'string',
    required: true,
    jsonSchema: {
      enum: ['1080p', '4k'],
    },
  })
  resolution: Resolution;

  @property({
    type: 'string',
    default: 'active',
    jsonSchema: {
      enum: ['active', 'syncing', 'error'],
    },
  })
  status?: DeviceStatus;

  @property({
    type: 'array',
    itemType: 'string',
  })
  screenshots?: string[];

  @property({
    type: 'date',
  })
  lastSync?: string;

  constructor(data?: Partial<Device>) {
    super(data);
  }
}

export interface DeviceRelations {}

export type DeviceWithRelations = Device & DeviceRelations;
