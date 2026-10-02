import { Injectable } from '@nestjs/common';
import { hash, verify } from '@node-rs/argon2';

@Injectable()
export class PasswordService {
  private readonly argonOptions = {
    memoryCost: 65536, // 64 MB
    timeCost: 3, // 3 iterations
    outputLen: 32,
    parallelism: 2,
  };

  async hashPassword(password: string): Promise<string> {
    return hash(password, this.argonOptions);
  }

  async verifyPassword(hashedPassword: string, candidate: string): Promise<boolean> {
    try {
      return await verify(hashedPassword, candidate);
    } catch {
      return false;
    }
  }
}
