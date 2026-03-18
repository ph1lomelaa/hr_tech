export type Quarter = "Q1" | "Q2" | "Q3" | "Q4";

export function getCurrentQuarter(date: Date = new Date()): Quarter {
  const month = date.getMonth(); // 0-11
  if (month < 3) return "Q1";
  if (month < 6) return "Q2";
  if (month < 9) return "Q3";
  return "Q4";
}

export function getCurrentQuarterYear(date: Date = new Date()): { quarter: Quarter; year: number } {
  return { quarter: getCurrentQuarter(date), year: date.getFullYear() };
}

export function getYearOptions(span: number = 2, centerYear: number = new Date().getFullYear()): number[] {
  const years: number[] = [];
  for (let y = centerYear - span; y <= centerYear + span; y += 1) {
    years.push(y);
  }
  return years;
}

export function formatQuarterYear(quarter: string, year: number): string {
  return `${quarter} ${year}`.trim();
}

export function quarterEndDate(quarter: Quarter, year: number): string {
  const endMonth = quarter === "Q1" ? 2 : quarter === "Q2" ? 5 : quarter === "Q3" ? 8 : 11;
  const endDate = new Date(year, endMonth + 1, 0);
  return endDate.toISOString().slice(0, 10);
}

export function yearMinDate(year: number): string {
  return new Date(year, 0, 1).toISOString().slice(0, 10);
}

export function yearMaxDate(year: number): string {
  return new Date(year, 11, 31).toISOString().slice(0, 10);
}
