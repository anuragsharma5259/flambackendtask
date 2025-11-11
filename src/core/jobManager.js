import db from '../storage/database.js';
import { randomUUID } from 'crypto';

export class JobManager {
  constructor() {
    this.insertJob = db.prepare(`
      INSERT INTO jobs (id, command, state, attempts, max_retries, backoff_base, priority, created_at, updated_at, scheduled_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    this.updateJob = db.prepare(`
      UPDATE jobs 
      SET state = ?, attempts = ?, updated_at = ?, locked_by = ?, locked_at = ?, error_message = ?, output = ?, scheduled_at = ?
      WHERE id = ?
    `);

    this.getJobById = db.prepare('SELECT * FROM jobs WHERE id = ?');
    this.getAllJobs = db.prepare('SELECT * FROM jobs ORDER BY created_at DESC');
    this.getJobsByState = db.prepare('SELECT * FROM jobs WHERE state = ? ORDER BY priority DESC, created_at ASC');
    this.deleteJob = db.prepare('DELETE FROM jobs WHERE id = ?');
  }

  enqueue(command, options = {}) {
    const now = new Date().toISOString();
    const job = {
      id: randomUUID(),
      command,
      state: 'pending',
      attempts: 0,
      max_retries: options.maxRetries || 3,
      backoff_base: options.backoffBase || 2,
      priority: options.priority || 0,
      created_at: now,
      updated_at: now,
      scheduled_at: options.scheduledAt || null
    };

    this.insertJob.run(
      job.id,
      job.command,
      job.state,
      job.attempts,
      job.max_retries,
      job.backoff_base,
      job.priority,
      job.created_at,
      job.updated_at,
      job.scheduled_at
    );

    return job;
  }

  acquireNextJob(workerId) {
    const transaction = db.transaction(() => {
      const now = new Date().toISOString();
      
      const job = db.prepare(`
        SELECT * FROM jobs 
        WHERE state = 'pending' 
        AND (scheduled_at IS NULL OR scheduled_at <= ?)
        AND (locked_by IS NULL OR locked_at < datetime('now', '-5 minutes'))
        ORDER BY priority DESC, created_at ASC
        LIMIT 1
      `).get(now);

      if (!job) return null;

      this.updateJob.run(
        'processing',
        job.attempts,
        now,
        workerId,
        now,
        null,
        null,
        job.scheduled_at,
        job.id
      );

      return { ...job, state: 'processing', locked_by: workerId, locked_at: now };
    });

    return transaction();
  }

  completeJob(jobId, output = '') {
    const now = new Date().toISOString();
    this.updateJob.run('completed', null, now, null, null, null, output, null, jobId);
  }

  failJob(jobId, errorMessage) {
    const job = this.getJobById.get(jobId);
    if (!job) return;

    const now = new Date().toISOString();
    const newAttempts = job.attempts + 1;

    if (newAttempts >= job.max_retries) {
      this.updateJob.run('dead', newAttempts, now, null, null, errorMessage, null, null, jobId);
    } else {
      const delay = Math.pow(job.backoff_base, newAttempts);
      const scheduledAt = new Date(Date.now() + delay * 1000).toISOString();
      
      this.updateJob.run('pending', newAttempts, now, null, null, errorMessage, null, scheduledAt, jobId);
    }
  }

  getJob(jobId) {
    return this.getJobById.get(jobId);
  }

  listJobs(filter = {}) {
    if (filter.state) {
      return this.getJobsByState.all(filter.state);
    }
    return this.getAllJobs.all();
  }

  remove(jobId) {
    this.deleteJob.run(jobId);
  }

  getStats() {
    const stats = db.prepare(`
      SELECT 
        state,
        COUNT(*) as count
      FROM jobs
      GROUP BY state
    `).all();

    const result = {
      pending: 0,
      processing: 0,
      completed: 0,
      failed: 0,
      dead: 0
    };

    stats.forEach(s => {
      result[s.state] = s.count;
    });

    return result;
  }
}
