import { Module } from '@nestjs/common';
import { PostsResolver } from './posts.resolver';

import { DatabaseModule } from '../database/database.module';

@Module({
  imports: [DatabaseModule],
  providers: [PostsResolver],
})
export class PostsModule { }
