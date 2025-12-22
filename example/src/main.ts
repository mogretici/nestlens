import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Module, Controller, Get, Logger, Post, Put, Patch, Delete, Body, Param, Res, HttpStatus, BadRequestException, NotFoundException, ForbiddenException, UnauthorizedException, Inject } from '@nestjs/common';
import { Response } from 'express';
import { NestLensModule, CollectorService, NestLensLogger } from 'nestlens';

@Controller()
class AppController {
  private readonly logger = new Logger(AppController.name);

  constructor(
    @Inject(CollectorService)
    private readonly collector: CollectorService,
  ) {}

  @Get()
  getHello(): string {
    this.logger.log('Hello endpoint called');
    return 'Hello World!';
  }

  @Get('users')
  getUsers(): { id: number; name: string }[] {
    this.logger.debug('Fetching users');
    return [
      { id: 1, name: 'Alice' },
      { id: 2, name: 'Bob' },
    ];
  }

  @Get('users/:id')
  getUser(@Param('id') id: string): { id: number; name: string } {
    this.logger.debug(`Fetching user ${id}`);
    return { id: parseInt(id), name: 'User ' + id };
  }

  @Post('users')
  createUser(@Body() body: { name: string }): { id: number; name: string } {
    this.logger.log(`Creating user: ${body.name}`);
    return { id: 3, name: body.name };
  }

  @Put('users/:id')
  updateUser(@Param('id') id: string, @Body() body: { name: string }): { id: number; name: string } {
    this.logger.log(`Updating user ${id}: ${body.name}`);
    return { id: parseInt(id), name: body.name };
  }

  @Patch('users/:id')
  patchUser(@Param('id') id: string, @Body() body: { name?: string }): { id: number; name: string } {
    this.logger.log(`Patching user ${id}`);
    return { id: parseInt(id), name: body.name || 'Patched' };
  }

  @Delete('users/:id')
  deleteUser(@Param('id') id: string): { success: boolean; id: number } {
    this.logger.log(`Deleting user ${id}`);
    return { success: true, id: parseInt(id) };
  }

  @Get('error')
  throwError(): void {
    this.logger.warn('About to throw an error');
    throw new Error('Test error for NestLens');
  }

  @Post('graphql')
  graphql(@Body() body: { query: string; variables?: Record<string, unknown> }): unknown {
    this.logger.log(`GraphQL query: ${body.query.substring(0, 50)}...`);
    if (body.query.includes('users')) {
      return { data: { users: [{ id: 1, name: 'Alice' }, { id: 2, name: 'Bob' }] } };
    }
    if (body.query.includes('user')) {
      return { data: { user: { id: 1, name: 'Alice' } } };
    }
    return { data: null };
  }

  // === Status Code Test Endpoints ===

  @Post('status/created')
  created(@Res() res: Response): void {
    this.logger.log('201 Created');
    res.status(HttpStatus.CREATED).json({ message: 'Resource created' });
  }

  @Get('status/no-content')
  noContent(@Res() res: Response): void {
    this.logger.log('204 No Content');
    res.status(HttpStatus.NO_CONTENT).send();
  }

  @Get('status/redirect')
  redirect(@Res() res: Response): void {
    this.logger.log('302 Redirect');
    res.redirect('/');
  }

  @Get('status/redirect-permanent')
  redirectPermanent(@Res() res: Response): void {
    this.logger.log('301 Permanent Redirect');
    res.redirect(HttpStatus.MOVED_PERMANENTLY, '/');
  }

  @Get('status/not-modified')
  notModified(@Res() res: Response): void {
    this.logger.log('304 Not Modified');
    res.status(HttpStatus.NOT_MODIFIED).send();
  }

  @Get('status/bad-request')
  badRequest(): void {
    this.logger.warn('400 Bad Request');
    throw new BadRequestException('Invalid request parameters');
  }

  @Get('status/unauthorized')
  unauthorized(): void {
    this.logger.warn('401 Unauthorized');
    throw new UnauthorizedException('Authentication required');
  }

  @Get('status/forbidden')
  forbidden(): void {
    this.logger.warn('403 Forbidden');
    throw new ForbiddenException('Access denied');
  }

  @Get('status/not-found')
  notFound(): void {
    this.logger.warn('404 Not Found');
    throw new NotFoundException('Resource not found');
  }

  @Post('status/validation-error')
  validationError(@Body() body: { email?: string }): void {
    this.logger.warn('400 Validation Error');
    if (!body.email || !body.email.includes('@')) {
      throw new BadRequestException('Invalid email format');
    }
  }

  @Get('status/internal-error')
  internalError(): void {
    this.logger.error('500 Internal Server Error');
    throw new Error('Internal server error occurred');
  }

  @Get('status/slow')
  async slow(): Promise<{ message: string; duration: number }> {
    const duration = 1000 + Math.random() * 2000;
    this.logger.warn(`Slow request: ${duration}ms`);
    await new Promise(resolve => setTimeout(resolve, duration));
    return { message: 'Slow response', duration };
  }

