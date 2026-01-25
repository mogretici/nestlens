import { ObjectType, Field, ID } from '@nestjs/graphql';
import { Post } from '../../posts/entities/post.entity';

@ObjectType()
export class User {
  @Field(() => ID)
  id!: string;

  @Field()
  name!: string;

  @Field()
  email!: string;

  @Field(() => [Post], { nullable: true })
  posts?: Post[];
}
