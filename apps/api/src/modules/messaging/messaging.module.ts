import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { MessagingController } from './messaging.controller';
import { MessagingService } from './services/messaging.service';
import { MessageEncryptionService } from './services/message-encryption.service';
import { AntiLeakageService } from './services/anti-leakage.service';
import { MessagingGateway } from './gateways/messaging.gateway';
import { getEnvConfig } from '../../config/env.config';

@Module({
  imports: [
    JwtModule.registerAsync({
      useFactory: () => {
        const env = getEnvConfig();
        return {
          secret: env.JWT_SECRET,
        };
      },
    }),
  ],
  controllers: [MessagingController],
  providers: [MessagingService, MessageEncryptionService, AntiLeakageService, MessagingGateway],
  exports: [MessagingService, MessageEncryptionService, AntiLeakageService, MessagingGateway],
})
export class MessagingModule {}
