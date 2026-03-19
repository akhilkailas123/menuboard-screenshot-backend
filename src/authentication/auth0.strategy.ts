import {AuthenticationStrategy} from '@loopback/authentication';
import {HttpErrors, Request} from '@loopback/rest';
import {securityId, UserProfile} from '@loopback/security';
import jwksRsa from 'jwks-rsa';
import passport from 'passport';
import {
  ExtractJwt,
  Strategy as JwtStrategy,
  VerifiedCallback,
} from 'passport-jwt';
import { Auth0JwtPayload } from './auth0-payload';
import { AUTHENTICATION_STRATEGY } from '../util/constants';
export class Auth0Strategy implements AuthenticationStrategy {
  name = AUTHENTICATION_STRATEGY;

  async authenticate(request: Request): Promise<UserProfile> {
    return new Promise((resolve, reject) => {
      const apiKey = request.query['api_key'];
      const secretApi = process.env.CUSTOM_API_KEY ?? 'test';
      if (apiKey && apiKey === secretApi) {
        const user: UserProfile = {
          [securityId]: 'api_key_user',
          name: 'Spectrio API Key User',
          email: 'api-key-user@spectrio.com',
        };
        resolve(user);
        return;
      }

      const strategy = new JwtStrategy(
        {
          secretOrKeyProvider: jwksRsa.passportJwtSecret({
            cache: true,
            rateLimit: true,
            jwksRequestsPerMinute: 5,
            jwksUri: `${process.env.AUTH0_ISSUER}.well-known/jwks.json`,
          }),
          jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
          audience: `${process.env.AUTH0_AUDIENCE}`,
          issuer: `${process.env.AUTH0_ISSUER}`,
          algorithms: ['RS256'],
        },
        (payload: Auth0JwtPayload, done: VerifiedCallback) => {
          if (!payload) {
            return done(
              new HttpErrors.Unauthorized(
                'JWT payload is missing or malformed',
              ),
              false,
            );
          }
          const {organizations = []} = payload;
          const expectedOrgId = process.env.IR_ACCOUNT_ID;

          const hasMatchingOrg = organizations.some(
            org => org.org_id === expectedOrgId,
          );

          if (!hasMatchingOrg) {
            return done(
              new HttpErrors.Unauthorized(
                `Expected organization ID '${expectedOrgId}' not found in JWT token`,
              ),
              false,
            );
          }
          const user: UserProfile = {
            [securityId]: payload.sub,
            name: payload.name,
            email: payload.email,
          };
          done(null, user);
        },
      );

      passport.use('jwt', strategy);

      passport.authenticate(
        'jwt',
        {session: false},
        (err: unknown, user: UserProfile | false) => {
          if (err || !user) {
            reject(
              new HttpErrors.Unauthorized(
                err ? err.toString() : 'Unauthorized',
              ),
            );
          } else {
            resolve(user);
          }
        },
      )(request);
    });
  }
}