import { Module } from '@nestjs/common';
import { GraphQLModule } from '@nestjs/graphql';
import { ApolloDriver, ApolloDriverConfig } from '@nestjs/apollo';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { DatabaseModule } from './database/database.module';
import { UsersModule } from './users/users.module';
import { PostsModule } from './posts/posts.module';
import { ProductsModule } from './products/products.module';
import { OrdersModule } from './orders/orders.module';
import { SimulationsModule } from './simulations/simulations.module';
import { StatusModule } from './status/status.module';
import { NestLensModule } from 'nestlens';

// NestLens module configuration
const nestLensModule = NestLensModule.forRoot({
  enabled: true,
  path: '/nestlens',
  watchers: {
    request: true,
    exception: true,
    log: true,
    query: true,
    cache: true,
    event: true,
    job: true,
    schedule: true,
    mail: true,
    httpClient: true,
    graphql: {
      enabled: true,
      captureVariables: true,
      detectN1Queries: true,
      traceFieldResolvers: true,
      resolverTracingSampleRate: 1,
    },
  },
});

@Module({
  imports: [
    nestLensModule,
    // No plugin wiring: `watchers.graphql` registers NestLens's Apollo plugin as
    // a provider and Apollo discovers it, which is what the documentation
    // tells a reader to expect. The example is where that promise is exercised.
    GraphQLModule.forRoot<ApolloDriverConfig>({
      driver: ApolloDriver,
      autoSchemaFile: true,
      playground: true,
      subscriptions: {
        'graphql-ws': true,
      },
    }),
    DatabaseModule,
    UsersModule,
    PostsModule,
    ProductsModule,
    OrdersModule,
    SimulationsModule,
    StatusModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule { }
