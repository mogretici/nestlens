#!/bin/bash

# NestLens Comprehensive Test Data Generator
# Generates test data for ALL 19 entry types with multiple cases

BASE_URL="${1:-http://localhost:3000}"

echo "========================================"
echo "NestLens Test Data Generator"
echo "========================================"
echo "Base URL: $BASE_URL"
echo ""

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
MAGENTA='\033[0;35m'
NC='\033[0m'

req() {
  local method=$1
  local path=$2
  local data=$3
  if [ -n "$data" ]; then
    curl -s -X "$method" "$BASE_URL$path" -H "Content-Type: application/json" -d "$data" > /dev/null 2>&1
  else
    curl -s -X "$method" "$BASE_URL$path" > /dev/null 2>&1
  fi
}

# ==========================================
# 1. REQUESTS - HTTP Status Code Variety
# ==========================================
echo -e "${GREEN}[1/19] REQUESTS${NC}"

echo -n "  200 OK: "
req GET "/" && req GET "/users" && req GET "/users/1" && echo "3 sent"

echo -n "  201 Created: "
req POST "/status/created" && req POST "/status/created" && echo "2 sent"

echo -n "  204 No Content: "
req GET "/status/no-content" && req GET "/status/no-content" && echo "2 sent"

echo -n "  301/302 Redirect: "
req GET "/status/redirect-permanent" && req GET "/status/redirect" && echo "2 sent"

echo -n "  304 Not Modified: "
req GET "/status/not-modified" && req GET "/status/not-modified" && echo "2 sent"

echo -n "  400 Bad Request: "
req GET "/status/bad-request" && req GET "/status/bad-request" && req POST "/status/validation-error" '{"email":"invalid"}' && echo "3 sent"

echo -n "  401 Unauthorized: "
req GET "/status/unauthorized" && req GET "/status/unauthorized" && req GET "/status/unauthorized" && echo "3 sent"

echo -n "  403 Forbidden: "
req GET "/status/forbidden" && req GET "/status/forbidden" && echo "2 sent"

echo -n "  404 Not Found: "
req GET "/status/not-found" && req GET "/status/not-found" && req GET "/nonexistent" && echo "3 sent"

echo -n "  500 Internal Error: "
req GET "/status/internal-error" && req GET "/error" && req GET "/status/internal-error" && echo "3 sent"

echo -n "  Slow Requests: "
req GET "/status/slow" &
req GET "/status/slow" &
wait
echo "2 sent"

echo -n "  Various Methods: "
req POST "/users" '{"name":"Test"}' && req PUT "/users/1" '{"name":"Updated"}' && req PATCH "/users/1" '{"name":"Patched"}' && req DELETE "/users/1" && echo "4 sent"

# ==========================================
# 2. QUERIES - SQL Types & Performance
# ==========================================
echo ""
echo -e "${BLUE}[2/19] QUERIES${NC}"

echo -n "  SELECT queries: "
req POST "/test/query" '{"type":"select"}' && req POST "/test/query" '{"type":"select"}' && req POST "/test/query" '{"type":"select"}' && echo "3 sent"

echo -n "  INSERT queries: "
req POST "/test/query" '{"type":"insert"}' && req POST "/test/query" '{"type":"insert"}' && echo "2 sent"

echo -n "  UPDATE queries: "
req POST "/test/query" '{"type":"update"}' && req POST "/test/query" '{"type":"update"}' && echo "2 sent"

echo -n "  DELETE queries: "
req POST "/test/query" '{"type":"delete"}' && req POST "/test/query" '{"type":"delete"}' && echo "2 sent"

echo -n "  SLOW queries (>100ms): "
req POST "/test/query" '{"type":"slow"}' && req POST "/test/query" '{"type":"slow"}' && req POST "/test/query" '{"type":"slow"}' && echo "3 sent"

# ==========================================
# 3. GRAPHQL - Operations & Errors
# ==========================================
echo ""
echo -e "${MAGENTA}[3/19] GRAPHQL${NC}"