  // ============================================
  // TEST ENDPOINTS FOR ALL ENTRY TYPES
  // ============================================

  // === QUERY TEST ENDPOINTS ===
  @Post('test/query')
  async testQuery(@Body() body: { type?: string }): Promise<{ success: boolean }> {
    const queries = [
      { query: 'SELECT * FROM users WHERE id = $1', params: [1], duration: 5 },
      { query: 'SELECT * FROM orders WHERE user_id = $1 AND status = $2', params: [42, 'pending'], duration: 12 },
      { query: 'INSERT INTO logs (message, level, created_at) VALUES ($1, $2, NOW())', params: ['User logged in', 'info'], duration: 3 },
      { query: 'UPDATE products SET stock = stock - $1 WHERE id = $2', params: [1, 123], duration: 8 },
      { query: 'DELETE FROM sessions WHERE expires_at < NOW()', params: [], duration: 45 },
      { query: 'SELECT u.*, COUNT(o.id) as order_count FROM users u LEFT JOIN orders o ON u.id = o.user_id GROUP BY u.id HAVING COUNT(o.id) > $1', params: [5], duration: 250 },
    ];

    const slowQueries = [
      { query: 'SELECT * FROM products p JOIN categories c ON p.category_id = c.id JOIN inventory i ON p.id = i.product_id WHERE p.active = true', params: [], duration: 1500 },
      { query: 'SELECT * FROM analytics WHERE date BETWEEN $1 AND $2 ORDER BY views DESC', params: ['2024-01-01', '2024-12-31'], duration: 2300 },
    ];

    const queryList = body.type === 'slow' ? slowQueries : queries;
    const selected = queryList[Math.floor(Math.random() * queryList.length)];

    await this.collector.collect('query', {
      query: selected.query,
      parameters: selected.params,
      duration: selected.duration + Math.floor(Math.random() * 20),
      slow: selected.duration > 100,
      source: ['typeorm', 'prisma', 'raw'][Math.floor(Math.random() * 3)],
      connection: 'default',
    });

    return { success: true };
  }

  // === CACHE TEST ENDPOINTS ===
  @Post('test/cache')
  async testCache(@Body() body: { operation?: string }): Promise<{ success: boolean }> {
    const operations: Array<{ operation: 'get' | 'set' | 'del' | 'clear'; key: string; hit?: boolean; value?: unknown; ttl?: number }> = [
      { operation: 'get', key: 'user:123', hit: true, value: { id: 123, name: 'John' } },
      { operation: 'get', key: 'user:456', hit: false },
      { operation: 'get', key: 'session:abc123', hit: true, value: { userId: 1, role: 'admin' } },
      { operation: 'set', key: 'user:789', value: { id: 789, name: 'Jane' }, ttl: 3600 },
      { operation: 'set', key: 'products:featured', value: [1, 2, 3, 4, 5], ttl: 600 },
      { operation: 'del', key: 'user:expired' },
      { operation: 'del', key: 'temp:data:old' },
      { operation: 'clear', key: 'cache:*' },
    ];

    const op = body.operation
      ? operations.find(o => o.operation === body.operation) || operations[0]
      : operations[Math.floor(Math.random() * operations.length)];

    await this.collector.collect('cache', {
      operation: op.operation,
      key: op.key,
      hit: op.hit,
      value: op.value,
      ttl: op.ttl,
      duration: Math.floor(Math.random() * 10) + 1,
    });

    return { success: true };
  }

  // === EVENT TEST ENDPOINTS ===
  @Post('test/event')
  async testEvent(): Promise<{ success: boolean }> {
    const events = [
      { name: 'user.created', payload: { userId: 123, email: 'john@example.com' }, listeners: ['SendWelcomeEmail', 'CreateDefaultSettings', 'NotifyAdmins'] },
      { name: 'user.updated', payload: { userId: 123, changes: ['email', 'name'] }, listeners: ['AuditLogger', 'SyncExternalServices'] },
      { name: 'order.placed', payload: { orderId: 456, total: 99.99 }, listeners: ['SendConfirmationEmail', 'UpdateInventory', 'NotifyWarehouse', 'CalculateCommission'] },
      { name: 'order.shipped', payload: { orderId: 456, trackingNumber: 'ABC123' }, listeners: ['SendShippingNotification', 'UpdateOrderStatus'] },
      { name: 'payment.received', payload: { paymentId: 789, amount: 150.00 }, listeners: ['UpdateAccountBalance', 'GenerateInvoice', 'SendReceipt'] },
      { name: 'product.viewed', payload: { productId: 321, userId: 123 }, listeners: ['UpdateViewCount', 'AddToRecentlyViewed'] },
      { name: 'auth.login', payload: { userId: 123, ip: '192.168.1.1' }, listeners: ['LogLoginAttempt', 'UpdateLastSeen', 'CheckSuspiciousActivity'] },
      { name: 'auth.logout', payload: { userId: 123 }, listeners: ['ClearSession', 'LogLogout'] },
    ];

    const event = events[Math.floor(Math.random() * events.length)];

    await this.collector.collect('event', {
      name: event.name,
      payload: event.payload,
      listeners: event.listeners,
      duration: Math.floor(Math.random() * 50) + 5,
    });

    return { success: true };
  }

