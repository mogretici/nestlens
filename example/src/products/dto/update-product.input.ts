import { InputType, Field, Float } from '@nestjs/graphql';

@InputType()
export class UpdateProductInput {
    @Field({ nullable: true })
    name?: string;

    @Field(() => Float, { nullable: true })
    price?: number;
}
