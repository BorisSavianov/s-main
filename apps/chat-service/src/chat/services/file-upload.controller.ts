// apps/chat-service/src/chat/services/file-upload.controller.ts
import {
  Controller,
  Post,
  Get,
  Delete,
  Param,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  HttpStatus,
  Res,
  ParseUUIDPipe,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiConsumes,
  ApiBody,
  ApiParam,
} from '@nestjs/swagger';
import { Response } from 'express';

import { FileUploadService } from './file-upload.service';
import { JwtAuthGuard } from '../../../../auth-service/src/auth/guards/jwt-auth.guard';
import { Public } from '../../../../auth-service/src/auth/decorators/public.decorator';
import { GetUser } from '../../../../auth-service/src/auth/decorators/get-user.decorator';

@ApiTags('File Upload')
@Controller('/files')
@UseGuards(JwtAuthGuard)
export class FileUploadController {
  constructor(private readonly fileUploadService: FileUploadService) {}

  @Post('upload/image')
  @ApiBearerAuth()
  @UseInterceptors(
    FileInterceptor('file', {
      limits: {
        fileSize: 10 * 1024 * 1024, // 10MB
      },
    }),
  )
  @ApiOperation({ summary: 'Upload an image' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
          description: 'Image file (JPEG, PNG, GIF, WebP)',
        },
      },
    },
  })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'Image uploaded successfully',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        message: { type: 'string' },
        data: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            url: { type: 'string' },
            thumbnailUrl: { type: 'string' },
            fileName: { type: 'string' },
            fileSize: { type: 'number' },
            mimeType: { type: 'string' },
          },
        },
      },
    },
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Invalid file or file too large',
  })
  async uploadImage(
    @UploadedFile() file: Express.Multer.File,
    @GetUser() currentUser: any,
  ) {
    const result = await this.fileUploadService.uploadImage(file, {
      generateThumbnail: true,
      compressImage: true,
    });

    return {
      success: true,
      message: 'Image uploaded successfully',
      data: result,
    };
  }

  @Get('images/:fileName')
  @Public()
  @ApiOperation({ summary: 'Get an image file' })
  @ApiParam({ name: 'fileName', description: 'Name of the image file' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Image file returned',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Image not found',
  })
  async getImage(@Param('fileName') fileName: string, @Res() res: Response) {
    const buffer = await this.fileUploadService.getFileBuffer('images', fileName);

    // Set cache headers for performance
    res.set({
      'Content-Type': 'image/webp',
      'Cache-Control': 'public, max-age=31536000, immutable',
      'ETag': `"${Buffer.from(fileName).toString('base64')}"`,
    });

    res.send(buffer);
  }

  @Get('thumbnails/:fileName')
  @Public()
  @ApiOperation({ summary: 'Get a thumbnail image' })
  @ApiParam({ name: 'fileName', description: 'Name of the thumbnail file' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Thumbnail file returned',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Thumbnail not found',
  })
  async getThumbnail(@Param('fileName') fileName: string, @Res() res: Response) {
    const buffer = await this.fileUploadService.getFileBuffer('thumbnails', fileName);

    // Set cache headers for performance
    res.set({
      'Content-Type': 'image/webp',
      'Cache-Control': 'public, max-age=31536000, immutable',
      'ETag': `"${Buffer.from(fileName).toString('base64')}"`,
    });

    res.send(buffer);
  }

  @Delete(':fileId')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete an uploaded file' })
  @ApiParam({ name: 'fileId', description: 'ID of the file to delete' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'File deleted successfully',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'File not found',
  })
  async deleteFile(
    @Param('fileId', ParseUUIDPipe) fileId: string,
    @GetUser() currentUser: any,
  ) {
    await this.fileUploadService.deleteFile(fileId);

    return {
      success: true,
      message: 'File deleted successfully',
    };
  }
}
