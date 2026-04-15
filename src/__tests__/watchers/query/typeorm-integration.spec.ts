/**
 * QueryWatcher integration test — exercises the real TypeORM 0.3.x runtime
 * with `better-sqlite3` to prove that queries are actually captured end to
 * end. This is the regression guard for issue #5: the previous watcher
 * silently no-op'd here because it relied on `getDataSources()` and a fake
 * `Driver.afterQuery` hook, neither of which exist in TypeORM 0.3.x.
 */
import { Module } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';
import { InjectRepository, TypeOrmModule } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { NestLensModule } from '../../../nestlens.module';
import { CollectorService } from '../../../core/collector.service';
import { STORAGE } from '../../../core/storage';

@Entity()
class IntegrationUser {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  name!: string;
}

@Module({
  imports: [
    NestLensModule.forRoot({
      enabled: true,
      watchers: { query: { enabled: true, slowThreshold: 0 } },
    }),
    TypeOrmModule.forRoot({
      type: 'better-sqlite3',
      database: ':memory:',
      entities: [IntegrationUser],
      synchronize: true,
    }),
    TypeOrmModule.forFeature([IntegrationUser]),
  ],
})
class IntegrationAppModule {
  constructor(
    @InjectRepository(IntegrationUser)
    public readonly users: Repository<IntegrationUser>,
  ) {}
}

describe('QueryWatcher (TypeORM integration)', () => {
  let moduleRef: TestingModule;
  let app: IntegrationAppModule;
  let storage: { find: (filter: { type: string }) => Promise<unknown[]> };

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [IntegrationAppModule],
    }).compile();
    await moduleRef.init();
    app = moduleRef.get(IntegrationAppModule);
    storage = moduleRef.get(STORAGE) as unknown as typeof storage;
  });

  afterAll(async () => {
    if (moduleRef) {
      await moduleRef.close();
    }
  });

  it('captures INSERT and SELECT queries end-to-end', async () => {
    const collector = moduleRef.get(CollectorService) as unknown as {
      flush?: () => Promise<void>;
    };

    await app.users.save({ name: 'Wasim' });
    await app.users.find();

    if (typeof collector.flush === 'function') {
      await collector.flush();
    }
    await new Promise((resolve) => setTimeout(resolve, 50));

    const entries = (await storage.find({ type: 'query' })) as Array<{
      payload: { query: string; source: string; connection?: string };
    }>;

    const sources = new Set(entries.map((e) => e.payload.source));
    expect(sources.has('typeorm')).toBe(true);

    const joined = entries.map((e) => e.payload.query).join(' | ');
    expect(joined).toMatch(/INSERT INTO\s+"?integration_user"?/i);
    expect(joined).toMatch(/SELECT[\s\S]*integration_user/i);
  });
});
