# queuectl - CLI Job Queue System 🚀

Production-grade background job queue with retry, exponential backoff, and Dead Letter Queue.

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Terminal 1 - Start Worker
node src/cli.js worker start --name worker-1

# 3. Terminal 2 - Add Jobs
node src/cli.js enqueue "echo Hello World"
node src/cli.js enqueue "ping -n 3 localhost"
node src/cli.js enqueue "exit 1" --retries 2

# 4. Monitor
node src/cli.js stats
node src/cli.js list
node src/cli.js dlq
```

## Features

✅ **SQLite Persistence** - Jobs survive restarts  
✅ **Multiple Workers** - Run concurrent workers  
✅ **Exponential Backoff** - `delay = base^attempts` seconds  
✅ **Dead Letter Queue** - Failed jobs after max retries  
✅ **Job Scheduling** - Delay execution  
✅ **Priority Queue** - Higher priority runs first  
✅ **Graceful Shutdown** - Workers finish current job  

## Commands

### Enqueue Job
```bash
node src/cli.js enqueue "<command>" [options]

Options:
  -r, --retries <number>   Max retry attempts (default: 3)
  -b, --backoff <number>   Backoff base (default: 2)
  -p, --priority <number>  Priority (default: 0)
  -s, --schedule <date>    Schedule for later (ISO 8601)
```

### Start Worker
```bash
node src/cli.js worker start [--name <worker-name>]
```

### Check Status
```bash
node src/cli.js status <job-id>
```

### List Jobs
```bash
node src/cli.js list [--state <pending|processing|completed|dead>]
```

### Statistics
```bash
node src/cli.js stats
```

### Dead Letter Queue
```bash
node src/cli.js dlq
```

### Remove Job
```bash
node src/cli.js remove <job-id>
```

## Architecture

**Job Lifecycle:**
```
userPrompt
Provide the fully rewritten file, incorporating the suggested code change. You must produce the complete file.
userPrompt
```
