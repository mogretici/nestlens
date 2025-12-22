#!/bin/bash

# NestLens Test Request Generator
# Generates test data for ALL 18 entry types

BASE_URL="${1:-http://localhost:3000}"
MULTIPLIER="${2:-1}"

echo "========================================"
echo "NestLens Test Request Generator"
echo "========================================"
echo "Base URL: $BASE_URL"
echo "Multiplier: ${MULTIPLIER}x"
echo ""

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
MAGENTA='\033[0;35m'
WHITE='\033[1;37m'
NC='\033[0m' # No Color

send_request() {
  local method=$1
  local path=$2
  local data=$3

  if [ -n "$data" ]; then
    curl -s -X "$method" "$BASE_URL$path" -H "Content-Type: application/json" -d "$data" > /dev/null 2>&1
  else
    curl -s -X "$method" "$BASE_URL$path" > /dev/null 2>&1
  fi
}

run_batch() {
  # ==========================================
  # 1. REQUESTS
  # ==========================================
  echo -e "${GREEN}[1/18] REQUESTS${NC}"

  echo -n "  GET requests: "
  for i in {1..10}; do
    send_request GET "/"
    send_request GET "/users"
    send_request GET "/users/$((RANDOM % 100 + 1))"
  done
  echo "30 sent"

  echo -n "  POST requests: "
  for i in {1..5}; do
    send_request POST "/users" '{"name":"User'$RANDOM'"}'
    send_request POST "/status/created"
    send_request POST "/graphql" '{"query":"query { users { id name } }"}'
  done
  echo "15 sent"

  echo -n "  PUT/PATCH/DELETE: "
  for i in {1..3}; do
    send_request PUT "/users/$i" '{"name":"Updated'$i'"}'
    send_request PATCH "/users/$i" '{"name":"Patched'$i'"}'
  done
  send_request DELETE "/users/$((RANDOM % 100 + 1))"
  send_request DELETE "/users/$((RANDOM % 100 + 1))"
  echo "8 sent"

  # ==========================================
  # 2. QUERIES
  # ==========================================
  echo ""
  echo -e "${BLUE}[2/18] QUERIES${NC}"

  echo -n "  Normal queries: "
  for i in {1..8}; do
    send_request POST "/test/query" '{}'
  done
  echo "8 sent"

  echo -n "  Slow queries: "
  for i in {1..3}; do
    send_request POST "/test/query" '{"type":"slow"}'
  done
  echo "3 sent"

  # ==========================================
  # 3. EXCEPTIONS
  # ==========================================
  echo ""
  echo -e "${RED}[3/18] EXCEPTIONS${NC}"

  echo -n "  4xx Client Errors: "
  for i in {1..3}; do
    send_request GET "/status/bad-request"
    send_request GET "/status/not-found"
  done
  send_request GET "/status/unauthorized"
  send_request GET "/status/forbidden"
  echo "8 sent"

  echo -n "  5xx Server Errors: "
  for i in {1..4}; do
    send_request GET "/error"
    send_request GET "/status/internal-error"
  done
  echo "8 sent"

  # ==========================================
  # 4. LOGS (generated via Logger in requests)
  # ==========================================
  echo ""
  echo -e "${GREEN}[4/18] LOGS${NC}"
  echo "  (Logs are automatically captured from other requests)"

  # ==========================================
  # 5. EVENTS
  # ==========================================
  echo ""
  echo -e "${MAGENTA}[5/18] EVENTS${NC}"

  echo -n "  Events: "
  for i in {1..10}; do
    send_request POST "/test/event" '{}'
  done
  echo "10 sent"

  # ==========================================
  # 6. JOBS
  # ==========================================
  echo ""
  echo -e "${YELLOW}[6/18] JOBS${NC}"

  echo -n "  Waiting jobs: "
  for i in {1..3}; do
    send_request POST "/test/job" '{"status":"waiting"}'
  done
  echo "3 sent"

  echo -n "  Active jobs: "
  for i in {1..2}; do
    send_request POST "/test/job" '{"status":"active"}'
  done
  echo "2 sent"

  echo -n "  Completed jobs: "
  for i in {1..5}; do
    send_request POST "/test/job" '{"status":"completed"}'
  done
  echo "5 sent"

  echo -n "  Failed jobs: "
  for i in {1..3}; do
    send_request POST "/test/job" '{"status":"failed"}'
  done
  echo "3 sent"

  echo -n "  Delayed jobs: "
  for i in {1..2}; do
    send_request POST "/test/job" '{"status":"delayed"}'
  done
  echo "2 sent"

  # ==========================================
  # 7. CACHE
  # ==========================================
  echo ""
  echo -e "${CYAN}[7/18] CACHE${NC}"

  echo -n "  Cache GET (hit/miss): "
  for i in {1..5}; do
    send_request POST "/test/cache" '{"operation":"get"}'
  done
  echo "5 sent"

  echo -n "  Cache SET: "
  for i in {1..4}; do
    send_request POST "/test/cache" '{"operation":"set"}'
  done
  echo "4 sent"

  echo -n "  Cache DEL/CLEAR: "
  for i in {1..3}; do
    send_request POST "/test/cache" '{"operation":"del"}'
  done
  send_request POST "/test/cache" '{"operation":"clear"}'
  echo "4 sent"

  # ==========================================
  # 8. MAIL
  # ==========================================
  echo ""
  echo -e "${MAGENTA}[8/18] MAIL${NC}"

  echo -n "  Sent mails: "
  for i in {1..8}; do
    send_request POST "/test/mail" '{"status":"sent"}'
  done
  echo "8 sent"

  echo -n "  Failed mails: "
  for i in {1..2}; do
    send_request POST "/test/mail" '{"status":"failed"}'
  done
  echo "2 sent"

  # ==========================================
  # 9. SCHEDULE
  # ==========================================
  echo ""
  echo -e "${BLUE}[9/18] SCHEDULE${NC}"

  echo -n "  Started tasks: "
  for i in {1..3}; do
    send_request POST "/test/schedule" '{"status":"started"}'
  done
  echo "3 sent"

  echo -n "  Completed tasks: "
  for i in {1..5}; do
    send_request POST "/test/schedule" '{"status":"completed"}'
  done
  echo "5 sent"

  echo -n "  Failed tasks: "
  for i in {1..2}; do
    send_request POST "/test/schedule" '{"status":"failed"}'
  done
  echo "2 sent"

  # ==========================================
  # 10. HTTP CLIENT
  # ==========================================
  echo ""
  echo -e "${CYAN}[10/18] HTTP CLIENT${NC}"

  echo -n "  Successful API calls: "
  for i in {1..8}; do
    send_request POST "/test/http-client" '{}'
  done
  echo "8 sent"

  echo -n "  Failed API calls: "
  for i in {1..4}; do
    send_request POST "/test/http-client" '{"status":"error"}'
  done
  echo "4 sent"

  # ==========================================
  # 11. REDIS
  # ==========================================
  echo ""
  echo -e "${RED}[11/18] REDIS${NC}"

  echo -n "  Redis GET: "
  for i in {1..4}; do
    send_request POST "/test/redis" '{"command":"get"}'
  done
  echo "4 sent"

  echo -n "  Redis SET: "
  for i in {1..3}; do
    send_request POST "/test/redis" '{"command":"set"}'
  done
  echo "3 sent"

  echo -n "  Redis HASH: "
  for i in {1..3}; do
    send_request POST "/test/redis" '{"command":"hget"}'
    send_request POST "/test/redis" '{"command":"hset"}'
  done
  echo "6 sent"

  echo -n "  Redis Lists/Other: "
  for i in {1..2}; do
    send_request POST "/test/redis" '{"command":"lpush"}'
    send_request POST "/test/redis" '{}'
  done
  echo "4 sent"

  # ==========================================
  # 12. MODELS
  # ==========================================
  echo ""
  echo -e "${GREEN}[12/18] MODELS${NC}"

  echo -n "  Model created: "
  for i in {1..5}; do
    send_request POST "/test/model" '{"action":"created"}'
  done
  echo "5 sent"

  echo -n "  Model updated: "
  for i in {1..4}; do
    send_request POST "/test/model" '{"action":"updated"}'
  done
  echo "4 sent"

  echo -n "  Model deleted: "
  for i in {1..3}; do
    send_request POST "/test/model" '{"action":"deleted"}'
  done
  echo "3 sent"

  # ==========================================
  # 13. NOTIFICATIONS
  # ==========================================
  echo ""
  echo -e "${YELLOW}[13/18] NOTIFICATIONS${NC}"

  echo -n "  Email notifications: "
  for i in {1..4}; do
    send_request POST "/test/notification" '{"type":"email"}'
  done
  echo "4 sent"

  echo -n "  SMS notifications: "
  for i in {1..3}; do
    send_request POST "/test/notification" '{"type":"sms"}'
  done
  echo "3 sent"

  echo -n "  Push notifications: "
  for i in {1..3}; do
    send_request POST "/test/notification" '{"type":"push"}'
  done
  echo "3 sent"

  echo -n "  Other notifications: "
  for i in {1..4}; do
    send_request POST "/test/notification" '{}'
  done
  echo "4 sent"

  # ==========================================
  # 14. VIEWS
  # ==========================================
  echo ""
  echo -e "${BLUE}[14/18] VIEWS${NC}"

  echo -n "  View renders: "
  for i in {1..12}; do
    send_request POST "/test/view" '{}'
  done
  echo "12 sent"

  # ==========================================
  # 15. COMMANDS
  # ==========================================
  echo ""
  echo -e "${WHITE}[15/18] COMMANDS${NC}"

  echo -n "  Running commands: "
  for i in {1..2}; do
    send_request POST "/test/command" '{"status":"running"}'
  done
  echo "2 sent"

  echo -n "  Completed commands: "
  for i in {1..6}; do
    send_request POST "/test/command" '{"status":"completed"}'
  done
  echo "6 sent"

  echo -n "  Failed commands: "
  for i in {1..2}; do
    send_request POST "/test/command" '{"status":"failed"}'
  done
  echo "2 sent"

  # ==========================================
  # 16. GATES
  # ==========================================
  echo ""
  echo -e "${YELLOW}[16/18] GATES${NC}"

  echo -n "  Gate checks (mixed): "
  for i in {1..8}; do
    send_request POST "/test/gate" '{}'
  done
  echo "8 sent"

  echo -n "  Gate denials: "
  for i in {1..4}; do
    send_request POST "/test/gate" '{"result":"denied"}'
  done
  echo "4 sent"

  # ==========================================
  # 17. BATCHES
  # ==========================================
  echo ""
  echo -e "${MAGENTA}[17/18] BATCHES${NC}"

  echo -n "  Completed batches: "
  for i in {1..4}; do
    send_request POST "/test/batch" '{"status":"completed"}'
  done
  echo "4 sent"

  echo -n "  Partial batches: "
  for i in {1..2}; do
    send_request POST "/test/batch" '{"status":"partial"}'
  done
  echo "2 sent"

  echo -n "  Failed batches: "
  for i in {1..2}; do
    send_request POST "/test/batch" '{"status":"failed"}'
  done
  echo "2 sent"

  # ==========================================
  # 18. DUMPS
  # ==========================================
  echo ""
  echo -e "${CYAN}[18/18] DUMPS${NC}"

  echo -n "  Successful dumps: "
  for i in {1..6}; do
    send_request POST "/test/dump" '{"status":"success"}'
  done
  echo "6 sent"

  echo -n "  Failed dumps: "
  for i in {1..2}; do
    send_request POST "/test/dump" '{"status":"failed"}'
  done
  echo "2 sent"

  # ==========================================
  # SLOW REQUESTS (bonus)
  # ==========================================
  echo ""
  echo -e "${YELLOW}=== SLOW REQUESTS ===${NC}"

  echo -n "  Slow requests (1-3s): "
  for i in {1..2}; do
    send_request GET "/status/slow" &
  done
  wait
  echo "2 sent"
}

