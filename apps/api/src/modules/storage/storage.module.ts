import { Module, Global } from '@nestjs/common';
import { StorageService, StubVirusScanner } from './storage.service';
import { VIRUS_SCANNER } from './virus-scanner.interface';

@Global()
@Module({
  providers: [
    StorageService,
    {
      provide: VIRUS_SCANNER,
      useClass: StubVirusScanner,
    },
  ],
  exports: [StorageService, VIRUS_SCANNER],
})
export class StorageModule {}
