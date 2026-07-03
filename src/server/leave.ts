// Leave & WFH mock data: types, balances, dashboard cards, upcoming time off.

export type LeaveTypeKey = "CL" | "SL" | "EL" | "LOP" | "WFH";

export const LEAVE_TYPES: { key: LeaveTypeKey; label: string }[] = [
  { key: "CL", label: "Casual" },
  { key: "SL", label: "Sick" },
  { key: "EL", label: "Earned" },
  { key: "LOP", label: "Loss of Pay" },
  { key: "WFH", label: "WFH" },
];

export type LeaveCard = { label: string; value: string; unit: string; sub: string };

export type UpcomingItem = {
  title: string;
  dates: string;
  status: string;
  dot: "amber" | "emerald";
};
