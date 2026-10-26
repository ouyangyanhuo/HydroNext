interface ContestDeadline {
  endAt?: Date | string;
  duration?: number;
  proctorEnabled?: boolean;
}

interface AttendeeDeadline {
  attend?: number;
  endAt?: Date | string;
  startAt?: Date | string;
  proctorEnded?: boolean;
  proctorMembers?: Record<string, { proctorEnded?: boolean }>;
}

/** 兼容时间权限已恢复、监考仍为终态的旧数据；实际恢复权限仍由服务端核验。 */
export function canResume(tdoc: ContestDeadline, tsdoc: AttendeeDeadline) {
  if (!tsdoc.attend || !tdoc.endAt) return false;
  const endAt = new Date(tdoc.endAt).getTime();
  const userEndAt = tsdoc.endAt ? new Date(tsdoc.endAt).getTime() : NaN;
  const endedEarly = userEndAt < endAt;
  const proctorEnded = tdoc.proctorEnabled && (tsdoc.proctorEnded
    || Object.values(tsdoc.proctorMembers || {}).some((member) => member.proctorEnded));
  if ((!endedEarly && !proctorEnded) || !Number.isFinite(endAt) || endAt <= Date.now()) return false;
  if (!tdoc.duration || !tsdoc.startAt) return true;
  return new Date(tsdoc.startAt).getTime() + Number(tdoc.duration) * 3600000 > Date.now();
}
