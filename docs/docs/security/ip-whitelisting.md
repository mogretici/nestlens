---
sidebar_position: 2
---

# IP Whitelisting

Restrict NestLens dashboard access to specific IP addresses or ranges for enhanced security.

## Overview

IP whitelisting allows you to:
- Limit access to office networks
- Restrict to VPN connections
- Allow specific development machines
- Support wildcard patterns for IP ranges

## Basic Configuration

### Single IP Address

Allow access from a single IP:

```typescript
NestLensModule.forRoot({
  authorization: {
    allowedIps: ['192.168.1.100'],
  },
})
```

### Multiple IP Addresses

Allow multiple specific IPs:

```typescript
NestLensModule.forRoot({
  authorization: {
    allowedIps: [
      '192.168.1.100',    // Office desktop
      '192.168.1.101',    // Office laptop
      '10.0.0.50',        // Home network
    ],
  },
})
```

### Localhost Access

Allow local development:

```typescript
NestLensModule.forRoot({
  authorization: {
    allowedIps: ['127.0.0.1', 'localhost', '::1'],
  },
})
```

NestLens automatically handles localhost variations:
- `127.0.0.1` (IPv4)
- `localhost` (hostname)
- `::1` (IPv6)
- `::ffff:127.0.0.1` (IPv4-mapped IPv6)

## Wildcard Patterns

Use wildcards to match IP ranges.

### Subnet Wildcards

Match entire subnets using `*`:

```typescript
NestLensModule.forRoot({
  authorization: {
    allowedIps: [
      '192.168.1.*',      // Matches 192.168.1.0-255
      '10.0.*.*',         // Matches 10.0.0.0-255.255
      '172.16.0.*',       // Matches 172.16.0.0-255
    ],
  },
})
```

### Pattern Examples

```typescript
// Office network (Class C)
'192.168.1.*'        // 192.168.1.0 - 192.168.1.255

// Office networks (Class B)
'192.168.*.*'        // 192.168.0.0 - 192.168.255.255

// Data center
'10.0.*.*'           // 10.0.0.0 - 10.0.255.255

// Specific subnet
'172.16.5.*'         // 172.16.5.0 - 172.16.5.255
```

## Environment Variables

Store IPs in environment variables for flexibility.

### Configuration

```typescript
NestLensModule.forRoot({
  authorization: {
    allowedIps: process.env.NESTLENS_ALLOWED_IPS?.split(','),
  },
})
```

### Environment File

```bash
# .env.development
NESTLENS_ALLOWED_IPS=127.0.0.1,localhost

# .env.staging
NESTLENS_ALLOWED_IPS=192.168.1.*,10.0.0.*

# .env.production
NESTLENS_ALLOWED_IPS=192.168.1.100,192.168.1.101
```

## Common Patterns

### Office + VPN Access

```typescript
NestLensModule.forRoot({
  authorization: {
    allowedIps: [
      '192.168.1.*',     // Office network
      '10.8.0.*',        // VPN range
      '203.0.113.50',    // Office public IP
    ],
  },
})
```

### Development + Staging

```typescript
NestLensModule.forRoot({
  authorization: {
    allowedIps: [
      'localhost',                                    // Local dev
      ...(process.env.NODE_ENV === 'staging'
        ? ['192.168.1.*']                            // Staging office
        : []),
    ],
  },
})
```

### Cloud Deployment

For cloud platforms with dynamic IPs:

```typescript
NestLensModule.forRoot({
  authorization: {
    // Don't rely solely on IP whitelisting
    // Use in combination with authentication
    allowedIps: process.env.ALLOWED_IPS?.split(','),
    canAccess: async (req) => {
      // Add authentication layer
      return await authService.isAuthorized(req);
    },
  },
})
```

## Proxy Considerations

### Behind Reverse Proxy

When behind nginx, Apache, or cloud load balancers:

```typescript
// main.ts
app.set('trust proxy', true);

// NestLens will automatically use X-Forwarded-For header
```