  // === JOB TEST ENDPOINTS ===
  @Post('test/job')
  async testJob(@Body() body: { status?: string }): Promise<{ success: boolean }> {
    const jobs = [
      { name: 'SendEmail', queue: 'emails', data: { to: 'user@example.com', template: 'welcome' } },
      { name: 'ProcessImage', queue: 'media', data: { imageId: 123, operations: ['resize', 'compress'] } },
      { name: 'GenerateReport', queue: 'reports', data: { reportType: 'monthly', month: '2024-01' } },
      { name: 'SyncInventory', queue: 'sync', data: { warehouseId: 5, products: [1, 2, 3] } },
      { name: 'SendNotification', queue: 'notifications', data: { userId: 456, message: 'Your order shipped!' } },
      { name: 'CleanupTempFiles', queue: 'maintenance', data: { olderThan: '7d' } },
      { name: 'ImportCSV', queue: 'imports', data: { fileId: 789, mapping: { col1: 'name', col2: 'email' } } },
      { name: 'ExportData', queue: 'exports', data: { format: 'xlsx', filters: { status: 'active' } } },
    ];

    const statuses: Array<'waiting' | 'active' | 'completed' | 'failed' | 'delayed'> = ['waiting', 'active', 'completed', 'failed', 'delayed'];
    const status = (body.status as typeof statuses[number]) || statuses[Math.floor(Math.random() * statuses.length)];
    const job = jobs[Math.floor(Math.random() * jobs.length)];

    await this.collector.collect('job', {
      name: job.name,
      queue: job.queue,
      data: job.data,
      status,
      attempts: status === 'failed' ? Math.floor(Math.random() * 3) + 1 : 1,
      duration: status === 'completed' || status === 'failed' ? Math.floor(Math.random() * 5000) + 100 : undefined,
      error: status === 'failed' ? 'Connection timeout after 30000ms' : undefined,
      result: status === 'completed' ? { processed: true, itemsAffected: Math.floor(Math.random() * 100) } : undefined,
    });

    return { success: true };
  }

  // === MAIL TEST ENDPOINTS ===
  @Post('test/mail')
  async testMail(@Body() body: { status?: string }): Promise<{ success: boolean }> {
    const mails = [
      { to: 'user@example.com', subject: 'Welcome to Our Platform!', from: 'noreply@myapp.com' },
      { to: 'customer@gmail.com', subject: 'Your Order #12345 Confirmation', from: 'orders@myapp.com' },
      { to: ['team@company.com', 'manager@company.com'], subject: 'Weekly Report - Week 52', from: 'reports@myapp.com', cc: 'archive@company.com' },
      { to: 'support@example.com', subject: 'Password Reset Request', from: 'security@myapp.com' },
      { to: 'newsletter@subscribers.com', subject: 'January Newsletter: New Features!', from: 'marketing@myapp.com', bcc: 'analytics@myapp.com' },
      { to: 'admin@myapp.com', subject: 'Alert: High CPU Usage Detected', from: 'monitoring@myapp.com' },
      { to: 'user123@example.com', subject: 'Your Invoice #INV-2024-001', from: 'billing@myapp.com' },
      { to: 'applicant@email.com', subject: 'Application Received - Software Engineer Position', from: 'hr@myapp.com' },
    ];

    const mail = mails[Math.floor(Math.random() * mails.length)];
    const status: 'sent' | 'failed' = body.status === 'failed' ? 'failed' : (Math.random() > 0.1 ? 'sent' : 'failed');

    await this.collector.collect('mail', {
      to: mail.to,
      subject: mail.subject,
      from: mail.from,
      cc: (mail as { cc?: string }).cc,
      bcc: (mail as { bcc?: string }).bcc,
      html: `<h1>${mail.subject}</h1><p>This is a test email.</p>`,
      status,
      error: status === 'failed' ? 'SMTP connection refused: Connection timeout' : undefined,
      duration: Math.floor(Math.random() * 500) + 50,
    });

    return { success: true };
  }

