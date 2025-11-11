import { spawn } from 'child_process';
import { randomUUID } from 'crypto';
import { JobManager } from './jobManager.js';

export class Worker {
  constructor(name = null) {
    this.id = name || `worker-${randomUUID()}`;
    this.jobManager = new JobManager();
    this.running = false;
    this.currentJob = null;
    this.pollInterval = 1000;
  }

  async start() {
    this.running = true;
    console.log(`[${this.id}] Worker started`);

    process.on('SIGINT', () => this.stop());
    process.on('SIGTERM', () => this.stop());

    while (this.running) {
      try {
        const job = this.jobManager.acquireNextJob(this.id);
        
        if (job) {
          this.currentJob = job;
          await this.executeJob(job);
          this.currentJob = null;
        } else {
          await this.sleep(this.pollInterval);
        }
      } catch (error) {
        console.error(`[${this.id}] Error:`, error.message);
        await this.sleep(this.pollInterval);
      }
    }

    console.log(`[${this.id}] Worker stopped`);
  }

  async executeJob(job) {
    console.log(`[${this.id}] Processing job ${job.id}: ${job.command}`);

    try {
      const output = await this.runCommand(job.command);
      this.jobManager.completeJob(job.id, output);
      console.log(`[${this.id}] Job ${job.id} completed successfully`);
    } catch (error) {
      console.error(`[${this.id}] Job ${job.id} failed:`, error.message);
      this.jobManager.failJob(job.id, error.message);
      
      const updatedJob = this.jobManager.getJob(job.id);
      if (updatedJob.state === 'dead') {
        console.log(`[${this.id}] Job ${job.id} moved to DLQ after ${updatedJob.attempts} attempts`);
      } else {
        const delay = Math.pow(job.backoff_base, updatedJob.attempts);
        console.log(`[${this.id}] Job ${job.id} will retry in ${delay}s (attempt ${updatedJob.attempts}/${job.max_retries})`);
      }
    }
  }

  runCommand(command) {
    return new Promise((resolve, reject) => {
      const [cmd, ...args] = command.split(' ');
      
      const child = spawn(cmd, args, {
        shell: true,
        timeout: 300000
      });

      let output = '';
      let errorOutput = '';

      child.stdout.on('data', (data) => {
        output += data.toString();
      });

      child.stderr.on('data', (data) => {
        errorOutput += data.toString();
      });

      child.on('close', (code) => {
        if (code === 0) {
          resolve(output.trim());
        } else {
          reject(new Error(`Command exited with code ${code}: ${errorOutput || output}`));
        }
      });

      child.on('error', (error) => {
        reject(new Error(`Failed to execute command: ${error.message}`));
      });
    });
  }

  stop() {
    console.log(`[${this.id}] Shutdown signal received`);
    this.running = false;
    
    if (this.currentJob) {
      console.log(`[${this.id}] Waiting for current job to finish...`);
    }
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
