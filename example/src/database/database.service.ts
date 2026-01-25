import { Injectable } from '@nestjs/common';
import { User } from '../users/entities/user.entity';
import { Post } from '../posts/entities/post.entity';
import { Product } from '../products/entities/product.entity';
import { Order } from '../orders/entities/order.entity';
import { PubSub } from 'graphql-subscriptions';

@Injectable()
export class DatabaseService {
  public pubSub = new PubSub();

  public users: User[] = [
    { id: '1', name: 'Alice', email: 'alice@example.com' },
    { id: '2', name: 'Bob', email: 'bob@example.com' },
    { id: '3', name: 'Charlie', email: 'charlie@example.com' },
  ];

  public blogPosts: Post[] = [
    { id: '1', title: 'Hello World', content: 'First post content' },
    { id: '2', title: 'GraphQL is awesome', content: 'Second post content' },
    { id: '3', title: 'NestJS rocks', content: 'Third post content' },
  ];

  public products: Product[] = [
    { id: '1', name: 'Widget', price: 29.99, stock: 100 },
    { id: '2', name: 'Gadget', price: 49.99, stock: 50 },
    { id: '3', name: 'Doohickey', price: 19.99, stock: 200 },
  ];

  public orders: Order[] = [
    { id: '1', total: 99.99, status: 'pending', items: [] },
    { id: '2', total: 149.99, status: 'shipped', items: [] },
    { id: '3', total: 29.99, status: 'delivered', items: [] },
  ];
}
