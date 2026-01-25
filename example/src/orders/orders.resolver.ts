import {
  Resolver,
  Query,
  Mutation,
  Args,
  ID,
  Subscription,
  ResolveField,
  Parent,
} from '@nestjs/graphql';
import { Order } from './entities/order.entity';
import { OrderItem } from './entities/order-item.entity';
import { Product } from '../products/entities/product.entity';
import { DatabaseService } from '../database/database.service';
import { Logger } from '@nestjs/common';

@Resolver(() => Order)
export class OrdersResolver {
  private readonly logger = new Logger(OrdersResolver.name);

  constructor(private readonly db: DatabaseService) {}

  @Query(() => [Order], { name: 'orders' })
  findAll(@Args('userId', { type: () => ID, nullable: true }) userId?: string) {
    this.logger.log(`Fetching orders for user ${userId}`);
    return this.db.orders.map((order) => ({
      ...order,
      items: [
        { id: '1', quantity: 2, productId: '1' },
        { id: '2', quantity: 1, productId: '2' },
      ],
    }));
  }

  @Mutation(() => Boolean)
  deleteOrder(@Args('id', { type: () => ID }) id: string) {
    this.logger.log(`Deleting order ${id}`);
    const index = this.db.orders.findIndex((o) => o.id === id);
    if (index === -1) return false;
    this.db.orders.splice(index, 1);
    return true;
  }

  @Mutation(() => Order)
  placeOrder(@Args('items', { type: () => [ID] }) items: string[]) {
    this.logger.log(`Placing order with items: ${items.join(', ')}`);
    const newOrder: Order = {
      id: String(this.db.orders.length + 1),
      total: items.length * 29.99,
      status: 'pending',
      items: items.map((itemId, i) => ({
        id: String(i + 1),
        quantity: 1,
        productId: itemId,
      })),
    };
    this.db.orders.push(newOrder);
    this.db.pubSub.publish('orderCreated', { orderCreated: newOrder });
    return newOrder;
  }

  @Subscription(() => Order, {
    resolve: (value) => value.orderCreated,
  })
  orderCreated() {
    return this.db.pubSub.asyncIterableIterator('orderCreated');
  }
}

@Resolver(() => OrderItem)
export class OrderItemsResolver {
  constructor(private readonly db: DatabaseService) {}

  @ResolveField('product', () => Product, { nullable: true })
  getProduct(@Parent() orderItem: OrderItem & { productId?: string }) {
    const pid = orderItem.productId;
    if (!pid) return this.db.products[0];
    return this.db.products.find((p) => p.id === pid) || this.db.products[0];
  }
}
