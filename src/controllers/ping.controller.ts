import {authenticate} from '@loopback/authentication';
import {AUTHENTICATION_STRATEGY} from '../util/constants';
// import {SecurityBindings, UserProfile} from '@loopback/security';
import {inject} from '@loopback/core';
import {
  Request,
  RestBindings,
  get,
  response,
  ResponseObject,
} from '@loopback/rest';

const PING_RESPONSE: ResponseObject = {
  description: 'Ping Response',
  content: {
    'application/json': {
      schema: {
        type: 'object',
        title: 'PingResponse',
        properties: {
          greeting: {type: 'string'},
          date: {type: 'string'},
          url: {type: 'string'},
          headers: {
            type: 'object',
            properties: {
              'Content-Type': {type: 'string'},
            },
            additionalProperties: true,
          },
        },
      },
    },
  },
};

@authenticate(AUTHENTICATION_STRATEGY)
export class PingController {
  constructor(
    // @inject(SecurityBindings.USER) private userProfile: UserProfile,
    @inject(RestBindings.Http.REQUEST) 
    private req: Request
  ) {}
  @get('/ping')
  @response(200, PING_RESPONSE)
  ping(): object {
    return {
      greeting: 'Hello from LoopBack',
      date: new Date(),
      url: this.req.url,
      headers: Object.assign({}, this.req.headers),
    };
  }
}
