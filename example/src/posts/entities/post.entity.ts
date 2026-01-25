import { ObjectType, Field, ID } from '@nestjs/graphql';
import { User } from '../../users/entities/user.entity';
import { Comment } from './comment.entity';

@ObjectType()
export class Post {
  @Field(() => ID)
  id!: string;

  @Field()
  title!: string;

  @Field({ nullable: true })
  content?: string;

  @Field(() => User, { nullable: true })
  author?: User;

  @Field(() => [Comment], { nullable: true })
  comments?: Comment[];
}