  // === SCHEDULE TEST ENDPOINTS ===
  @Post('test/schedule')
  async testSchedule(@Body() body: { status?: string }): Promise<{ success: boolean }> {
    const schedules = [
      { name: 'CleanupExpiredSessions', cron: '0 0 * * *', description: 'Daily at midnight' },
      { name: 'SendDailyDigest', cron: '0 8 * * *', description: 'Daily at 8 AM' },
      { name: 'RefreshMaterializedViews', cron: '*/15 * * * *', description: 'Every 15 minutes' },
      { name: 'BackupDatabase', cron: '0 2 * * *', description: 'Daily at 2 AM' },
      { name: 'SyncExternalAPI', interval: 300000, description: 'Every 5 minutes' },
      { name: 'CheckServiceHealth', interval: 60000, description: 'Every minute' },
      { name: 'GenerateReports', cron: '0 6 * * 1', description: 'Every Monday at 6 AM' },
      { name: 'PruneOldLogs', cron: '0 3 * * 0', description: 'Every Sunday at 3 AM' },
      { name: 'UpdateSearchIndex', interval: 1800000, description: 'Every 30 minutes' },
      { name: 'ProcessPendingWebhooks', interval: 10000, description: 'Every 10 seconds' },
    ];

    const statuses: Array<'started' | 'completed' | 'failed'> = ['started', 'completed', 'failed'];
    const status = (body.status as typeof statuses[number]) || statuses[Math.floor(Math.random() * statuses.length)];
    const schedule = schedules[Math.floor(Math.random() * schedules.length)];

    const nextRun = new Date();
    nextRun.setHours(nextRun.getHours() + Math.floor(Math.random() * 24));

    await this.collector.collect('schedule', {
      name: schedule.name,
      cron: schedule.cron,
      interval: schedule.interval,
      status,
      duration: status !== 'started' ? Math.floor(Math.random() * 10000) + 100 : undefined,
      error: status === 'failed' ? 'Task execution timeout exceeded' : undefined,
      nextRun: nextRun.toISOString(),
    });

    return { success: true };
  }

  // === REDIS TEST ENDPOINTS ===
  @Post('test/redis')
  async testRedis(@Body() body: { command?: string }): Promise<{ success: boolean }> {
    const commands = [
      { command: 'get', args: ['session:user:123'], keyPattern: 'session:user:123', result: '{"userId":123}' },
      { command: 'get', args: ['cache:products:featured'], keyPattern: 'cache:products:featured', result: null },
      { command: 'set', args: ['session:user:456', '{"userId":456}', 'EX', 3600], keyPattern: 'session:user:456' },
      { command: 'hget', args: ['user:123', 'email'], keyPattern: 'user:123', result: 'john@example.com' },
      { command: 'hset', args: ['user:789', 'name', 'Jane Doe'], keyPattern: 'user:789' },
      { command: 'lpush', args: ['queue:emails', '{"to":"user@example.com"}'], keyPattern: 'queue:emails' },
      { command: 'rpop', args: ['queue:notifications'], keyPattern: 'queue:notifications', result: '{"type":"alert"}' },
      { command: 'del', args: ['temp:data:expired'], keyPattern: 'temp:data:expired', result: 1 },
      { command: 'expire', args: ['session:user:123', 7200], keyPattern: 'session:user:123', result: 1 },
      { command: 'incr', args: ['stats:page_views'], keyPattern: 'stats:page_views', result: 12345 },
      { command: 'zadd', args: ['leaderboard:weekly', 1500, 'user:123'], keyPattern: 'leaderboard:weekly', result: 1 },
      { command: 'mget', args: ['key1', 'key2', 'key3'], keyPattern: 'mget(3 keys)', result: ['val1', 'val2', null] },
    ];

    const selected = body.command
      ? commands.find(c => c.command === body.command!.toLowerCase()) || commands[0]
      : commands[Math.floor(Math.random() * commands.length)];

    await this.collector.collect('redis', {
      command: selected.command,
      args: selected.args,
      keyPattern: selected.keyPattern,
      duration: Math.floor(Math.random() * 5) + 1,
      status: 'success' as const,
      result: selected.result,
    });

    return { success: true };
  }

  // === MODEL TEST ENDPOINTS ===
  @Post('test/model')
  async testModel(@Body() body: { action?: string }): Promise<{ success: boolean }> {
    type ModelAction = 'find' | 'create' | 'update' | 'delete' | 'save';
    const actions: Array<{ action: ModelAction; entity: string; data?: unknown; where?: unknown; recordCount?: number }> = [
      { action: 'create', entity: 'User', data: { id: 123, name: 'John Doe', email: 'john@example.com' } },
      { action: 'update', entity: 'User', data: { name: 'John Updated' }, where: { id: 123 }, recordCount: 1 },
      { action: 'delete', entity: 'User', where: { id: 456 }, recordCount: 1 },
      { action: 'find', entity: 'Order', where: { userId: 123 }, recordCount: 5 },
      { action: 'create', entity: 'Order', data: { userId: 123, total: 99.99, status: 'pending' } },
      { action: 'update', entity: 'Order', data: { status: 'shipped' }, where: { id: 789 }, recordCount: 1 },
      { action: 'save', entity: 'Product', data: { id: 321, name: 'Widget Pro', price: 49.99, stock: 100 } },
      { action: 'find', entity: 'Product', where: { category: 'electronics' }, recordCount: 25 },
      { action: 'delete', entity: 'Session', where: { expiresAt: { $lt: new Date() } }, recordCount: 10 },
      { action: 'find', entity: 'Comment', where: { postId: 42 }, recordCount: 15 },
    ];

    const selected = body.action
      ? actions.find(a => a.action === body.action) || actions[0]
      : actions[Math.floor(Math.random() * actions.length)];

    await this.collector.collect('model', {
      action: selected.action,
      entity: selected.entity,
      source: (['typeorm', 'prisma'] as const)[Math.floor(Math.random() * 2)],
      duration: Math.floor(Math.random() * 50) + 5,
      recordCount: selected.recordCount,
      data: selected.data,
      where: selected.where,
    });

    return { success: true };
  }

