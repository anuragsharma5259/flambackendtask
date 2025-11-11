#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import { JobManager } from './core/jobManager.js';
import { Worker } from './core/worker.js';

const program = new Command();
const jobManager = new JobManager();

program
  .name('queuectl')
  .description('CLI-based background job queue system')
  .version('1.0.0');

program
  .command('enqueue <command>')
  .description('Add a new job to the queue')
  .option('-r, --retries <number>', 'Maximum retry attempts', '3')
  .option('-b, --backoff <number>', 'Backoff base for exponential retry', '2')
  .option('-p, --priority <number>', 'Job priority (higher = first)', '0')
  .option('-s, --schedule <iso-date>', 'Schedule job for later execution')
  .action((command, options) => {
    const job = jobManager.enqueue(command, {
      maxRetries: parseInt(options.retries),
      backoffBase: parseInt(options.backoff),
      priority: parseInt(options.priority),
      scheduledAt: options.schedule || null
    });

    console.log(chalk.green('✓ Job enqueued successfully'));
    console.log(chalk.gray('Job ID:'), job.id);
    console.log(chalk.gray('Command:'), job.command);
    console.log(chalk.gray('Max Retries:'), job.max_retries);
    if (job.scheduled_at) {
      console.log(chalk.gray('Scheduled At:'), job.scheduled_at);
    }
  });

program
  .command('status <job-id>')
  .description('Get the status of a specific job')
  .action((jobId) => {
    const job = jobManager.getJob(jobId);
    
    if (!job) {
      console.log(chalk.red('✗ Job not found'));
      return;
    }

    console.log(chalk.bold('\nJob Details:'));
    console.log(chalk.gray('ID:'), job.id);
    console.log(chalk.gray('Command:'), job.command);
    console.log(chalk.gray('State:'), getColoredState(job.state));
    console.log(chalk.gray('Attempts:'), `${job.attempts}/${job.max_retries}`);
    console.log(chalk.gray('Created:'), job.created_at);
    console.log(chalk.gray('Updated:'), job.updated_at);
    
    if (job.scheduled_at) {
      console.log(chalk.gray('Scheduled:'), job.scheduled_at);
    }
    if (job.locked_by) {
      console.log(chalk.gray('Locked By:'), job.locked_by);
    }
    if (job.error_message) {
      console.log(chalk.gray('Error:'), chalk.red(job.error_message));
    }
    if (job.output) {
      console.log(chalk.gray('Output:'), job.output);
    }
  });

program
  .command('list')
  .description('List all jobs or filter by state')
  .option('-s, --state <state>', 'Filter by state (pending|processing|completed|failed|dead)')
  .action((options) => {
    const jobs = jobManager.listJobs({ state: options.state });
    
    if (jobs.length === 0) {
      console.log(chalk.yellow('No jobs found'));
      return;
    }

    console.log(chalk.bold(`\nTotal Jobs: ${jobs.length}\n`));
    
    jobs.forEach(job => {
      console.log(chalk.gray('─'.repeat(60)));
      console.log(chalk.bold('ID:'), job.id.substring(0, 8));
      console.log(chalk.gray('Command:'), job.command);
      console.log(chalk.gray('State:'), getColoredState(job.state));
      console.log(chalk.gray('Attempts:'), `${job.attempts}/${job.max_retries}`);
      console.log(chalk.gray('Created:'), job.created_at);
    });
    console.log(chalk.gray('─'.repeat(60)));
  });

program
  .command('stats')
  .description('Show queue statistics')
  .action(() => {
    const stats = jobManager.getStats();
    
    console.log(chalk.bold('\n📊 Queue Statistics:\n'));
    console.log(chalk.cyan('Pending:'), stats.pending);
    console.log(chalk.blue('Processing:'), stats.processing);
    console.log(chalk.green('Completed:'), stats.completed);
    console.log(chalk.yellow('Failed:'), stats.failed);
    console.log(chalk.red('Dead (DLQ):'), stats.dead);
    console.log(chalk.bold('\nTotal:'), Object.values(stats).reduce((a, b) => a + b, 0));
  });

const workerCmd = program
  .command('worker')
  .description('Worker management commands');

workerCmd
  .command('start')
  .description('Start a worker process')
  .option('-n, --name <name>', 'Worker name')
  .action(async (options) => {
    const worker = new Worker(options.name);
    await worker.start();
  });

program
  .command('remove <job-id>')
  .description('Remove a job from the queue')
  .action((jobId) => {
    const job = jobManager.getJob(jobId);
    
    if (!job) {
      console.log(chalk.red('✗ Job not found'));
      return;
    }

    jobManager.remove(jobId);
    console.log(chalk.green('✓ Job removed successfully'));
  });

program
  .command('dlq')
  .description('List all jobs in Dead Letter Queue')
  .action(() => {
    const jobs = jobManager.listJobs({ state: 'dead' });
    
    if (jobs.length === 0) {
      console.log(chalk.yellow('No jobs in DLQ'));
      return;
    }

    console.log(chalk.bold.red(`\n☠️  Dead Letter Queue (${jobs.length} jobs)\n`));
    
    jobs.forEach(job => {
      console.log(chalk.gray('─'.repeat(60)));
      console.log(chalk.bold('ID:'), job.id.substring(0, 8));
      console.log(chalk.gray('Command:'), job.command);
      console.log(chalk.gray('Attempts:'), job.attempts);
      console.log(chalk.gray('Last Error:'), chalk.red(job.error_message || 'Unknown'));
      console.log(chalk.gray('Failed At:'), job.updated_at);
    });
    console.log(chalk.gray('─'.repeat(60)));
  });

function getColoredState(state) {
  const colors = {
    pending: chalk.cyan,
    processing: chalk.blue,
    completed: chalk.green,
    failed: chalk.yellow,
    dead: chalk.red
  };
  
  return (colors[state] || chalk.white)(state.toUpperCase());
}

program.parse();
