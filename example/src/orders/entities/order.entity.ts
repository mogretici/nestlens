import { ObjectType, Field, ID, Float } from '@nestjs/graphql';
import { OrderItem } from './order-item.entity';

@ObjectType()
export class Order {
    @Field(() => ID)
    id!: string;

    @Field(() => Float)
    total!: number;

    @Field()
    status!: string;

    @Field(() => [OrderItem])
    items!: OrderItem[];
}