# Run batches based on multiplier
for ((m=1; m<=MULTIPLIER; m++)); do
  if [ "$MULTIPLIER" -gt 1 ]; then
    echo ""
    echo "========================================"
    echo "Batch $m of $MULTIPLIER"
    echo "========================================"
  fi
  run_batch
done

echo ""
echo "========================================"
echo "Done! Fetching stats..."
echo "========================================"
sleep 2

# Fetch and display stats
STATS=$(curl -s "$BASE_URL/__nestlens__/api/stats")
echo "$STATS" | python3 -c "
import json, sys
try:
    data = json.load(sys.stdin).get('data', {})
    by_type = data.get('byType', {})
    print(f'''
Summary:
  Total entries: {data.get('total', 0)}

  By Type:
    Requests:      {by_type.get('request', 0):>5}    HTTP Client:   {by_type.get('http-client', 0):>5}
    Queries:       {by_type.get('query', 0):>5}    Redis:         {by_type.get('redis', 0):>5}
    Exceptions:    {by_type.get('exception', 0):>5}    Models:        {by_type.get('model', 0):>5}
    Logs:          {by_type.get('log', 0):>5}    Notifications: {by_type.get('notification', 0):>5}
    Events:        {by_type.get('event', 0):>5}    Views:         {by_type.get('view', 0):>5}
    Jobs:          {by_type.get('job', 0):>5}    Commands:      {by_type.get('command', 0):>5}
    Cache:         {by_type.get('cache', 0):>5}    Gates:         {by_type.get('gate', 0):>5}
    Mail:          {by_type.get('mail', 0):>5}    Batches:       {by_type.get('batch', 0):>5}
    Schedule:      {by_type.get('schedule', 0):>5}    Dumps:         {by_type.get('dump', 0):>5}

  Avg Response Time: {data.get('avgResponseTime', 0):.2f}ms
''')
except Exception as e:
    print(f'Could not parse stats: {e}')
"

echo "Dashboard: $BASE_URL/nestlens"
