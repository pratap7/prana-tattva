import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ReviewsController } from './reviews.controller';
import { ReviewsService } from './services/reviews.service';
import { ReviewModerationService } from './services/review-moderation.service';
import { RatingAggregationService } from './services/rating-aggregation.service';
import { OptionalJwtAuthGuard } from '../auth/guards/optional-jwt-auth.guard';
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
  controllers: [ReviewsController],
  providers: [
    ReviewsService,
    ReviewModerationService,
    RatingAggregationService,
    OptionalJwtAuthGuard,
  ],
  exports: [ReviewsService, ReviewModerationService, RatingAggregationService],
})
export class ReviewsModule {}
