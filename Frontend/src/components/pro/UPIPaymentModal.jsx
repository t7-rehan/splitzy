import React, { useState, useRef, useEffect } from "react";
import {
  QrCode,
  ExternalLink,
  CheckCircle2,
  Copy,
  Check,
  Upload,
  AlertCircle,
  Loader2,
  RefreshCw,
  Info,
} from "lucide-react";
import { BottomSheet } from "../common/BottomSheet";
import { ClayButton } from "../common/ClayButton";
import { useTheme } from "../../theme/clayTheme";
import { fmtMoney } from "../../services/currency";
import {
  buildUpiUri,
  processUpiQrImage,
  launchUpiPayment,
} from "../../services/upiService";

export function UPIPaymentModal({
  isOpen,
  onClose,
  payeeDetails,
  onConfirmPayment,
}) {
  const C = useTheme();
  const fileInputRef = useRef(null);

  // Active payment state (seeded by payeeDetails, updated if QR is decoded)
  const [payeeName, setPayeeName] = useState("");
  const [payeeUpi, setPayeeUpi] = useState("");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("Splitzy expense settlement");
  const [isFromQr, setIsFromQr] = useState(false);

  // Flow states
  const [decoding, setDecoding] = useState(false);
  const [qrError, setQrError] = useState(null);
  const [copiedUpi, setCopiedUpi] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [deepLinkAttempted, setDeepLinkAttempted] = useState(false);

  // Sync state whenever payeeDetails or modal open status changes
  useEffect(() => {
    if (isOpen && payeeDetails) {
      setPayeeName(payeeDetails.payeeName || "");
      setPayeeUpi(payeeDetails.payeeUpi || "");
      setAmount(
        payeeDetails.amount !== undefined && payeeDetails.amount !== null
          ? String(payeeDetails.amount)
          : ""
      );
      setNote(payeeDetails.note || "Splitzy expense settlement");
      setIsFromQr(Boolean(payeeDetails.isFromQr));
      setQrError(null);
      setDeepLinkAttempted(false);
    }
  }, [isOpen, payeeDetails]);

  if (!isOpen) return null;

  const numericAmount = parseFloat(amount);
  const hasValidAmount = !Number.isNaN(numericAmount) && numericAmount > 0;
  const hasPayee = Boolean(payeeUpi && payeeUpi.includes("@"));
  const noUpiAvailable = isOpen && payeeDetails && !payeeUpi && payeeDetails.missingUpi;

  // Build standard canonical UPI deep link
  let upiDeepLink = "";
  if (hasPayee) {
    try {
      upiDeepLink = buildUpiUri({
        pa: payeeUpi,
        pn: payeeName || "UPI Payee",
        am: hasValidAmount ? numericAmount : undefined,
        cu: "INR",
        tn: note || "Splitzy expense settlement",
      });
    } catch {
      upiDeepLink = "";
    }
  }

  const handleCopyUpi = async () => {
    if (!payeeUpi) return;
    try {
      await navigator.clipboard.writeText(payeeUpi);
      setCopiedUpi(true);
      setTimeout(() => setCopiedUpi(false), 2000);
    } catch {
      // fallback
    }
  };

  const handleCopyLink = async () => {
    if (!upiDeepLink) return;
    try {
      await navigator.clipboard.writeText(upiDeepLink);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    } catch {
      // fallback
    }
  };

  // Gallery image selection handler
  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    // Reset file input value so user can re-pick the same file if needed
    e.target.value = "";
    if (!file) return;

    setDecoding(true);
    setQrError(null);
    try {
      const parsed = await processUpiQrImage(file);
      setPayeeUpi(parsed.pa);
      if (parsed.pn) setPayeeName(parsed.pn);
      else if (!payeeName) setPayeeName(parsed.pa);

      if (parsed.am !== null && parsed.am > 0) {
        setAmount(String(parsed.am));
      }
      if (parsed.tn) {
        setNote(parsed.tn);
      }
      setIsFromQr(true);
      setDeepLinkAttempted(false);
    } catch (err) {
      setQrError(err.message || "Failed to decode UPI QR from image.");
    } finally {
      setDecoding(false);
    }
  };

  const handleLaunchPayment = () => {
    if (!upiDeepLink) return;
    setDeepLinkAttempted(true);
    launchUpiPayment(upiDeepLink);
  };

  const handleConfirmSettled = () => {
    if (onConfirmPayment) {
      onConfirmPayment({
        payeeName: payeeName || payeeUpi || "Payee",
        payeeUpi,
        amount: hasValidAmount ? numericAmount : 0,
        note,
      });
    }
    onClose();
  };

  return (
    <BottomSheet
      isOpen={isOpen}
      onClose={onClose}
      title="UPI Payment"
      subtitle={isFromQr ? "Verified from QR Code" : "Direct settlement via UPI"}
    >
      <div style={{ padding: "8px 4px 12px" }} className="animate-fade-in">
        {/* Gallery QR File Input (hidden) */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          style={{ display: "none" }}
          onChange={handleFileChange}
        />

        {/* QR Upload Button Bar */}
        <div style={{ marginBottom: "16px" }}>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={decoding}
            style={{
              width: "100%",
              padding: "10px 14px",
              borderRadius: "14px",
              backgroundColor: isFromQr ? C.emeraldTint : C.card,
              border: `1.5px dashed ${isFromQr ? C.emerald : C.primary}`,
              color: isFromQr ? C.emeraldDark : C.primary,
              fontSize: "12.5px",
              fontWeight: "700",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "8px",
              cursor: decoding ? "not-allowed" : "pointer",
              boxShadow: C.clayRaisedSm,
              transition: "all 0.15s ease",
            }}
          >
            {decoding ? (
              <>
                <Loader2 size={16} className="animate-spin" /> Decoding QR Code from Gallery...
              </>
            ) : isFromQr ? (
              <>
                <CheckCircle2 size={16} color={C.emerald} /> QR Code Loaded • Choose Another
              </>
            ) : (
              <>
                <Upload size={16} /> Choose UPI QR Image from Gallery
              </>
            )}
          </button>
        </div>

        {/* QR Error Notification Banner */}
        {qrError && (
          <div
            style={{
              backgroundColor: C.mode === "dark" ? "#450A0A" : "#FEF2F2",
              border: `1px solid ${C.coral}`,
              borderRadius: "14px",
              padding: "10px 12px",
              marginBottom: "16px",
              display: "flex",
              alignItems: "flex-start",
              gap: "10px",
            }}
          >
            <AlertCircle size={18} color={C.coral} style={{ flexShrink: 0, marginTop: "1px" }} />
            <div style={{ flex: 1, textAlign: "left" }}>
              <div style={{ fontSize: "12.5px", fontWeight: "700", color: C.coralDark }}>
                Unable to use QR code
              </div>
              <div style={{ fontSize: "11.5px", color: C.text, marginTop: "2px", lineHeight: "1.4" }}>
                {qrError}
              </div>
            </div>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              style={{
                background: "none",
                border: "none",
                color: C.coral,
                cursor: "pointer",
                padding: "2px",
              }}
              title="Try another image"
            >
              <RefreshCw size={14} />
            </button>
          </div>
        )}

        {/* Amount Section */}
        <div style={{ textAlign: "center", marginBottom: "16px" }}>
          <div style={{ fontSize: "12.5px", color: C.muted, marginBottom: "4px" }}>
            {payeeName ? `Paying ${payeeName}` : "Payment Amount"}
          </div>

          {hasValidAmount ? (
            <div
              className="font-num"
              style={{
                fontSize: "34px",
                fontWeight: "800",
                color: C.text,
                letterSpacing: "-0.5px",
              }}
            >
              {fmtMoney(numericAmount, "INR")}
            </div>
          ) : (
            <div style={{ margin: "10px auto 4px", maxWidth: "200px" }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: C.inputBg,
                  borderRadius: "14px",
                  padding: "8px 12px",
                  boxShadow: C.clayPressed,
                  border: `1px solid ${C.border}`,
                }}
              >
                <span style={{ fontSize: "20px", fontWeight: "800", color: C.primary, marginRight: "6px" }}>
                  ₹
                </span>
                <input
                  type="number"
                  placeholder="Enter amount"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  style={{
                    width: "100%",
                    background: "none",
                    border: "none",
                    outline: "none",
                    fontSize: "22px",
                    fontWeight: "800",
                    color: C.text,
                    textAlign: "center",
                  }}
                />
              </div>
              <div style={{ fontSize: "11px", color: C.muted, marginTop: "4px" }}>
                QR did not specify an amount. Please enter it.
              </div>
            </div>
          )}
        </div>

        {/* UPI Details Box */}
        {noUpiAvailable ? (
          <div
            style={{
              padding: "18px 14px",
              textAlign: "center",
              borderRadius: "16px",
              backgroundColor: C.bg,
              boxShadow: C.clayPressed,
              marginBottom: "16px",
            }}
          >
            <QrCode size={36} color={C.muted} style={{ margin: "0 auto 8px" }} />
            <div style={{ fontSize: "13px", fontWeight: "700", color: C.text }}>
              Payment details not available
            </div>
            <div style={{ fontSize: "11.5px", color: C.muted, marginTop: "4px" }}>
              {payeeName || "This user"} has not saved a UPI ID or QR yet.
            </div>
          </div>
        ) : hasPayee ? (
          <div
            style={{
              backgroundColor: C.bg,
              borderRadius: "16px",
              padding: "12px 14px",
              boxShadow: C.clayPressed,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: "16px",
            }}
          >
            <div style={{ textAlign: "left", flex: 1, minWidth: 0, paddingRight: "8px" }}>
              <div style={{ fontSize: "11px", color: C.muted, fontWeight: "600" }}>
                Payee UPI ID {isFromQr && <span style={{ color: C.emerald }}>✓ Verified</span>}
              </div>
              <div
                style={{
                  fontSize: "13.5px",
                  fontWeight: "700",
                  color: C.text,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {payeeUpi}
              </div>
            </div>
            <button
              type="button"
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
                flexShrink: 0,
              }}
            >
              {copiedUpi ? <Check size={14} color={C.emerald} /> : <Copy size={14} />}
              {copiedUpi ? "Copied" : "Copy"}
            </button>
          </div>
        ) : (
          <div
            style={{
              padding: "20px",
              textAlign: "center",
              borderRadius: "16px",
              backgroundColor: C.bg,
              boxShadow: C.clayPressed,
              marginBottom: "16px",
            }}
          >
            <QrCode size={36} color={C.muted} style={{ margin: "0 auto 8px" }} />
            <div style={{ fontSize: "13px", fontWeight: "700", color: C.text }}>
              No UPI ID provided yet
            </div>
            <div style={{ fontSize: "11.5px", color: C.muted, marginTop: "4px" }}>
              Upload a UPI QR screenshot from your gallery to auto-fill payee details.
            </div>
          </div>
        )}

        {/* Note Box if present */}
        {note && (
          <div
            style={{
              fontSize: "12px",
              color: C.muted,
              textAlign: "left",
              backgroundColor: C.card,
              borderRadius: "10px",
              padding: "8px 12px",
              border: `1px solid ${C.borderLight}`,
              marginBottom: "16px",
            }}
          >
            <span style={{ fontWeight: "700" }}>Note: </span>
            {note}
          </div>
        )}

        {/* Deep Link Action Button */}
        <div style={{ marginBottom: "12px" }}>
          <ClayButton
            fullWidth
            size="lg"
            disabled={!hasPayee || !hasValidAmount}
            onClick={handleLaunchPayment}
            icon={<ExternalLink size={18} />}
          >
            Pay {hasValidAmount ? fmtMoney(numericAmount, "INR") : ""} via UPI App
          </ClayButton>
        </div>

        {/* Deep Link Fallback & Guidance (shown after opening or if user returns) */}
        {deepLinkAttempted && (
          <div
            style={{
              backgroundColor: C.mode === "dark" ? "#1E293B" : "#F8FAFC",
              border: `1px solid ${C.border}`,
              borderRadius: "14px",
              padding: "12px",
              marginBottom: "16px",
              textAlign: "left",
              fontSize: "11.5px",
              color: C.muted,
            }}
            className="animate-fade-in"
          >
            <div style={{ display: "flex", alignItems: "center", gap: "6px", fontWeight: "700", color: C.text, marginBottom: "4px" }}>
              <Info size={14} color={C.primary} /> UPI App not opening?
            </div>
            <div>
              If your installed UPI app (GPay, PhonePe, Paytm) did not open automatically, copy the UPI ID above to complete payment manually.
            </div>
            <div style={{ display: "flex", gap: "8px", marginTop: "8px" }}>
              <button
                type="button"
                onClick={handleCopyUpi}
                style={{
                  background: "none",
                  border: `1px solid ${C.border}`,
                  backgroundColor: C.card,
                  borderRadius: "8px",
                  padding: "5px 8px",
                  fontSize: "11px",
                  fontWeight: "700",
                  color: C.primary,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: "4px",
                }}
              >
                {copiedUpi ? <Check size={12} color={C.emerald} /> : <Copy size={12} />} Copy UPI ID
              </button>
              <button
                type="button"
                onClick={handleCopyLink}
                style={{
                  background: "none",
                  border: `1px solid ${C.border}`,
                  backgroundColor: C.card,
                  borderRadius: "8px",
                  padding: "5px 8px",
                  fontSize: "11px",
                  fontWeight: "700",
                  color: C.primary,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: "4px",
                }}
              >
                {copiedLink ? <Check size={12} color={C.emerald} /> : <Copy size={12} />} Copy Link
              </button>
            </div>
          </div>
        )}

        {/* Manual Settle Confirmation Action */}
        <ClayButton
          variant="secondary"
          fullWidth
          disabled={!hasValidAmount}
          onClick={handleConfirmSettled}
        >
          <CheckCircle2 size={16} color={C.emerald} /> Mark as Settled in Splitzy
        </ClayButton>
        <div style={{ fontSize: "10.5px", color: C.muted, marginTop: "6px", textAlign: "center" }}>
          Splitzy does not verify external bank balances. Tap above once you have finished payment.
        </div>
      </div>
    </BottomSheet>
  );
}