### X-Forwarded-For Header

NestLens automatically checks:

1. `X-Forwarded-For` header (if behind proxy)
2. `req.ip` from Express
3. `req.socket.remoteAddress` as fallback

### Multiple Proxies

If behind multiple proxies:

```typescript
// main.ts
app.set('trust proxy', 'loopback, linklocal, uniquelocal');
```

## Security Considerations

### 1. IP Spoofing Protection

NestLens uses safe IP extraction:

```typescript
// Automatically handles:
// - X-Forwarded-For header parsing
// - IPv6 normalization
// - Localhost variations
```

### 2. Wildcard Safety

Wildcard matching is safe from ReDoS attacks:

```typescript
// Uses simple string splitting, not regex
// No performance impact from complex patterns
```

### 3. Combined with Auth

IP whitelisting alone isn't sufficient for production:

```typescript
NestLensModule.forRoot({
  authorization: {
    allowedIps: ['192.168.1.*'],
    // ALSO require authentication
    canAccess: async (req) => {
      return await authService.authenticate(req);
    },
  },
})
```

## Testing IP Restrictions

### 1. Check Current IP

Add temporary logging:

```typescript
NestLensModule.forRoot({
  authorization: {
    canAccess: (req) => {
      console.log('Client IP:', req.ip);
      console.log('X-Forwarded-For:', req.headers['x-forwarded-for']);
      return true;
    },
  },
})
```

### 2. Test with cURL

```bash
# Test from allowed IP
curl http://localhost:3000/nestlens/api/entries

# Test from different IP (will fail if not whitelisted)
curl --interface 192.168.1.200 http://your-server/nestlens/api/entries
```

### 3. Test Behind Proxy

```bash
# Simulate proxy with X-Forwarded-For
curl -H "X-Forwarded-For: 192.168.1.100" http://localhost:3000/nestlens
```

## Dynamic IP Management

### Database-Backed Whitelist

For dynamic IP management:

```typescript
NestLensModule.forRoot({
  authorization: {
    canAccess: async (req) => {
      const clientIp = req.ip;

      // Check against database
      const isAllowed = await ipWhitelistService.isAllowed(clientIp);

      if (isAllowed) {
        return true;
      }

      // Log blocked attempt
      await auditLog.log({
        action: 'blocked_ip',
        ip: clientIp,
        timestamp: new Date(),
      });

      return false;
    },
  },
})
```

### IP Whitelist Service

```typescript
@Injectable()
export class IpWhitelistService {
  constructor(
    @InjectRepository(AllowedIp)
    private ipRepository: Repository<AllowedIp>,
  ) {}

  async isAllowed(ip: string): Promise<boolean> {
    const allowed = await this.ipRepository.findOne({
      where: { ip },
      cache: true,
    });

    return !!allowed;
  }

  async addIp(ip: string): Promise<void> {
    await this.ipRepository.insert({ ip });
  }

  async removeIp(ip: string): Promise<void> {
    await this.ipRepository.delete({ ip });
  }
}
```

## Advanced Patterns

### CIDR Notation Support

For precise subnet control, use custom logic:

```typescript
import { isIPv4 } from 'net';

function isIpInCIDR(ip: string, cidr: string): boolean {
  // Implementation of CIDR checking
  // Or use library like 'ip-range-check'
}

NestLensModule.forRoot({
  authorization: {
    canAccess: (req) => {
      const allowedCIDRs = [
        '192.168.1.0/24',
        '10.0.0.0/16',
      ];

      return allowedCIDRs.some(cidr =>
        isIpInCIDR(req.ip, cidr)
      );
    },
  },
})
```

### Time-Based IP Restrictions

Different IPs for different times:

```typescript
NestLensModule.forRoot({
  authorization: {
    canAccess: (req) => {
      const hour = new Date().getHours();
      const clientIp = req.ip;

      // Office hours: require office IP
      if (hour >= 9 && hour <= 17) {
        return clientIp.startsWith('192.168.1.');
      }

      // After hours: allow VPN
      return clientIp.startsWith('10.8.0.');
    },
  },
})
```

