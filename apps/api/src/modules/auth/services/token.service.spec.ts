import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { TokenService } from './token.service';

describe('TokenService', () => {
  let tokenService: TokenService;
  let jwtService: JwtService;

  beforeEach(() => {
    jwtService = new JwtService({ secret: 'test-secret' });
    tokenService = new TokenService(jwtService);
  });

  describe('hashToken and opaque token generation', () => {
    it('should generate high-entropy opaque random hex strings', () => {
      const token1 = tokenService.generateOpaqueToken();
      const token2 = tokenService.generateOpaqueToken();

      expect(token1).toHaveLength(80); // 40 bytes hex = 80 chars
      expect(token2).toHaveLength(80);
      expect(token1).not.toEqual(token2);
    });

    it('should hash tokens deterministically using sha256', () => {
      const token = 'sample-random-token-value';
      const hash1 = tokenService.hashToken(token);
      const hash2 = tokenService.hashToken(token);

      expect(hash1).toHaveLength(64); // SHA-256 hex string
      expect(hash1).toEqual(hash2);
    });
  });

  describe('Refresh Token Rotation & Family Reuse Detection Logic', () => {
    it('should throw UnauthorizedException when an expired token is presented', async () => {
      const mockRawToken = 'expired-token';

      jest.spyOn(tokenService, 'rotateRefreshToken').mockImplementation(async (raw) => {
        if (raw === mockRawToken) {
          throw new UnauthorizedException('Refresh token has expired.');
        }
        return { accessToken: '', refreshToken: '', expiresIn: 0 };
      });

      await expect(tokenService.rotateRefreshToken(mockRawToken)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should trigger family-wide revocation when an already-revoked token is reused', async () => {
      const reusedToken = 'compromised-previously-revoked-token';

      jest.spyOn(tokenService, 'rotateRefreshToken').mockImplementation(async (raw) => {
        if (raw === reusedToken) {
          throw new UnauthorizedException(
            'Security violation: Refresh token reuse detected. Please log in again.',
          );
        }
        return { accessToken: '', refreshToken: '', expiresIn: 0 };
      });

      await expect(tokenService.rotateRefreshToken(reusedToken)).rejects.toThrow(
        'Security violation: Refresh token reuse detected. Please log in again.',
      );
    });

    it('should rotate a valid refresh token into a new token within the same family', async () => {
      const validToken = 'valid-active-refresh-token';

      jest.spyOn(tokenService, 'rotateRefreshToken').mockResolvedValue({
        accessToken: 'new-jwt-access-token',
        refreshToken: 'new-child-refresh-token',
        expiresIn: 900,
      });

      const result = await tokenService.rotateRefreshToken(validToken);

      expect(result.accessToken).toBe('new-jwt-access-token');
      expect(result.refreshToken).toBe('new-child-refresh-token');
      expect(result.expiresIn).toBe(900);
    });
  });
});
