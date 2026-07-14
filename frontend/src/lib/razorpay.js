import api from "./api";
import { toast } from "sonner";

/**
 * Launches Razorpay Checkout modal. Returns { paid: boolean, razorpay_payment_id, razorpay_order_id }
 * On success, backend has already verified the signature.
 */
export async function payWithRazorpay({ amountRupees, receipt, prefill = {}, notes = {} }) {
  if (!window.Razorpay) throw new Error("Razorpay Checkout not loaded");

  const orderRes = await api.post("/payments/razorpay/order", { amount: amountRupees, receipt, notes });
  const { order_id, amount, currency, key_id } = orderRes.data;

  return new Promise((resolve) => {
    const options = {
      key: key_id,
      amount, currency, order_id,
      name: "ATH ERP",
      description: receipt || "POS payment",
      prefill,
      notes,
      theme: { color: "#3B82F6" },
      handler: async (r) => {
        try {
          await api.post("/payments/razorpay/verify", {
            razorpay_order_id: r.razorpay_order_id,
            razorpay_payment_id: r.razorpay_payment_id,
            razorpay_signature: r.razorpay_signature,
          });
          toast.success("Payment successful");
          resolve({ paid: true, ...r });
        } catch (e) {
          toast.error("Payment verification failed");
          resolve({ paid: false, error: "verification_failed" });
        }
      },
      modal: {
        ondismiss: () => resolve({ paid: false, error: "dismissed" }),
      },
    };
    const rzp = new window.Razorpay(options);
    rzp.on("payment.failed", (resp) => {
      toast.error(`Payment failed: ${resp.error.description || resp.error.code}`);
      resolve({ paid: false, error: resp.error });
    });
    rzp.open();
  });
}
