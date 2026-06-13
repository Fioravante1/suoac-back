export interface DashboardEventDayInfo {
  id: string;
  date: Date;
  label: string;
  dayNumber: number;
  status: string;
}

export interface DashboardEventInfo {
  id: string;
  title: string;
  type: string;
  status: string;
  ticketPrice: string;
  registrationDeadline: Date;
  paymentDeadline: Date;
  venue: string;
  address: string;
  city: string;
  state: string;
  days: DashboardEventDayInfo[];
}

export interface DashboardCongregationInfo {
  id: string;
  name: string;
  listStatus: string;
}

export interface DashboardStats {
  totalPassengers: number;
  totalExpected: string;
  totalReceived: string;
  totalPending: string;
}

export interface DashboardPaymentBreakdown {
  paid: number;
  partial: number;
  pending: number;
  exempt: number;
}

export interface DashboardPendingPassenger {
  id: string;
  passengerName: string;
  totalAmount: string;
  paidAmount: string;
  pendingAmount: string;
  paymentStatus: string;
}

export interface DashboardResponse {
  event: DashboardEventInfo;
  congregation: DashboardCongregationInfo | null;
  stats: DashboardStats;
  paymentBreakdown: DashboardPaymentBreakdown;
  pendingPassengers: DashboardPendingPassenger[];
  totalPendingPassengers: number;
}
