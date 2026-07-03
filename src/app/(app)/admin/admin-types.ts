import type {
  listBenefitCategories,
  listHolidays,
  listLeaveTypes,
} from "@/server/admin/data";

export type Category = Awaited<ReturnType<typeof listBenefitCategories>>[number];
export type LeaveType = Awaited<ReturnType<typeof listLeaveTypes>>[number];
export type Holiday = Awaited<ReturnType<typeof listHolidays>>[number];
