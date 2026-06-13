export interface PaymentResponse {
  id: string;
  amount: string;
  paidAt: Date;
  observations: string | null;
  eventPassengerId: string;
  registeredById: string;
  createdAt: Date;
}