echo -n "  Named Queries: "
req POST "/graphql" '{"query":"query GetUsers { users { id name email } }","operationName":"GetUsers"}'
req POST "/graphql" '{"query":"query GetUser($id: ID!) { user(id: $id) { id name } }","operationName":"GetUser","variables":{"id":"1"}}'
req POST "/graphql" '{"query":"query GetProducts { products { id name price } }","operationName":"GetProducts"}'
echo "3 sent"

echo -n "  Anonymous Queries: "
req POST "/graphql" '{"query":"{ users { id } }"}'
req POST "/graphql" '{"query":"{ products { id price } }"}'
echo "2 sent"

echo -n "  Mutations: "
req POST "/graphql" '{"query":"mutation CreateUser($input: CreateUserInput!) { createUser(input: $input) { id name } }","operationName":"CreateUser","variables":{"input":{"name":"Test","email":"test@test.com"}}}'
req POST "/graphql" '{"query":"mutation UpdateProduct($id: ID!, $input: UpdateProductInput!) { updateProduct(id: $id, input: $input) { id } }","operationName":"UpdateProduct","variables":{"id":"1","input":{"price":99.99}}}'
req POST "/graphql" '{"query":"mutation { placeOrder(items: [\"1\", \"2\"]) { id total } }"}'
echo "3 sent"

echo -n "  N+1 Detection: "
req POST "/graphql" '{"query":"query Deep { users { id posts { id title author { name } } } }","operationName":"Deep"}'
req POST "/graphql" '{"query":"query OrdersDeep { orders { id items { product { name } } } }","operationName":"OrdersDeep"}'
echo "2 sent"

echo -n "  Errors: "
req POST "/graphql" '{"query":"{ users { invalidField } }"}'
req POST "/graphql" '{"query":"query Bad($id: ID!) { user(id: $id) { name } }","operationName":"Bad"}'
req POST "/graphql" '{"query":"{ syntax error }"}'
echo "3 sent"

# ==========================================
# 4. EXCEPTIONS - Error Types
# ==========================================
echo ""
echo -e "${RED}[4/19] EXCEPTIONS${NC}"
echo "  (Generated from request errors above)"

# ==========================================
# 5. LOGS - Log Levels
# ==========================================
echo ""
echo -e "${GREEN}[5/19] LOGS${NC}"
echo "  (Generated automatically from all requests)"

# ==========================================
# 6. JOBS - Queue Statuses
# ==========================================
echo ""
echo -e "${YELLOW}[6/19] JOBS${NC}"

echo -n "  Completed jobs: "
req POST "/test/job" '{"status":"completed"}' && req POST "/test/job" '{"status":"completed"}' && req POST "/test/job" '{"status":"completed"}' && echo "3 sent"

echo -n "  Waiting jobs: "
req POST "/test/job" '{"status":"waiting"}' && req POST "/test/job" '{"status":"waiting"}' && echo "2 sent"

echo -n "  Active jobs: "
req POST "/test/job" '{"status":"active"}' && req POST "/test/job" '{"status":"active"}' && echo "2 sent"

echo -n "  Failed jobs: "
req POST "/test/job" '{"status":"failed"}' && req POST "/test/job" '{"status":"failed"}' && req POST "/test/job" '{"status":"failed"}' && echo "3 sent"

echo -n "  Delayed jobs: "
req POST "/test/job" '{"status":"delayed"}' && req POST "/test/job" '{"status":"delayed"}' && echo "2 sent"

# ==========================================
# 7. SCHEDULE - Task Statuses
# ==========================================
echo ""
echo -e "${BLUE}[7/19] SCHEDULE${NC}"

echo -n "  Completed tasks: "
req POST "/test/schedule" '{"status":"completed"}' && req POST "/test/schedule" '{"status":"completed"}' && req POST "/test/schedule" '{"status":"completed"}' && echo "3 sent"

echo -n "  Started tasks: "
req POST "/test/schedule" '{"status":"started"}' && req POST "/test/schedule" '{"status":"started"}' && echo "2 sent"

