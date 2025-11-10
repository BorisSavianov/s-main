// // apps/chat-service/src/web-search/web-scraper.controller.ts
// import {
//   Controller,
//   Post,
//   Get,
//   Body,
//   Query,
//   UseGuards,
//   HttpCode,
//   HttpStatus,
// } from '@nestjs/common';
// import {
//   ApiTags,
//   ApiOperation,
//   ApiResponse,
//   ApiBearerAuth,
//   ApiQuery,
//   ApiBody,
// } from '@nestjs/swagger';
// import { ThrottlerGuard } from '@nestjs/throttler';
// import { IsString, IsNumber, IsOptional, Min, Max } from 'class-validator';

// import { WebScraperService } from './web-scraper.service';
// import { JwtAuthGuard } from 'apps/auth-service/src/auth/guards/jwt-auth.guard';
// import { GetUser } from 'apps/auth-service/src/auth/decorators/get-user.decorator';

// export class ScrapeQueryDto {
//   @IsString()
//   query: string;

//   @IsOptional()
//   @IsNumber()
//   @Min(1)
//   @Max(20)
//   maxResults?: number;
// }

// @Controller('web-scraper')
// @ApiTags('Web Scraper')
// @UseGuards(JwtAuthGuard, ThrottlerGuard)
// @ApiBearerAuth()
// export class WebScraperController {
//   constructor(private readonly webScraperService: WebScraperService) {}

//   @Post('scrape')
//   @HttpCode(HttpStatus.OK)
//   @ApiOperation({
//     summary: 'Scrape and process web search results',
//     description: 'Perform web search via Whoogle and extract structured data',
//   })
//   @ApiBody({ type: ScrapeQueryDto })
//   @ApiResponse({
//     status: 200,
//     description: 'Scraping completed successfully',
//   })
//   @ApiResponse({
//     status: 401,
//     description: 'Unauthorized',
//   })
//   @ApiResponse({
//     status: 429,
//     description: 'Too many requests',
//   })
//   async scrapeSearchResults(
//     @Body() body: ScrapeQueryDto,
//     @GetUser() user: any,
//   ) {
//     const results = await this.webScraperService.scrapeSearchResults(
//       body.query,
//       user.id,
//     );

//     return {
//       success: true,
//       data: results,
//       timestamp: new Date().toISOString(),
//     };
//   }

//   @Post('scrape/enhanced')
//   @HttpCode(HttpStatus.OK)
//   @ApiOperation({
//     summary: 'Scrape and format for AI integration',
//     description:
//       'Scrape search results and format them for AI service consumption',
//   })
//   @ApiBody({ type: ScrapeQueryDto })
//   @ApiResponse({
//     status: 200,
//     description: 'Enhanced context generated successfully',
//   })
//   async scrapeForAI(@Body() body: ScrapeQueryDto, @GetUser() user: any) {
//     const scraperResponse = await this.webScraperService.scrapeSearchResults(
//       body.query,
//       user.id,
//     );

//     const enhancedContext = this.webScraperService.buildEnhancedContext(
//       scraperResponse,
//       body.maxResults || 5,
//     );

//     const aiPrompt = this.webScraperService.formatForAIPrompt(enhancedContext);

//     return {
//       success: true,
//       data: {
//         enhancedContext,
//         aiPrompt,
//       },
//       timestamp: new Date().toISOString(),
//     };
//   }

//   @Get('stats')
//   @ApiOperation({
//     summary: 'Get user scraping statistics',
//     description:
//       'Retrieve scraping history and statistics for the authenticated user',
//   })
//   @ApiResponse({
//     status: 200,
//     description: 'Statistics retrieved successfully',
//   })
//   async getStats(@GetUser() user: any) {
//     const stats = await this.webScraperService.getUserScrapingStats(user.id);

//     return {
//       success: true,
//       data: stats,
//       timestamp: new Date().toISOString(),
//     };
//   }

//   @Get('health')
//   @ApiOperation({
//     summary: 'Check web scraper service health',
//     description: 'Verify scraper and Whoogle service availability',
//   })
//   @ApiResponse({
//     status: 200,
//     description: 'Service is healthy',
//   })
//   async healthCheck() {
//     const isHealthy = await this.webScraperService.healthCheck();

//     return {
//       success: true,
//       data: {
//         status: isHealthy ? 'healthy' : 'unhealthy',
//         service: 'Whoogle Web Scraper',
//       },
//       timestamp: new Date().toISOString(),
//     };
//   }
// }
