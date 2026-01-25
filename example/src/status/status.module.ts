import { Module } from '@nestjs/common';
import { StatusController, ErrorController } from './status.controller';

@Module({
    controllers: [StatusController, ErrorController],
})
export class StatusModule { }
