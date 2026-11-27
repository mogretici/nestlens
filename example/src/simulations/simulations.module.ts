import { Module } from '@nestjs/common';
import { SimulationsController } from './simulations.controller';

// No NestLensModule import: `forRoot` in AppModule is global, so the
// CollectorService the controller takes is already in scope.
@Module({
  controllers: [SimulationsController],
})
export class SimulationsModule {}
