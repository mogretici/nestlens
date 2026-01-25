import { Controller, Get, Post, Put, Patch, Delete, Body, Param, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { UsersService } from './users.service';
import { CreateUserInput } from './dto/create-user.input';

@ApiTags('users')
@Controller('users')
export class UsersController {
    constructor(private readonly usersService: UsersService) { }

    @Get()
    @ApiOperation({ summary: 'Get all users' })
    @ApiResponse({ status: 200, description: 'Return all users.' })
    findAll() {
        return this.usersService.findAll();
    }

    @Get(':id')
    @ApiOperation({ summary: 'Get a user by ID' })
    @ApiResponse({ status: 200, description: 'Return the user.' })
    @ApiResponse({ status: 404, description: 'User not found.' })
    findOne(@Param('id') id: string) {
        return this.usersService.findOne(id);
    }

    @Post()
    @ApiOperation({ summary: 'Create a new user' })
    @ApiResponse({ status: 201, description: 'User created.' })
    create(@Body() body: CreateUserInput) {
        return this.usersService.create(body);
    }

    @Put(':id')
    @ApiOperation({ summary: 'Update a user' })
    @ApiResponse({ status: 200, description: 'User updated.' })
    update(@Param('id') id: string, @Body() body: { name: string }) {
        return { id: parseInt(id), name: body.name };
    }

    @Patch(':id')
    @ApiOperation({ summary: 'Patch a user' })
    @ApiResponse({ status: 200, description: 'User patched.' })
    patch(@Param('id') id: string, @Body() body: { name?: string }) {
        return { id: parseInt(id), name: body.name || 'Patched' };
    }

    @Delete(':id')
    @ApiOperation({ summary: 'Delete a user' })
    @ApiResponse({ status: 200, description: 'User deleted.' })
    delete(@Param('id') id: string) {
        return { success: true, id: parseInt(id) };
    }
}
