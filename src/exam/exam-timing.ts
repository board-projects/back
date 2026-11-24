import { BadRequestException, ForbiddenException } from '@nestjs/common';

export type ExamTiming = { opensAt?: string; closesAt?: string; durationMinutes?: number };

function parseDate(value: unknown): string | undefined {
  if (value === undefined) return;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) {
    throw new BadRequestException('Invalid exam date');
  }
  const date = new Date(value);
  if (!Number.isFinite(date.getTime()) || date.toISOString() !== value) throw new BadRequestException('Invalid exam date');
  return value;
}

export function parseExamTiming(value: unknown): ExamTiming {
  if (value === undefined) return {};
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new BadRequestException('Invalid exam timing');
  const input = value as Record<string, unknown>;
  const opensAt = parseDate(input.opensAt);
  const closesAt = parseDate(input.closesAt);
  const duration = input.durationMinutes;
  if (opensAt && closesAt && opensAt >= closesAt) throw new BadRequestException('The closing date must be after the opening date');
  if (duration !== undefined && (typeof duration !== 'number' || !Number.isInteger(duration) || duration < 1 || duration > 1440)) {
    throw new BadRequestException('Enter a duration from 1 to 1440 minutes');
  }
  return { ...(opensAt && { opensAt }), ...(closesAt && { closesAt }), ...(typeof duration === 'number' && { durationMinutes: duration }) };
}

export function examAccess(timing: ExamTiming, now: Date, startedAt?: Date) {
  const closesAt = timing.closesAt ? Date.parse(timing.closesAt) : Infinity;
  const timedEnd = timing.durationMinutes && startedAt ? startedAt.getTime() + timing.durationMinutes * 60_000 : Infinity;
  const end = Math.min(closesAt, timedEnd);
  const deadline = Number.isFinite(end) ? new Date(end).toISOString() : undefined;
  const status = now.getTime() >= end ? 'closed'
    : timing.opensAt && now.getTime() < Date.parse(timing.opensAt) ? 'scheduled'
    : timing.durationMinutes && !startedAt ? 'ready' : 'open';
  return { ...timing, status, deadline, serverNow: now.toISOString() };
}

export function requireOpenExam(access: ReturnType<typeof examAccess>, allowStart = false) {
  if (access.status === 'open' || (allowStart && access.status === 'ready')) return;
  if (access.status === 'scheduled') throw new ForbiddenException('The exam has not opened yet.');
  if (access.status === 'ready') throw new ForbiddenException('Start the exam before submitting.');
  throw new ForbiddenException('The exam deadline has passed.');
}
