/** Format a timed event in its calendar's named time zone. */
export function localDateTime(value: string, timeZone: string): { date: string; time: string } {
  const instant = new Date(value);
  if (!Number.isFinite(instant.getTime()))
    return { date: value.slice(0, 10), time: value.slice(11, 16) };
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(instant);
  const part = (name: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === name)?.value || "";
  return {
    date: `${part("year")}-${part("month")}-${part("day")}`,
    time: `${part("hour")}:${part("minute")}`,
  };
}
/** Resolve a local wall-clock time, rejecting gaps at daylight-saving transitions. */
export function zonedInstant(date: string, time: string, timeZone: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time))
    throw new Error("请输入完整的日期和时间。");
  const desired = Date.parse(`${date}T${time}:00Z`);
  if (
    !Number.isFinite(desired) ||
    new Date(desired).toISOString().slice(0, 16) !== `${date}T${time}`
  )
    throw new Error("请输入有效的日期和时间。");
  let candidate = desired;
  for (let pass = 0; pass < 4; pass++) {
    const local = localDateTime(new Date(candidate).toISOString(), timeZone);
    const actual = Date.parse(`${local.date}T${local.time}:00Z`);
    const delta = desired - actual;
    if (delta === 0) return new Date(candidate).toISOString();
    candidate += delta;
  }
  throw new Error("所选时区中不存在这个时间，请换一个时间。");
}

/** Only fully serialized instants may reset a date editor's local text. */
export function isCompleteInstant(value: string): boolean {
  return (
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})$/.test(value) &&
    Number.isFinite(Date.parse(value))
  );
}