  // === NOTIFICATION TEST ENDPOINTS ===
  @Post('test/notification')
  async testNotification(@Body() body: { type?: string }): Promise<{ success: boolean }> {
    type NotificationType = 'email' | 'sms' | 'push' | 'socket' | 'webhook';
    const notifications: Array<{ type: NotificationType; recipient: string | string[]; title: string; message: string; status: 'sent' | 'failed'; error?: string }> = [
      { type: 'email', recipient: 'john@example.com', title: 'Welcome!', message: 'Welcome to our platform', status: 'sent' },
      { type: 'email', recipient: 'user@example.com', title: 'Order Confirmation', message: 'Your order #12345 is confirmed', status: 'sent' },
      { type: 'email', recipient: 'invalid@', title: 'Password Reset', message: 'Reset your password', status: 'failed', error: 'Invalid email address' },
      { type: 'sms', recipient: '+1234567890', title: '2FA Code', message: 'Your code is 123456', status: 'sent' },
      { type: 'sms', recipient: '+0987654321', title: 'Delivery Update', message: 'Your package is on the way', status: 'sent' },
      { type: 'push', recipient: 'device_token_123', title: 'New Message', message: 'You have a new message from Jane', status: 'sent' },
      { type: 'push', recipient: ['token1', 'token2'], title: 'Promo Alert', message: '20% off today only!', status: 'sent' },
      { type: 'socket', recipient: 'user:123', title: 'Real-time Update', message: 'Data refreshed', status: 'sent' },
      { type: 'webhook', recipient: 'https://api.partner.com/webhook', title: 'Order Event', message: 'Order #999 created', status: 'sent' },
      { type: 'webhook', recipient: 'https://api.down.com/hook', title: 'Failed Hook', message: 'Order event', status: 'failed', error: 'Connection refused' },
    ];

    const selected = body.type
      ? notifications.find(n => n.type === body.type) || notifications[0]
      : notifications[Math.floor(Math.random() * notifications.length)];

    await this.collector.collect('notification', {
      type: selected.type,
      recipient: selected.recipient,
      title: selected.title,
      message: selected.message,
      status: selected.status,
      error: selected.error,
      duration: Math.floor(Math.random() * 200) + 10,
    });

    return { success: true };
  }

  // === VIEW TEST ENDPOINTS ===
  @Post('test/view')
  async testView(@Body() body: { format?: string }): Promise<{ success: boolean }> {
    type ViewFormat = 'html' | 'json' | 'xml' | 'pdf';
    const views: Array<{ template: string; format: ViewFormat; locals?: Record<string, unknown>; dataSize?: number; outputSize?: number }> = [
      { template: 'pages/home', format: 'html', locals: { title: 'Home', user: { name: 'John' } }, dataSize: 256, outputSize: 4096 },
      { template: 'pages/dashboard', format: 'html', locals: { title: 'Dashboard', stats: { users: 100 } }, dataSize: 512, outputSize: 8192 },
      { template: 'emails/welcome', format: 'html', locals: { userName: 'John' }, dataSize: 128, outputSize: 2048 },
      { template: 'api/users', format: 'json', locals: { users: [{ id: 1 }, { id: 2 }] }, dataSize: 64, outputSize: 256 },
      { template: 'api/products', format: 'json', locals: { products: [] }, dataSize: 32, outputSize: 128 },
      { template: 'exports/report', format: 'pdf', locals: { title: 'Monthly Report', data: {} }, dataSize: 1024, outputSize: 65536 },
      { template: 'feeds/rss', format: 'xml', locals: { items: [] }, dataSize: 256, outputSize: 4096 },
      { template: 'sitemap', format: 'xml', locals: { urls: [] }, dataSize: 128, outputSize: 2048 },
      { template: 'invoice/pdf', format: 'pdf', locals: { invoiceId: 'INV-001' }, dataSize: 512, outputSize: 32768 },
      { template: 'pages/error', format: 'html', locals: { errorCode: 404 }, dataSize: 64, outputSize: 1024 },
    ];

    const selected = body.format
      ? views.find(v => v.format === body.format) || views[0]
      : views[Math.floor(Math.random() * views.length)];

    await this.collector.collect('view', {
      template: selected.template,
      format: selected.format,
      duration: Math.floor(Math.random() * 50) + 5,
      status: 'rendered' as const,
      locals: selected.locals,
      dataSize: selected.dataSize,
      outputSize: selected.outputSize,
      cacheHit: Math.random() > 0.7,
    });

    return { success: true };
  }

