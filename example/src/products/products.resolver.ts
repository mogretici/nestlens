import { Resolver, Query, Mutation, Args, Int, ID } from '@nestjs/graphql';
import { Product } from './entities/product.entity';
import { UpdateProductInput } from './dto/update-product.input';
import { DatabaseService } from '../database/database.service';
import { Logger } from '@nestjs/common';

@Resolver(() => Product)
export class ProductsResolver {
  private readonly logger = new Logger(ProductsResolver.name);

  constructor(private readonly db: DatabaseService) {}

  @Query(() => [Product], { name: 'products' })
  findAll(
    @Args('category', { nullable: true }) category?: string,
    @Args('limit', { type: () => Int, nullable: true }) limit?: number,
  ) {
    this.logger.log(
      `Fetching products (category: ${category}, limit: ${limit})`,
    );
    let result = [...this.db.products];
    if (limit) result = result.slice(0, limit);
    return result;
  }

  @Mutation(() => Product)
  updateProduct(
    @Args('id', { type: () => ID }) id: string,
    @Args('input') input: UpdateProductInput,
  ) {
    this.logger.log(`Updating product ${id}`);
    const product = this.db.products.find((p) => p.id === id);
    if (!product) throw new Error('Product not found');

    if (input.name) product.name = input.name;
    if (input.price) product.price = input.price;

    return product;
  }
}
