import { Module } from '@nestjs/common';
import { UsersService } from './users.service';
import { UsersResolver } from './users.resolver';
import { UsersController } from './users.controller';
import { DatabaseModule } from '../database/database.module';

@Module({
    imports: [DatabaseModule],
    controllers: [UsersController],
    providers: [UsersResolver, UsersService],
    exports: [UsersService],
})
export class UsersModule { }
