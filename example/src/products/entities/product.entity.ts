import { ObjectType, Field, ID, Float } from '@nestjs/graphql';

@ObjectType()
export class Product {
    @Field(() => ID)
    id!: string;

    @Field()
    name!: string;

    @Field(() => Float)
    price!: number;

    @Field(() => Float, { nullable: true })
    stock?: number;

    @Field({ nullable: true })
    category?: string;
}
