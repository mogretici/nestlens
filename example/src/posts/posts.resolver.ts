import { Resolver, Query, Args, ResolveField, Parent } from '@nestjs/graphql';
import { Post } from './entities/post.entity';
import { User } from '../users/entities/user.entity';
import { Comment } from './entities/comment.entity';
import { DatabaseService } from '../database/database.service';
import { Logger } from '@nestjs/common';

@Resolver(() => Post)
export class PostsResolver {
  private readonly logger = new Logger(PostsResolver.name);

  constructor(private readonly db: DatabaseService) {}

  @Query(() => [Post], { name: 'search' })
  search(@Args('term') term: string) {
    this.logger.log(`Searching for: ${term}`);
    return this.db.blogPosts.filter(
      (p) =>
        p.title.toLowerCase().includes(term.toLowerCase()) ||
        p.content?.toLowerCase().includes(term.toLowerCase()),
    );
  }

  @ResolveField('author', () => User, { nullable: true })
  getAuthor(@Parent() post: Post) {
    const postIndex = this.db.blogPosts.findIndex((p) => p.id === post.id);
    if (postIndex === -1) return null;
    const userIndex = postIndex % this.db.users.length;
    return this.db.users[userIndex];
  }

  @ResolveField('comments', () => [Comment], { nullable: true })
  getComments(@Parent() post: Post) {
    return [];
  }
}
