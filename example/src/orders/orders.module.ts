import { Module } from '@nestjs/common';
import { OrdersResolver, OrderItemsResolver } from './orders.resolver';
import { DatabaseModule } from '../database/database.module';

@Module({
  imports: [DatabaseModule],
  providers: [OrdersResolver, OrderItemsResolver],
})
export class OrdersModule { }