echo -n "  Failed tasks: "
req POST "/test/schedule" '{"status":"failed"}' && req POST "/test/schedule" '{"status":"failed"}' && echo "2 sent"

# ==========================================
# 8. BATCH - Batch Statuses
# ==========================================
echo ""
echo -e "${MAGENTA}[8/19] BATCH${NC}"

echo -n "  Completed batches: "
req POST "/test/batch" '{"status":"completed"}' && req POST "/test/batch" '{"status":"completed"}' && req POST "/test/batch" '{"status":"completed"}' && echo "3 sent"

echo -n "  Partial batches: "
req POST "/test/batch" '{"status":"partial"}' && req POST "/test/batch" '{"status":"partial"}' && echo "2 sent"

echo -n "  Failed batches: "
req POST "/test/batch" '{"status":"failed"}' && req POST "/test/batch" '{"status":"failed"}' && echo "2 sent"

# ==========================================
# 9. COMMAND - CLI Statuses
# ==========================================
echo ""
echo -e "${WHITE}[9/19] COMMAND${NC}"

echo -n "  Completed commands: "
req POST "/test/command" '{"status":"completed"}' && req POST "/test/command" '{"status":"completed"}' && req POST "/test/command" '{"status":"completed"}' && echo "3 sent"

echo -n "  Running commands: "
req POST "/test/command" '{"status":"running"}' && req POST "/test/command" '{"status":"running"}' && echo "2 sent"

echo -n "  Failed commands: "
req POST "/test/command" '{"status":"failed"}' && req POST "/test/command" '{"status":"failed"}' && echo "2 sent"

# ==========================================
# 10. CACHE - Operations & Hit/Miss
# ==========================================
echo ""
echo -e "${CYAN}[10/19] CACHE${NC}"

echo -n "  GET (hit): "
req POST "/test/cache" '{"operation":"get","hit":true}' && req POST "/test/cache" '{"operation":"get","hit":true}' && req POST "/test/cache" '{"operation":"get","hit":true}' && echo "3 sent"

echo -n "  GET (miss): "
req POST "/test/cache" '{"operation":"get","hit":false}' && req POST "/test/cache" '{"operation":"get","hit":false}' && echo "2 sent"

echo -n "  SET: "
req POST "/test/cache" '{"operation":"set"}' && req POST "/test/cache" '{"operation":"set"}' && req POST "/test/cache" '{"operation":"set"}' && echo "3 sent"

echo -n "  DEL: "
req POST "/test/cache" '{"operation":"del"}' && req POST "/test/cache" '{"operation":"del"}' && echo "2 sent"

echo -n "  CLEAR: "
req POST "/test/cache" '{"operation":"clear"}' && echo "1 sent"

# ==========================================
# 11. REDIS - Command Types
# ==========================================
echo ""
echo -e "${RED}[11/19] REDIS${NC}"

echo -n "  String (GET/SET): "
req POST "/test/redis" '{"command":"GET"}' && req POST "/test/redis" '{"command":"SET"}' && req POST "/test/redis" '{"command":"INCR"}' && echo "3 sent"

echo -n "  Hash (HGET/HSET): "
req POST "/test/redis" '{"command":"HGET"}' && req POST "/test/redis" '{"command":"HSET"}' && req POST "/test/redis" '{"command":"HGETALL"}' && echo "3 sent"

echo -n "  List (LPUSH/RPOP): "
req POST "/test/redis" '{"command":"LPUSH"}' && req POST "/test/redis" '{"command":"RPOP"}' && req POST "/test/redis" '{"command":"LRANGE"}' && echo "3 sent"

echo -n "  Set (SADD/SMEMBERS): "
req POST "/test/redis" '{"command":"SADD"}' && req POST "/test/redis" '{"command":"SMEMBERS"}' && echo "2 sent"

echo -n "  Key (DEL/EXPIRE): "
req POST "/test/redis" '{"command":"DEL"}' && req POST "/test/redis" '{"command":"EXPIRE"}' && req POST "/test/redis" '{"command":"TTL"}' && echo "3 sent"