  // === COMMAND TEST ENDPOINTS ===
  @Post('test/command')
  async testCommand(@Body() body: { status?: string }): Promise<{ success: boolean }> {
    type CommandStatus = 'executing' | 'completed' | 'failed';
    const commands: Array<{ name: string; handler?: string; payload?: unknown }> = [
      { name: 'db:migrate', handler: 'MigrationCommand', payload: { force: true } },
      { name: 'db:seed', handler: 'SeederCommand', payload: { class: 'UserSeeder' } },
      { name: 'cache:clear', handler: 'CacheCommand', payload: {} },
      { name: 'queue:work', handler: 'QueueCommand', payload: { queue: 'emails', tries: 3 } },
      { name: 'user:create', handler: 'UserCommand', payload: { email: 'admin@example.com', admin: true } },
      { name: 'report:generate', handler: 'ReportCommand', payload: { type: 'monthly', format: 'pdf' } },
      { name: 'storage:link', handler: 'StorageCommand' },
      { name: 'config:cache', handler: 'ConfigCommand' },
      { name: 'route:list', handler: 'RouteCommand', payload: { json: true } },
      { name: 'backup:run', handler: 'BackupCommand', payload: { onlyDb: true } },
    ];

    const statuses: CommandStatus[] = ['executing', 'completed', 'failed'];
    const statusMap: Record<string, CommandStatus> = { running: 'executing', completed: 'completed', failed: 'failed' };
    const status: CommandStatus = body.status ? (statusMap[body.status] || 'completed') : statuses[Math.floor(Math.random() * statuses.length)];
    const selected = commands[Math.floor(Math.random() * commands.length)];

    await this.collector.collect('command', {
      name: selected.name,
      handler: selected.handler,
      status,
      payload: selected.payload,
      result: status === 'completed' ? { success: true, message: 'Command executed successfully' } : undefined,
      error: status === 'failed' ? 'Command failed with exit code 1' : undefined,
      duration: status !== 'executing' ? Math.floor(Math.random() * 5000) + 100 : undefined,
    });

    return { success: true };
  }

  // === GATE TEST ENDPOINTS ===
  @Post('test/gate')
  async testGate(@Body() body: { result?: string }): Promise<{ success: boolean }> {
    const gates: Array<{ gate: string; action: string; subject?: string; userId?: string | number; allowed: boolean; reason?: string; context?: Record<string, unknown> }> = [
      { gate: 'admin', action: 'access', subject: 'AdminPanel', userId: 1, allowed: true },
      { gate: 'admin', action: 'access', subject: 'AdminPanel', userId: 123, allowed: false, reason: 'User is not an administrator' },
      { gate: 'post.update', action: 'update', subject: 'Post:42', userId: 123, allowed: true, context: { postId: 42 } },
      { gate: 'post.update', action: 'update', subject: 'Post:42', userId: 456, allowed: false, reason: 'User is not the author' },
      { gate: 'post.delete', action: 'delete', subject: 'Post:42', userId: 1, allowed: true },
      { gate: 'comment.create', action: 'create', subject: 'Comment', userId: 789, allowed: true },
      { gate: 'premium.access', action: 'access', subject: 'PremiumContent', userId: 456, allowed: false, reason: 'Subscription required' },
      { gate: 'file.download', action: 'download', subject: 'File:123', userId: 123, allowed: true },
      { gate: 'order.refund', action: 'refund', subject: 'Order:999', userId: 123, allowed: false, reason: 'Refund window expired' },
      { gate: 'api.access', action: 'access', subject: 'API', allowed: false, reason: 'Authentication required' },
    ];

    const selected = body.result === 'denied'
      ? gates.filter(g => !g.allowed)[Math.floor(Math.random() * gates.filter(g => !g.allowed).length)]
      : gates[Math.floor(Math.random() * gates.length)];

    await this.collector.collect('gate', {
      gate: selected.gate,
      action: selected.action,
      subject: selected.subject,
      userId: selected.userId,
      allowed: selected.allowed,
      reason: selected.reason,
      duration: Math.floor(Math.random() * 5) + 1,
      context: selected.context,
    });

    return { success: true };
  }

