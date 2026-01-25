import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { CreateUserInput } from './dto/create-user.input';
import { User } from './entities/user.entity';

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(private db: DatabaseService) { }

  findAll(): User[] {
    this.logger.log('Fetching all users');
    return this.db.users;
  }

  findOne(id: string): User | undefined {
    this.logger.log(`Fetching user ${id}`);
    return this.db.users.find((u) => u.id === id);
  }

  create(input: CreateUserInput): User {
    this.logger.log(`Creating user: ${input.name}`);
    const newUser: User = {
      id: String(this.db.users.length + 1),
      name: input.name,
      email: input.email,
    };
    this.db.users.push(newUser);
    this.db.pubSub.publish('userCreated', { userCreated: newUser });
    return newUser;
  }
}