# ==========================================
# 12. MODEL - CRUD Actions
# ==========================================
echo ""
echo -e "${GREEN}[12/19] MODEL${NC}"

echo -n "  Create: "
req POST "/test/model" '{"action":"create"}' && req POST "/test/model" '{"action":"create"}' && req POST "/test/model" '{"action":"create"}' && echo "3 sent"

echo -n "  Find: "
req POST "/test/model" '{"action":"find"}' && req POST "/test/model" '{"action":"find"}' && echo "2 sent"

echo -n "  Update: "
req POST "/test/model" '{"action":"update"}' && req POST "/test/model" '{"action":"update"}' && echo "2 sent"

echo -n "  Delete: "
req POST "/test/model" '{"action":"delete"}' && req POST "/test/model" '{"action":"delete"}' && echo "2 sent"

echo -n "  Save: "
req POST "/test/model" '{"action":"save"}' && req POST "/test/model" '{"action":"save"}' && echo "2 sent"

# ==========================================
# 13. HTTP CLIENT - Success & Errors
# ==========================================
echo ""
echo -e "${CYAN}[13/19] HTTP CLIENT${NC}"

echo -n "  Success (2xx): "
req POST "/test/http-client" '{}' && req POST "/test/http-client" '{}' && req POST "/test/http-client" '{}' && echo "3 sent"

echo -n "  Errors (4xx/5xx): "
req POST "/test/http-client" '{"status":"error"}' && req POST "/test/http-client" '{"status":"error"}' && req POST "/test/http-client" '{"status":"error"}' && echo "3 sent"

# ==========================================
# 14. MAIL - Sent & Failed
# ==========================================
echo ""
echo -e "${MAGENTA}[14/19] MAIL${NC}"

echo -n "  Sent: "
req POST "/test/mail" '{"status":"sent"}' && req POST "/test/mail" '{"status":"sent"}' && req POST "/test/mail" '{"status":"sent"}' && echo "3 sent"

echo -n "  Failed: "
req POST "/test/mail" '{"status":"failed"}' && req POST "/test/mail" '{"status":"failed"}' && echo "2 sent"

# ==========================================
# 15. NOTIFICATION - Channels & Status
# ==========================================
echo ""
echo -e "${ORANGE}[15/19] NOTIFICATION${NC}"

echo -n "  Email: "
req POST "/test/notification" '{"type":"email"}' && req POST "/test/notification" '{"type":"email"}' && echo "2 sent"

echo -n "  SMS: "
req POST "/test/notification" '{"type":"sms"}' && req POST "/test/notification" '{"type":"sms"}' && echo "2 sent"

echo -n "  Push: "
req POST "/test/notification" '{"type":"push"}' && req POST "/test/notification" '{"type":"push"}' && echo "2 sent"

echo -n "  Webhook: "
req POST "/test/notification" '{"type":"webhook"}' && req POST "/test/notification" '{"type":"webhook"}' && echo "2 sent"

echo -n "  Socket: "
req POST "/test/notification" '{"type":"socket"}' && echo "1 sent"

# ==========================================
# 16. EVENT - Event Types
# ==========================================
echo ""
echo -e "${MAGENTA}[16/19] EVENT${NC}"

echo -n "  User events: "
req POST "/test/event" '{"name":"user.created"}' && req POST "/test/event" '{"name":"user.updated"}' && req POST "/test/event" '{"name":"user.deleted"}' && echo "3 sent"

echo -n "  Order events: "
req POST "/test/event" '{"name":"order.placed"}' && req POST "/test/event" '{"name":"order.shipped"}' && echo "2 sent"

echo -n "  Auth events: "
req POST "/test/event" '{"name":"auth.login"}' && req POST "/test/event" '{"name":"auth.logout"}' && echo "2 sent"

echo -n "  Payment events: "
req POST "/test/event" '{"name":"payment.received"}' && req POST "/test/event" '{"name":"payment.refunded"}' && echo "2 sent"

