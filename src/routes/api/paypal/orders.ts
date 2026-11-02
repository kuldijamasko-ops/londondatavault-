// GET /api/paypal/orders
//   Returns the local order log (newest first) plus the PayPal mode in use.
//   This is the unlock/audit view — it is NOT the money view. Revenue is in
//   the owner's PayPal dashboard.
import { createFileRoute } from "@tanstack/react-router";
import { listOrders, paypalMode, paypalConfigured } from "~/services/paypal";

export const Route = createFileRoute("/api/paypal/orders")({
  server: {
    handlers: {
      GET: async () => {
        return Response.json({
          mode: paypalMode(),
          configured: paypalConfigured(),
          orders: listOrders(200),
        });
      },
    },
  },
});
