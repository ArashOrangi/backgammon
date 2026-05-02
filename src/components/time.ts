export function timeOfHoursAgo(hour: number): Date {
  const now = new Date();
  return new Date(now.getTime() - 3600000 * hour); //  60 * 60 * 1000
}