  // === BATCH TEST ENDPOINTS ===
  @Post('test/batch')
  async testBatch(@Body() body: { status?: string }): Promise<{ success: boolean }> {
    const batches = [
      { name: 'ImportUsers', operation: 'import', totalItems: 1000, batchSize: 100 },
      { name: 'ExportOrders', operation: 'export', totalItems: 5000, batchSize: 500 },
      { name: 'SendNewsletters', operation: 'send', totalItems: 10000, batchSize: 100 },
      { name: 'ProcessPayments', operation: 'process', totalItems: 250, batchSize: 50 },
      { name: 'UpdatePrices', operation: 'update', totalItems: 2000, batchSize: 200 },
      { name: 'SyncInventory', operation: 'sync', totalItems: 800, batchSize: 100 },
      { name: 'GenerateReports', operation: 'generate', totalItems: 12, batchSize: 4 },
      { name: 'CleanupRecords', operation: 'delete', totalItems: 5000, batchSize: 1000 },
    ];

    const statuses: Array<'completed' | 'partial' | 'failed'> = ['completed', 'partial', 'failed'];
    const status = (body.status as typeof statuses[number]) || statuses[Math.floor(Math.random() * statuses.length)];
    const selected = batches[Math.floor(Math.random() * batches.length)];

    const processedItems = status === 'completed'
      ? selected.totalItems
      : Math.floor(selected.totalItems * (0.3 + Math.random() * 0.5));
    const failedItems = status === 'failed'
      ? selected.totalItems - processedItems
      : status === 'partial'
        ? Math.floor(Math.random() * 50) + 10
        : 0;

    await this.collector.collect('batch', {
      name: selected.name,
      operation: selected.operation,
      totalItems: selected.totalItems,
      processedItems,
      failedItems,
      batchSize: selected.batchSize,
      status,
      duration: Math.floor(Math.random() * 30000) + 1000,
      errors: failedItems > 0 ? ['Some items failed to process', 'Validation errors occurred'] : undefined,
      memory: Math.floor(Math.random() * 100) + 20,
    });

    return { success: true };
  }

  // === DUMP TEST ENDPOINTS ===
  @Post('test/dump')
  async testDump(@Body() body: { status?: string }): Promise<{ success: boolean }> {
    type DumpOperation = 'export' | 'import' | 'backup' | 'restore' | 'migrate';
    type DumpFormat = 'sql' | 'json' | 'csv' | 'binary';
    const dumps: Array<{ operation: DumpOperation; format: DumpFormat; source?: string; destination?: string; recordCount?: number; compressed?: boolean; encrypted?: boolean }> = [
      { operation: 'export', format: 'json', source: 'users', destination: '/tmp/users.json', recordCount: 1500 },
      { operation: 'export', format: 'csv', source: 'orders', destination: '/tmp/orders.csv', recordCount: 5000 },
      { operation: 'backup', format: 'sql', source: 'database', destination: '/backups/db.sql', recordCount: 25000, compressed: true },
      { operation: 'import', format: 'json', source: '/tmp/products.json', destination: 'products', recordCount: 800 },
      { operation: 'import', format: 'csv', source: '/tmp/customers.csv', destination: 'customers', recordCount: 3000 },
      { operation: 'restore', format: 'sql', source: '/backups/db.sql', destination: 'database', recordCount: 25000 },
      { operation: 'backup', format: 'binary', source: 'database', destination: '/backups/db.bin', compressed: true, encrypted: true },
      { operation: 'migrate', format: 'sql', source: 'old_db', destination: 'new_db', recordCount: 50000 },
    ];

    const statuses: Array<'completed' | 'failed'> = ['completed', 'failed'];
    const statusMap: Record<string, 'completed' | 'failed'> = { success: 'completed', completed: 'completed', failed: 'failed' };
    const status = body.status ? (statusMap[body.status] || 'completed') : (Math.random() > 0.1 ? 'completed' : 'failed');
    const selected = dumps[Math.floor(Math.random() * dumps.length)];

    await this.collector.collect('dump', {
      operation: selected.operation,
      format: selected.format,
      source: selected.source,
      destination: selected.destination,
      recordCount: selected.recordCount,
      fileSize: (selected.recordCount || 1000) * (50 + Math.floor(Math.random() * 100)),
      status,
      compressed: selected.compressed,
      encrypted: selected.encrypted,
      error: status === 'failed' ? 'File write permission denied' : undefined,
      duration: Math.floor(Math.random() * 10000) + 500,
    });

    return { success: true };
  }

