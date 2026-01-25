import { Controller, Get, Post, Body, Res, HttpStatus, BadRequestException, UnauthorizedException, ForbiddenException, NotFoundException, Logger } from '@nestjs/common';
import type { Response } from 'express';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';

@ApiTags('status')
@Controller('status')
export class StatusController {
    private readonly logger = new Logger(StatusController.name);

    @Post('created')
    @ApiOperation({ summary: 'Returns 201 Created' })
    created(@Res() res: Response): void {
        this.logger.log('201 Created');
        res.status(HttpStatus.CREATED).json({ message: 'Resource created' });
    }

    @Get('no-content')
    @ApiOperation({ summary: 'Returns 204 No Content' })
    noContent(@Res() res: Response): void {
        this.logger.log('204 No Content');
        res.status(HttpStatus.NO_CONTENT).send();
    }

    @Get('redirect')
    @ApiOperation({ summary: 'Returns 302 Redirect' })
    redirect(@Res() res: Response): void {
        this.logger.log('302 Redirect');
        res.redirect('/');
    }

    @Get('redirect-permanent')
    @ApiOperation({ summary: 'Returns 301 Permanent Redirect' })
    redirectPermanent(@Res() res: Response): void {
        this.logger.log('301 Permanent Redirect');
        res.redirect(HttpStatus.MOVED_PERMANENTLY, '/');
    }

    @Get('not-modified')
    @ApiOperation({ summary: 'Returns 304 Not Modified' })
    notModified(@Res() res: Response): void {
        this.logger.log('304 Not Modified');
        res.status(HttpStatus.NOT_MODIFIED).send();
    }

    @Get('bad-request')
    @ApiOperation({ summary: 'Throws 400 Bad Request' })
    badRequest(): void {
        this.logger.warn('400 Bad Request');
        throw new BadRequestException('Invalid request parameters');
    }

    @Get('unauthorized')
    @ApiOperation({ summary: 'Throws 401 Unauthorized' })
    unauthorized(): void {
        this.logger.warn('401 Unauthorized');
        throw new UnauthorizedException('Authentication required');
    }

    @Get('forbidden')
    @ApiOperation({ summary: 'Throws 403 Forbidden' })
    forbidden(): void {
        this.logger.warn('403 Forbidden');
        throw new ForbiddenException('Access denied');
    }

    @Get('not-found')
    @ApiOperation({ summary: 'Throws 404 Not Found' })
    notFound(): void {
        this.logger.warn('404 Not Found');
        throw new NotFoundException('Resource not found');
    }

    @Post('validation-error')
    @ApiOperation({ summary: 'Throws 400 Validation Error' })
    validationError(@Body() body: { email?: string }): void {
        this.logger.warn('400 Validation Error');
        if (!body.email || !body.email.includes('@')) {
            throw new BadRequestException('Invalid email format');
        }
    }

    @Get('internal-error')
    @ApiOperation({ summary: 'Throws 500 Internal Server Error' })
    internalError(): void {
        this.logger.error('500 Internal Server Error');
        throw new Error('Internal server error occurred');
    }

    @Get('slow')
    @ApiOperation({ summary: 'Simulates a slow 1000-3000ms request' })
    async slow(): Promise<{ message: string; duration: number }> {
        const duration = 1000 + Math.random() * 2000;
        this.logger.warn(`Slow request: ${duration}ms`);
        await new Promise(resolve => setTimeout(resolve, duration));
        return { message: 'Slow response', duration };
    }
}

@ApiTags('errors')
@Controller('error')
export class ErrorController {
    private readonly logger = new Logger(ErrorController.name);

    @Get()
    @ApiOperation({ summary: 'Throws a generic test error' })
    throwError(): void {
        this.logger.warn('About to throw an error');
        throw new Error('Test error for NestLens');
    }
}
