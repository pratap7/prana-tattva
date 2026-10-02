import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Query,
  UseGuards,
  Req,
  Ip,
  Headers,
} from '@nestjs/common';
import { Request } from 'express';
import { ReviewsService } from './services/reviews.service';
import { RatingAggregationService } from './services/rating-aggregation.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { OptionalJwtAuthGuard } from '../auth/guards/optional-jwt-auth.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import {
  createReviewSchema,
  CreateReviewDto,
  updateReviewSchema,
  UpdateReviewDto,
  replyReviewSchema,
  ReplyReviewDto,
  updateReplySchema,
  UpdateReplyDto,
  reportReviewSchema,
  ReportReviewDto,
  reportProviderSchema,
  ReportProviderDto,
  getReviewsQuerySchema,
  GetReviewsQueryDto,
} from '@project-nirvana/shared';

interface AuthenticatedRequest extends Request {
  user: {
    userId: string;
    email: string;
    role: string;
  };
}

@Controller('reviews')
export class ReviewsController {
  constructor(
    private readonly reviewsService: ReviewsService,
    private readonly aggregationService: RatingAggregationService,
  ) {}

  /**
   * Check if a booking is eligible for review by the consumer
   */
  @Get('eligibility/:bookingId')
  @UseGuards(JwtAuthGuard)
  async checkEligibility(@Param('bookingId') bookingId: string, @Req() req: AuthenticatedRequest) {
    return this.reviewsService.checkEligibility(bookingId, req.user.userId);
  }

  /**
   * Submit a new review for a completed booking
   */
  @Post()
  @UseGuards(JwtAuthGuard)
  async createReview(
    @Body(new ZodValidationPipe(createReviewSchema)) dto: CreateReviewDto,
    @Req() req: AuthenticatedRequest,
    @Ip() clientIp: string,
    @Headers('user-agent') userAgent?: string,
  ) {
    return this.reviewsService.createReview(req.user.userId, dto, clientIp, userAgent);
  }

  /**
   * Edit an existing review within 48 hours
   */
  @Patch(':id')
  @UseGuards(JwtAuthGuard)
  async updateReview(
    @Param('id') reviewId: string,
    @Body(new ZodValidationPipe(updateReviewSchema)) dto: UpdateReviewDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.reviewsService.updateReview(reviewId, req.user.userId, dto);
  }

  /**
   * Provider posts a one-time reply to a review
   */
  @Post(':id/reply')
  @UseGuards(JwtAuthGuard)
  async replyToReview(
    @Param('id') reviewId: string,
    @Body(new ZodValidationPipe(replyReviewSchema)) dto: ReplyReviewDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.reviewsService.replyToReview(reviewId, req.user.userId, dto);
  }

  /**
   * Provider edits reply within 48 hours
   */
  @Patch(':id/reply')
  @UseGuards(JwtAuthGuard)
  async updateReply(
    @Param('id') reviewId: string,
    @Body(new ZodValidationPipe(updateReplySchema)) dto: UpdateReplyDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.reviewsService.updateReply(reviewId, req.user.userId, dto);
  }

  /**
   * Report an abusive or fake review into the admin queue
   */
  @Post(':id/report')
  @UseGuards(JwtAuthGuard)
  async reportReview(
    @Param('id') reviewId: string,
    @Body(new ZodValidationPipe(reportReviewSchema)) dto: ReportReviewDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.reviewsService.reportReview(reviewId, req.user.userId, dto);
  }

  /**
   * Report a provider (misconduct, medical claims, scam, harassment)
   * Auto-suspends on severe category
   */
  @Post('report-provider')
  @UseGuards(JwtAuthGuard)
  async reportProvider(
    @Body(new ZodValidationPipe(reportProviderSchema)) dto: ReportProviderDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.reviewsService.reportProvider(req.user.userId, dto);
  }

  /**
   * Get provider reviews (public, optional auth for permission flags)
   */
  @Get('provider/:providerId')
  @UseGuards(OptionalJwtAuthGuard)
  async getProviderReviews(
    @Param('providerId') providerId: string,
    @Query(new ZodValidationPipe(getReviewsQuerySchema)) query: GetReviewsQueryDto,
    @Req() req: Request & { user?: { userId: string } },
  ) {
    return this.reviewsService.getProviderReviews(providerId, query, req.user?.userId);
  }

  /**
   * Get provider reliability metrics and badges (public)
   */
  @Get('provider/:providerId/reliability')
  async getProviderReliability(@Param('providerId') providerId: string) {
    return this.aggregationService.getProviderMetrics(providerId);
  }
}
