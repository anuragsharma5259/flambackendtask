import { JobManager } from '../src/core/jobManager.js';
import { Worker } from '../src/core/worker.js';
import chalk from 'chalk';

class TestRunner {
  constructor() {
    this.passed = 0;
    this.failed = 0;
  }

  async test(name, fn) {
    try {
      await fn();
      console.log(chalk.green('✓'), name);
      this.passed++;
    } catch (error) {
      console.log(chalk.red('✗'), name);
      console.log(chalk.red('  Error:'), error.message);
      this.failed++;
    }
  }

  async sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  summary() {
    console.log(chalk.bold('\n' + '='.repeat(50)));
    console.log(chalk.bold('Test Summary:'));
    console.log(chalk.green('Passed:'), this.passed);
    console.log(chalk.red('Failed:'), this.failed);
    console.log(chalk.bold('='.repeat(50)));
    
    process.exit(this.failed > 0 ? 1 : 0);
  }
}

const runner = new TestRunner();
const jobManager = new JobManager();

console.log(chalk.bold('\n🧪 Running Integration Tests\n'));

// Test 1: Basic job completion
await runner.test('Basic job completes successfully', async () => {
  const job = jobManager.enqueue('echo "test success"');
  const worker = new Worker('test-worker-1');
  
  // Run one job
  const acquired = jobManager.acquireNextJob(worker.id);
  if (!acquired) throw new Error('Failed to acquire job');
  
  await worker.executeJob(acquired);
  
  const updated = jobManager.getJob(job.id);
  if (updated.state !== 'completed') {
    throw new Error(`Expected completed, got ${updated.state}`);
  }
});

// Test 2: Failed job with retry
await runner.test('Failed job retries with backoff', async () => {
  const job = jobManager.enqueue('exit 1', { maxRetries: 2, backoffBase: 2 });
  const worker = new Worker('test-worker-2');
  
  const acquired = jobManager.acquireNextJob(worker.id);
  await worker.executeJob(acquired);
  
  const updated = jobManager.getJob(job.id);
  if (updated.state !== 'pending') {
    throw new Error(`Expected pending (retry), got ${updated.state}`);
  }
  if (updated.attempts !== 1) {
    throw new Error(`Expected 1 attempt, got ${updated.attempts}`);
  }
  if (!updated.scheduled_at) {
    throw new Error('Expected scheduled_at for retry');
  }
});

// Test 3: Move to DLQ after max retries
await runner.test('Job moves to DLQ after max retries', async () => {
  const job = jobManager.enqueue('exit 1', { maxRetries: 1 });
  const worker = new Worker('test-worker-3');
  
  // First failure
  let acquired = jobManager.acquireNextJob(worker.id);
  await worker.executeJob(acquired);
  
  // Wait for scheduled retry
  await runner.sleep(3000);
  
  // Second failure (should move to DLQ)
  acquired = jobManager.acquireNextJob(worker.id);
  if (acquired) {
    await worker.executeJob(acquired);
  }
  
  const updated = jobManager.getJob(job.id);
  if (updated.state !== 'dead') {
    throw new Error(`Expected dead, got ${updated.state}`);
  }
});

// Test 4: Stats collection
await runner.test('Queue statistics are accurate', async () => {
  jobManager.enqueue('echo "pending1"');
  jobManager.enqueue('echo "pending2"');
  
  const stats = jobManager.getStats();
  if (stats.pending < 2) {
    throw new Error(`Expected at least 2 pending jobs, got ${stats.pending}`);
  }
});

// Test 5: Invalid command handling
await runner.test('Invalid commands fail gracefully', async () => {
  const job = jobManager.enqueue('nonexistentcommand12345');
  const worker = new Worker('test-worker-5');
  
  const acquired = jobManager.acquireNextJob(worker.id);
  await worker.executeJob(acquired);
  
  const updated = jobManager.getJob(job.id);
  if (updated.state === 'completed') {
    throw new Error('Invalid command should not complete');
  }
  if (!updated.error_message) {
    throw new Error('Expected error message');
  }
});

runner.summary();
