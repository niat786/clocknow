// Years that get one-page-per-month printables (the static site would otherwise grow by 1,200 pages).
export const monthPageYears = (thisYear: number): number[] => Array.from({ length: 6 }, (_, i) => thisYear - 1 + i);
