import React, { useState } from "react";
import { QrCode, ArrowRight, ExternalLink, CheckCircle2, ShieldCheck, Copy, Check } from "lucide-react";
import { BottomSheet } from "../common/BottomSheet";
import { ClayButton } from "../common/ClayButton";
import { useTheme } from "../../theme/clayTheme";
import { fmtMoney } from "../../services/currency";

export function UPIPaymentModal({ isOpen, onClose, payeeDetails, onConfirmPayment }) {
  const C = useTheme();
  const [copied, setCopied] = useState(false);

  if (!payeeDetails) return null;

  const { payeeName, payeeUpi, amount } = payeeDetails;

  // Build standard UPI intent deep link
  const upiDeepLink = `upi://pay?pa=${encodeURIComponent(payeeUpi)}&pn=${encodeURIComponent(payeeName)}&am=${amount}&cu=INR&tn=${encodeURIComponent("Splitzy expense settlement")}`;

  const handleCopyUpi = async () => {
    try {
      await navigator.clipboard.writeText(payeeUpi);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  };

  return (
    <BottomSheet isOpen={isOpen} onClose={onClose} title="UPI Payment" subtitle="Direct settlement via UPI">
      <div style={{ textAlign: "center", padding: "10px 4px 10px" }} className="animate-fade-in">
        <div style={{ fontSize: "13px", color: C.muted, marginBottom: "4px" }}>
          You owe {payeeName}
        </div>
        <div className="font-num" style={{ fontSize: "32px", fontWeight: "800", color: C.text, marginBottom: "16px" }}>
          {fmtMoney(amount, "INR")}
        </div>

        {/* UPI VPA Box */}
        <div
          style={{
            backgroundColor: C.bg,
            borderRadius: "16px",
            padding: "14px 16px",
            boxShadow: C.clayPressed,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: "20px",
          }}
        >
          <div style={{ textAlign: "left" }}>
            <div style={{ fontSize: "11px", color: C.muted, fontWeight: "600" }}>VPA / UPI ID</div>
            <div style={{ fontSize: "14px", fontWeight: "700", color: C.text }}>{payeeUpi}</div>
          </div>
          <button
            onClick={handleCopyUpi}
            style={{
              background: "none",
              border: `1px solid ${C.border}`,
              backgroundColor: C.card,
              borderRadius: "10px",
              padding: "6px 10px",
              fontSize: "12px",
              fontWeight: "700",
              color: C.primary,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: "4px",
            }}
          >
            {copied ? <Check size={14} color={C.emerald} /> : <Copy size={14} />}
            {copied ? "Copied" : "Copy"}
          </button>
        </div>

        {/* QR Code Graphic Box */}
        <div
          style={{
            backgroundColor: "#FFF",
            border: `2px solid ${C.border}`,
            borderRadius: "20px",
            padding: "20px",
            width: "180px",
            height: "180px",
            margin: "0 auto 20px",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            boxShadow: "0 8px 20px rgba(0,0,0,0.06)",
          }}
        >
          <QrCode size={110} color={C.text} />
          <div style={{ fontSize: "10.5px", fontWeight: "700", color: C.muted, marginTop: "6px" }}>
            Scan with GPay / PhonePe / Paytm
          </div>
        </div>

        {/* Deep Link Button */}
        <a
          href={upiDeepLink}
          style={{ textDecoration: "none", display: "block", marginBottom: "12px" }}
        >
          <ClayButton fullWidth size="lg" icon={<ExternalLink size={18} />}>
            Pay {fmtMoney(amount, "INR")} via UPI App
          </ClayButton>
        </a>

        {/* Manual Settle Confirmation */}
        <ClayButton
          variant="secondary"
          fullWidth
          onClick={() => {
            onConfirmPayment(payeeDetails);
            onClose();
          }}
        >
          <CheckCircle2 size={16} color={C.emerald} /> Mark as Settled in Splitzy
        </ClayButton>
      </div>
    </BottomSheet>
  );
}
