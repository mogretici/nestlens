import { Module } from '@nestjs/common';
import { ProductsResolver } from './products.resolver';
import { DatabaseModule } from '../database/database.module';

@Module({
  imports: [DatabaseModule],
  providers: [ProductsResolver],
})
export class ProductsModule { }
