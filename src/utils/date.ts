const shanghaiDateFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Shanghai',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

export function shanghaiDateString(date = new Date()) {
  return shanghaiDateFormatter.format(date);
}

export function dateOnly(value: string) {
  return new Date(`${value}T00:00:00.000Z`);
}