  // === HTTP CLIENT TEST ENDPOINTS ===
  @Post('test/http-client')
  async testHttpClient(@Body() body: { status?: string }): Promise<{ success: boolean }> {
    interface HttpClientTestRequest {
      method: string;
      url: string;
      hostname: string;
      path: string;
      statusCode?: number;
      error?: string;
    }

    const requests: HttpClientTestRequest[] = [
      { method: 'GET', url: 'https://api.example.com/users', hostname: 'api.example.com', path: '/users', statusCode: 200 },
      { method: 'POST', url: 'https://api.stripe.com/v1/charges', hostname: 'api.stripe.com', path: '/v1/charges', statusCode: 201 },
      { method: 'GET', url: 'https://api.github.com/repos/nestjs/nest', hostname: 'api.github.com', path: '/repos/nestjs/nest', statusCode: 200 },
      { method: 'PUT', url: 'https://api.sendgrid.com/v3/mail/send', hostname: 'api.sendgrid.com', path: '/v3/mail/send', statusCode: 202 },
      { method: 'DELETE', url: 'https://api.cloudflare.com/client/v4/zones/123', hostname: 'api.cloudflare.com', path: '/client/v4/zones/123', statusCode: 204 },
      { method: 'GET', url: 'https://api.openai.com/v1/models', hostname: 'api.openai.com', path: '/v1/models', statusCode: 200 },
      { method: 'POST', url: 'https://api.twilio.com/2010-04-01/Accounts/123/Messages', hostname: 'api.twilio.com', path: '/2010-04-01/Accounts/123/Messages', statusCode: 201 },
      { method: 'GET', url: 'https://api.weather.gov/points/39.7456,-97.0892', hostname: 'api.weather.gov', path: '/points/39.7456,-97.0892', statusCode: 200 },
    ];

    const errorRequests: HttpClientTestRequest[] = [
      { method: 'GET', url: 'https://api.example.com/not-found', hostname: 'api.example.com', path: '/not-found', statusCode: 404, error: 'Not Found' },
      { method: 'POST', url: 'https://api.stripe.com/v1/charges', hostname: 'api.stripe.com', path: '/v1/charges', statusCode: 400, error: 'Invalid card number' },
      { method: 'GET', url: 'https://api.unavailable.com/status', hostname: 'api.unavailable.com', path: '/status', statusCode: 503, error: 'Service Unavailable' },
      { method: 'POST', url: 'https://api.timeout.com/slow', hostname: 'api.timeout.com', path: '/slow', error: 'ETIMEDOUT: Connection timed out' },
    ];

    const requestList = body.status === 'error' ? errorRequests : requests;
    const selected = requestList[Math.floor(Math.random() * requestList.length)];

    await this.collector.collect('http-client', {
      method: selected.method,
      url: selected.url,
      hostname: selected.hostname,
      path: selected.path,
      requestHeaders: {
        'Content-Type': 'application/json',
        'Authorization': '***',
        'User-Agent': 'NestJS-App/1.0',
      },
      requestBody: selected.method !== 'GET' ? { data: 'test-payload' } : undefined,
      statusCode: selected.statusCode,
      responseHeaders: selected.statusCode ? {
        'Content-Type': 'application/json',
        'X-Request-Id': `req-${Math.random().toString(36).substr(2, 9)}`,
      } : undefined,
      responseBody: selected.statusCode && selected.statusCode < 400 ? { success: true, data: {} } : undefined,
      duration: Math.floor(Math.random() * 500) + 50,
      error: selected.error,
    });

    return { success: true };
  }

  // === BATCH TEST ENDPOINT ===
  @Post('test/all')
  async testAll(): Promise<{ success: boolean; generated: Record<string, number> }> {
    const counts = {
      query: 0, cache: 0, event: 0, job: 0, mail: 0, schedule: 0, httpClient: 0,
      redis: 0, model: 0, notification: 0, view: 0, command: 0, gate: 0, batch: 0, dump: 0
    };

    // Generate multiple entries of each type
    for (let i = 0; i < 5; i++) {
      await this.testQuery({ type: i === 0 ? 'slow' : undefined });
      counts.query++;
    }

    for (let i = 0; i < 8; i++) {
      await this.testCache({});
      counts.cache++;
    }

    for (let i = 0; i < 6; i++) {
      await this.testEvent();
      counts.event++;
    }

    for (let i = 0; i < 10; i++) {
      await this.testJob({});
      counts.job++;
    }

    for (let i = 0; i < 5; i++) {
      await this.testMail({});
      counts.mail++;
    }

    for (let i = 0; i < 6; i++) {
      await this.testSchedule({});
      counts.schedule++;
    }

    for (let i = 0; i < 8; i++) {
      await this.testHttpClient({ status: i < 2 ? 'error' : undefined });
      counts.httpClient++;
    }

    // New entry types
    for (let i = 0; i < 10; i++) {
      await this.testRedis({});
      counts.redis++;
    }

    for (let i = 0; i < 8; i++) {
      await this.testModel({});
      counts.model++;
    }

    for (let i = 0; i < 10; i++) {
      await this.testNotification({});
      counts.notification++;
    }

    for (let i = 0; i < 8; i++) {
      await this.testView({});
      counts.view++;
    }

    for (let i = 0; i < 6; i++) {
      await this.testCommand({});
      counts.command++;
    }

    for (let i = 0; i < 8; i++) {
      await this.testGate({});
      counts.gate++;
    }

    for (let i = 0; i < 5; i++) {
      await this.testBatch({});
      counts.batch++;
    }

    for (let i = 0; i < 5; i++) {
      await this.testDump({});
      counts.dump++;
    }

    return { success: true, generated: counts };
  }
}

@Module({
  imports: [
    NestLensModule.forRoot({
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
      },
    }),
  ],
  controllers: [AppController],
})
class AppModule {}

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });

  // Use NestLensLogger to capture all logs
  const nestLensLogger = app.get(NestLensLogger);
  app.useLogger(nestLensLogger);

  await app.listen(3000);
  console.log('Application running on http://localhost:3000');
  console.log('NestLens dashboard: http://localhost:3000/nestlens');
}

bootstrap();
