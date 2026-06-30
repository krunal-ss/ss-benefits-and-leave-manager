// Leave & WFH mock data: types, balances, dashboard cards, upcoming time off.

export type LeaveTypeKey = "CL" | "SL" | "EL" | "LOP" | "WFH";

export const LEAVE_TYPES: { key: LeaveTypeKey; label: string }[] = [
  { key: "CL", label: "Casual" },
  { key: "SL", label: "Sick" },
  { key: "EL", label: "Earned" },
  { key: "LOP", label: "Loss of Pay" },
  { key: "WFH", label: "WFH" },
];

// Available balance (in days) per type. WFH does not deduct a leave balance.
export const LEAVE_BALANCE: Record<LeaveTypeKey, number> = {
  CL: 8.5,
  SL: 6,
  EL: 12,
  LOP: 0,
  WFH: 5,
};

export type LeaveCard = { label: string; value: string; unit: string; sub: string };

export const LEAVE_CARDS: LeaveCard[] = [
  { label: "Casual Leave", value: "8.5", unit: "days", sub: "of 12 · accrues monthly" },
  { label: "Sick Leave", value: "6", unit: "days", sub: "of 8 remaining" },
  { label: "Earned Leave", value: "12", unit: "days", sub: "carries forward" },
  { label: "WFH this month", value: "5", unit: "left", sub: "3 of 8 used" },
];

export type UpcomingItem = {
  title: string;
  dates: string;
  status: string;
  dot: "amber" | "emerald";
};

export const UPCOMING: UpcomingItem[] = [
  { title: "Casual Leave", dates: "6 – 8 Jul 2026 · 3 days", status: "Pending L1", dot: "amber" },
  { title: "Work from home", dates: "2 – 3 Jul 2026", status: "Approved", dot: "emerald" },
  { title: "Earned Leave", dates: "22 Aug 2026 · 1 day", status: "Approved", dot: "emerald" },
];
