import { Resolver, Query, Mutation, Args, Subscription } from '@nestjs/graphql';
import { UsersService } from './users.service';
import { User } from './entities/user.entity';
import { CreateUserInput } from './dto/create-user.input';
import { DatabaseService } from '../database/database.service'; // Assuming DatabaseService path

@Resolver(() => User)
export class UsersResolver {
    constructor(
        private readonly usersService: UsersService,
        private readonly db: DatabaseService,
    ) { }

    @Query(() => [User], { name: 'users' })
    findAll() {
        return this.usersService.findAll();
    }

    @Query(() => User, { name: 'user' })
    findOne(@Args('id') id: string) {
        return this.usersService.findOne(id);
    }

    @Mutation(() => User)
    createUser(@Args('createUserInput') createUserInput: CreateUserInput) {
        return this.usersService.create(createUserInput);
    }

    @Subscription(() => User)
    userCreated() {
        return this.db.pubSub.asyncIterableIterator('userCreated');
    }
}