# ==========================================
# 17. VIEW - Formats & Templates
# ==========================================
echo ""
echo -e "${BLUE}[17/19] VIEW${NC}"

echo -n "  HTML views: "
req POST "/test/view" '{"format":"html"}' && req POST "/test/view" '{"format":"html"}' && req POST "/test/view" '{"format":"html"}' && echo "3 sent"

echo -n "  JSON views: "
req POST "/test/view" '{"format":"json"}' && req POST "/test/view" '{"format":"json"}' && echo "2 sent"

echo -n "  PDF views: "
req POST "/test/view" '{"format":"pdf"}' && req POST "/test/view" '{"format":"pdf"}' && echo "2 sent"

echo -n "  XML views: "
req POST "/test/view" '{"format":"xml"}' && req POST "/test/view" '{"format":"xml"}' && echo "2 sent"

# ==========================================
# 18. GATE - Allowed & Denied
# ==========================================
echo ""
echo -e "${YELLOW}[18/19] GATE${NC}"

echo -n "  Allowed: "
req POST "/test/gate" '{"result":"allowed"}' && req POST "/test/gate" '{"result":"allowed"}' && req POST "/test/gate" '{"result":"allowed"}' && echo "3 sent"

echo -n "  Denied: "
req POST "/test/gate" '{"result":"denied"}' && req POST "/test/gate" '{"result":"denied"}' && req POST "/test/gate" '{"result":"denied"}' && echo "3 sent"

# ==========================================
# 19. DUMP - Operations
# ==========================================
echo ""
echo -e "${CYAN}[19/19] DUMP${NC}"

echo -n "  Export: "
req POST "/test/dump" '{"operation":"export"}' && req POST "/test/dump" '{"operation":"export"}' && echo "2 sent"

echo -n "  Import: "
req POST "/test/dump" '{"operation":"import"}' && req POST "/test/dump" '{"operation":"import"}' && echo "2 sent"

echo -n "  Backup: "
req POST "/test/dump" '{"operation":"backup"}' && req POST "/test/dump" '{"operation":"backup"}' && echo "2 sent"

echo -n "  Failed: "
req POST "/test/dump" '{"status":"failed"}' && req POST "/test/dump" '{"status":"failed"}' && echo "2 sent"

# ==========================================
# Done - Fetch Stats
# ==========================================
echo ""
echo "========================================"
echo "Done! Fetching stats..."
echo "========================================"
sleep 1

curl -s "$BASE_URL/__nestlens__/api/stats" | python3 -c "
import json, sys
try:
    data = json.load(sys.stdin).get('data', {})
    by_type = data.get('byType', {})
    print(f'''
Summary:
  Total entries: {data.get('total', 0)}

  By Type:
    Requests:      {by_type.get('request', 0):>4}    Queries:       {by_type.get('query', 0):>4}    GraphQL:       {by_type.get('graphql', 0):>4}
    Exceptions:    {by_type.get('exception', 0):>4}    Logs:          {by_type.get('log', 0):>4}    Jobs:          {by_type.get('job', 0):>4}
    Schedule:      {by_type.get('schedule', 0):>4}    Batch:         {by_type.get('batch', 0):>4}    Command:       {by_type.get('command', 0):>4}
    Cache:         {by_type.get('cache', 0):>4}    Redis:         {by_type.get('redis', 0):>4}    Model:         {by_type.get('model', 0):>4}
    HTTP Client:   {by_type.get('http-client', 0):>4}    Mail:          {by_type.get('mail', 0):>4}    Notification:  {by_type.get('notification', 0):>4}
    Event:         {by_type.get('event', 0):>4}    View:          {by_type.get('view', 0):>4}    Gate:          {by_type.get('gate', 0):>4}
    Dump:          {by_type.get('dump', 0):>4}
''')
except Exception as e:
    print(f'Could not parse stats: {e}')
"

echo "Dashboard: $BASE_URL/nestlens"