### Geographic IP Filtering

Use GeoIP database:

```typescript
import geoip from 'geoip-lite';

NestLensModule.forRoot({
  authorization: {
    canAccess: (req) => {
      const geo = geoip.lookup(req.ip);

      // Only allow specific countries
      return geo?.country === 'US' || geo?.country === 'CA';
    },
  },
})
```

## Troubleshooting

### IP Not Recognized

**Issue**: Access denied despite being on allowed IP

**Debug Steps**:

1. **Check Actual IP**:
   ```typescript
   console.log('Client IP:', req.ip);
   console.log('Headers:', req.headers);
   ```

2. **Verify Trust Proxy**:
   ```typescript
   // main.ts
   app.set('trust proxy', true);
   ```

3. **Check IPv6**:
   - IPv6 addresses might not match IPv4 patterns
   - Add both IPv4 and IPv6 versions

4. **Test Pattern**:
   ```typescript
   const testIp = '192.168.1.100';
   const pattern = '192.168.1.*';
   console.log('Match:', matchesPattern(testIp, pattern));
   ```

### Behind Load Balancer

**Issue**: All requests show load balancer IP

**Solution**:

```typescript
// main.ts
app.set('trust proxy', 'loopback, linklocal, uniquelocal');

// Or specific proxy IP
app.set('trust proxy', '10.0.0.1');
```

### Wildcard Not Working

**Issue**: Wildcard pattern not matching

**Verify**:

1. **Correct Format**: Use `*` not other wildcards
2. **Segments**: Each `*` matches one IP segment
3. **No CIDR**: Use `192.168.1.*` not `192.168.1.0/24`

**Correct**:
```typescript
allowedIps: ['192.168.1.*']     // ✓
allowedIps: ['192.168.*.*']     // ✓
```

**Incorrect**:
```typescript
allowedIps: ['192.168.1.0/24']  // ✗ Use custom function
allowedIps: ['192.168.1.%']     // ✗ Use *
```

## Best Practices

### 1. Use Environment-Specific IPs

```typescript
const allowedIps = {
  development: ['localhost', '127.0.0.1'],
  staging: ['192.168.1.*'],
  production: ['203.0.113.50', '203.0.113.51'],
};

NestLensModule.forRoot({
  authorization: {
    allowedIps: allowedIps[process.env.NODE_ENV] || [],
  },
})
```

### 2. Document IP Ranges

```typescript
NestLensModule.forRoot({
  authorization: {
    allowedIps: [
      '192.168.1.*',     // Office WiFi
      '192.168.2.*',     // Office Ethernet
      '10.8.0.*',        // OpenVPN
      '203.0.113.50',    // Office Public IP
    ],
  },
})
```

### 3. Combine with Other Security

```typescript
NestLensModule.forRoot({
  authorization: {
    // Layer 1: IP whitelist
    allowedIps: ['192.168.1.*'],

    // Layer 2: Authentication
    canAccess: async (req) => {
      return await authService.isAdmin(req);
    },
  },
})
```

### 4. Monitor Blocked Attempts

```typescript
// Log blocked IPs for security monitoring
NestLensModule.forRoot({
  authorization: {
    canAccess: (req) => {
      const isAllowed = checkIpWhitelist(req.ip);

      if (!isAllowed) {
        logger.warn('Blocked IP attempt', {
          ip: req.ip,
          path: req.path,
          userAgent: req.headers['user-agent'],
        });
      }

      return isAllowed;
    },
  },
})
```

### 5. Use Fail2Ban for Protection

Combine with system-level IP blocking:

```bash
# /etc/fail2ban/filter.d/nestlens.conf
[Definition]
failregex = ^.*Blocked IP attempt.*ip: <HOST>.*$
ignoreregex =
```

## Next Steps

- Learn about [Access Control](./access-control.md)
- Configure [Data Masking](./data-masking.md)
- Review [Production Usage](./production-usage.md)
