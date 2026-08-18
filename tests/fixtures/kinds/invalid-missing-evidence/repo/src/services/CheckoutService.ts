export class CheckoutService {
  submitOrder(): string {
    return "queued";
  }

  publishOrderCreated(): string {
    return "published";
  }
}
