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
import { NestLensModule, GraphQLWatcher } from 'nestlens';

// NestLens module configuration
const nestLensModule = NestLensModule.forRoot({
  enabled: true,
  path: '/nestlens',
  storage: {
    filename: './nestlens.db',
  },
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
    GraphQLModule.forRootAsync<ApolloDriverConfig>({
      driver: ApolloDriver,
      imports: [nestLensModule],
      inject: [GraphQLWatcher],
      useFactory: (graphqlWatcher: GraphQLWatcher) => ({
        autoSchemaFile: true,
        playground: true,
        plugins: [graphqlWatcher.getPlugin() as any],
        subscriptions: {
          'graphql-ws': true,
        },
      }),
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
