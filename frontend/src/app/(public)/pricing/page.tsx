"use client";

import AdLayout from "@/components/ads/AdLayout";
import { useMemo, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Check, Zap } from "lucide-react";
import { api } from "@/lib/api";

declare global {
  interface Window {
    Razorpay: any;
  }
}

export default function PricingPage() {
  const router = useRouter();
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedPlan, setSelectedPlan] = useState("STARTER");

  // ✅ Load Razorpay script safely
  useEffect(() => {
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;
    document.body.appendChild(script);
  }, []);

  const plans = useMemo(
    () => [
      {
        name: "FREE",
        priceInr: 0,
        credits: 3,
        features: ["3 video generations", "Basic styles", "Standard quality"],
      },
      {
        name: "STARTER",
        priceInr: 99,
        originalPriceInr: 299,
        credits: 20,
        popular: true,
        features: ["20 videos", "1080p", "Priority support"],
      },
      {
        name: "PRO",
        priceInr: 499,
        originalPriceInr: 999,
        credits: 100,
        features: ["100 videos", "4K", "API access"],
      },
    ],
    []
  );

  const handlePayment = async (planName: string, amount: number) => {
    if (planName === "FREE") return;

    console.log("Payment clicked:", planName);

    setLoading(planName);
    setError(null);

    try {
      if (!window.Razorpay) {
        throw new Error("Razorpay not loaded. Refresh page.");
      }

      const order = await api.createPaymentOrder(amount, planName);

      console.log("Order created:", order);

      const options = {
        key: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID,
        amount: order.amount,
        currency: "INR",
        name: "ScriptToVideo AI",
        description: `${planName} Plan`,
        order_id: order.id,

        handler: async function (response: any) {
          console.log("Payment success:", response);

          try {
            await api.verifyPayment({
              razorpay_order_id: response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature,
              plan: planName,
            });

            alert("Payment successful!");
            router.push("/dashboard");
          } catch (err: any) {
            console.error(err);
            setError("Payment verification failed.");
          }
        },

        modal: {
          ondismiss: () => {
            console.log("Payment popup closed");
          },
        },

        theme: {
          color: "#f59e0b",
        },
      };

      const rzp = new window.Razorpay(options);
      rzp.open();
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Payment failed");
    } finally {
      setLoading(null);
    }
  };

  return (
    <AdLayout>
      <div className="py-12 px-4 max-w-7xl mx-auto">

        {/* HEADER */}
        <div className="flex justify-between mb-10">
          <button
            onClick={() => router.push("/dashboard")}
            className="px-4 py-2 border rounded-lg bg-slate-900"
          >
            ← Back
          </button>
        </div>

        <h1 className="text-4xl font-bold text-center mb-10">
          Choose Your Plan
        </h1>

        {error && (
          <div className="bg-red-500/10 p-4 text-red-400 mb-6 text-center">
            {error}
          </div>
        )}

        <div className="grid md:grid-cols-3 gap-6">
          {plans.map((plan) => (
            <div
              key={plan.name}
              onClick={() => setSelectedPlan(plan.name)}
              className={`p-6 rounded-xl border ${
                selectedPlan === plan.name
                  ? "border-amber-400"
                  : "border-slate-700"
              }`}
            >
              <h2 className="text-xl font-bold text-center mb-4">
                {plan.name}
              </h2>

              <div className="text-center mb-4">
                {plan.priceInr === 0 ? (
                  "Free"
                ) : (
                  <>
                    <div className="line-through text-slate-500">
                      ₹{plan.originalPriceInr}
                    </div>
                    <div className="text-3xl text-amber-400">
                      ₹{plan.priceInr}
                    </div>
                  </>
                )}
              </div>

              <div className="text-center mb-4">
                {plan.credits} credits
              </div>

              <ul className="mb-4">
                {plan.features.map((f, i) => (
                  <li key={i} className="flex items-center gap-2">
                    <Check size={14} /> {f}
                  </li>
                ))}
              </ul>

              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handlePayment(plan.name, plan.priceInr);
                }}
                className="w-full py-3 bg-amber-500 text-black rounded-lg"
              >
                {loading === plan.name
                  ? "Processing..."
                  : plan.name === "FREE"
                  ? "Start"
                  : "Upgrade"}
              </button>
            </div>
          ))}
        </div>
      </div>
    </AdLayout>
  );
}