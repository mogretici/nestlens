import { ObjectType, Field, ID, Int } from '@nestjs/graphql';
import { Product } from '../../products/entities/product.entity';

@ObjectType()
export class OrderItem {
    @Field(() => ID)
    id!: string;

    @Field(() => Int)
    quantity!: number;

    @Field(() => Product, { nullable: true })
    product?: Product;
}
