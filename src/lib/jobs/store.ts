import { connectDB, AgentJob, type JobStatus } from "@/lib/db";

export interface JobRecord {
  status: JobStatus;
  result: Record<string, unknown> | null;
  error: string | null;
  created_at: string;
}

export async function createJob(): Promise<string> {
  await connectDB();
  const job = await AgentJob.create({ status: "running" });
  return job._id.toString();
}

export async function completeJob(
  jobId: string,
  result: Record<string, unknown>
): Promise<void> {
  await connectDB();
  await AgentJob.findByIdAndUpdate(jobId, {
    status: "complete",
    result,
    error: null,
  });
}

export async function failJob(jobId: string, error: string): Promise<void> {
  await connectDB();
  await AgentJob.findByIdAndUpdate(jobId, {
    status: "error",
    error,
    result: null,
  });
}

export async function getJob(jobId: string): Promise<JobRecord | null> {
  await connectDB();
  const job = await AgentJob.findById(jobId).lean();
  if (!job) return null;
  return {
    status: job.status,
    result: (job.result as Record<string, unknown> | null) ?? null,
    error: job.error ?? null,
    created_at: job.createdAt.toISOString(),
  };
}