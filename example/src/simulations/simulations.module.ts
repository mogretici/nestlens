import { Module } from '@nestjs/common';
import { SimulationsController } from './simulations.controller';
import { NestLensModule } from 'nestlens';

@Module({
    imports: [NestLensModule],
    controllers: [SimulationsController],
})
export class SimulationsModule { }
