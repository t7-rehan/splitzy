import jsQR from "jsqr";

/**
 * UPI parsing, validation, QR decoding, and deep-link launcher service.
 *
 * All operations run 100% locally on the device — no images or UPI IDs are
 * uploaded to the backend or Supabase.
 */

export const UPI_ERROR_CODES = {
  INVALID_IMAGE: "INVALID_IMAGE",
  QR_NOT_FOUND: "QR_NOT_FOUND",
  NON_UPI_QR: "NON_UPI_QR",
  MISSING_PA: "MISSING_PA",
  MALFORMED_URI: "MALFORMED_URI",
};

export class UpiError extends Error {
  constructor(message, code, details = null) {
    super(message);
    this.name = "UpiError";
    this.code = code;
    this.details = details;
  }
}

/**
 * Validates whether a given string is conceptually a UPI URI.
 */
export function isValidUpiUri(raw) {
  if (typeof raw !== "string" || !raw.trim()) return false;
  try {
    const parsed = parseUpiUri(raw);
    return Boolean(parsed && parsed.pa);
  } catch {
    return false;
  }
}

/**
 * Parses a UPI payment URI (e.g. upi://pay?pa=name@bank&pn=Name&am=100&cu=INR&tn=Note).
 * Case-insensitive scheme and host; extracts standard UPI query parameters.
 */
export function parseUpiUri(raw) {
  if (typeof raw !== "string" || !raw.trim()) {
    throw new UpiError("Empty or invalid URI string", UPI_ERROR_CODES.MALFORMED_URI);
  }

  const trimmed = raw.trim();

  // Standard UPI URI format: upi://pay?...
  // Scheme is case-insensitive (UPI://PAY?...)
  const match = trimmed.match(/^upi:\/\/pay(\?(.*))?$/i);
  if (!match) {
    throw new UpiError(
      "This QR code does not contain a UPI payment link (expected upi://pay?...)",
      UPI_ERROR_CODES.NON_UPI_QR,
      { raw: trimmed }
    );
  }

  const queryString = match[2] || "";
  const params = new URLSearchParams(queryString);

  const pa = params.get("pa") ? params.get("pa").trim() : null;
  if (!pa) {
    throw new UpiError(
      "The UPI QR code is missing a payee address (pa parameter)",
      UPI_ERROR_CODES.MISSING_PA
    );
  }

  // Basic sanity check on payment address: must have @
  if (!pa.includes("@")) {
    throw new UpiError(
      `Invalid UPI ID format: "${pa}" (missing '@')`,
      UPI_ERROR_CODES.MALFORMED_URI,
      { pa }
    );
  }

  const pn = params.get("pn") ? params.get("pn").trim() : null;
  const rawAm = params.get("am");
  let am = null;
  if (rawAm !== null && rawAm !== undefined && rawAm.trim() !== "") {
    const parsedAm = parseFloat(rawAm);
    if (!Number.isNaN(parsedAm) && parsedAm > 0) {
      am = parsedAm;
    }
  }

  const cu = (params.get("cu") || "INR").trim().toUpperCase();
  const tn = params.get("tn") ? params.get("tn").trim() : null;
  const tr = params.get("tr") ? params.get("tr").trim() : null;
  const mc = params.get("mc") ? params.get("mc").trim() : null;
  const mode = params.get("mode") ? params.get("mode").trim() : null;

  return {
    pa,
    pn,
    am,
    cu,
    tn,
    tr,
    mc,
    mode,
    rawUri: trimmed,
  };
}

/**
 * Builds a canonical upi://pay deep link from structured parameters.
 */
export function buildUpiUri({ pa, pn, am, cu = "INR", tn = "Splitzy expense settlement" }) {
  if (!pa || typeof pa !== "string" || !pa.trim()) {
    throw new UpiError("Payee UPI address (pa) is required to build a payment link", UPI_ERROR_CODES.MISSING_PA);
  }

  const params = new URLSearchParams();
  params.set("pa", pa.trim());
  if (pn && pn.trim()) params.set("pn", pn.trim());
  if (am !== undefined && am !== null && am !== "") {
    const num = Number(am);
    if (!Number.isNaN(num) && num > 0) {
      params.set("am", String(num));
    }
  }
  params.set("cu", cu || "INR");
  if (tn && tn.trim()) params.set("tn", tn.trim());

  return `upi://pay?${params.toString()}`;
}

/**
 * Decodes a QR code from raw pixel ImageData using jsQR.
 * Works in both browser and Node (if synthetic/mocked).
 */
export function decodeQrFromImageData(data, width, height) {
  if (!data || !width || !height) return null;
  try {
    const code = jsQR(data, width, height);
    return code?.data ? code.data : null;
  } catch (err) {
    console.error("jsQR decoding failed:", err);
    return null;
  }
}

/**
 * Browser-only helper: loads an image File into a Canvas and decodes any QR code.
 */
export async function decodeQrFromImageFile(file) {
  if (!file) {
    throw new UpiError("No file selected", UPI_ERROR_CODES.INVALID_IMAGE);
  }

  if (typeof window === "undefined" || typeof document === "undefined") {
    throw new UpiError("decodeQrFromImageFile is only available in browser environments", UPI_ERROR_CODES.INVALID_IMAGE);
  }

  if (file.type && !file.type.startsWith("image/")) {
    throw new UpiError("The selected file is not an image", UPI_ERROR_CODES.INVALID_IMAGE);
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        try {
          const canvas = document.createElement("canvas");
          canvas.width = img.naturalWidth || img.width;
          canvas.height = img.naturalHeight || img.height;

          if (canvas.width === 0 || canvas.height === 0) {
            return reject(new UpiError("Image has zero dimensions", UPI_ERROR_CODES.INVALID_IMAGE));
          }

          const ctx = canvas.getContext("2d", { willReadFrequently: true });
          if (!ctx) {
            return reject(new UpiError("Could not initialize canvas context", UPI_ERROR_CODES.INVALID_IMAGE));
          }

          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const rawText = decodeQrFromImageData(imageData.data, imageData.width, imageData.height);

          if (!rawText) {
            return reject(
              new UpiError(
                "No QR code found in this image. Please select a clear QR code screenshot or photo.",
                UPI_ERROR_CODES.QR_NOT_FOUND
              )
            );
          }

          resolve(rawText);
        } catch (err) {
          reject(new UpiError(`Failed to process image: ${err.message}`, UPI_ERROR_CODES.INVALID_IMAGE));
        }
      };

      img.onerror = () => {
        reject(new UpiError("Failed to load image file. It may be corrupted.", UPI_ERROR_CODES.INVALID_IMAGE));
      };

      img.src = e.target.result;
    };

    reader.onerror = () => {
      reject(new UpiError("Failed to read image file from disk.", UPI_ERROR_CODES.INVALID_IMAGE));
    };

    reader.readAsDataURL(file);
  });
}

/**
 * Reads an image file from the gallery, decodes the QR, verifies UPI compliance,
 * and returns the parsed UPI payment payload.
 */
export async function processUpiQrImage(file) {
  const rawDecoded = await decodeQrFromImageFile(file);
  return parseUpiUri(rawDecoded);
}

/**
 * Initiates the platform-supported UPI deep-link.
 * Uses window.location.href to let the OS handle the upi:// intent.
 * Does NOT verify bank transfer success (browser cannot know).
 */
export function launchUpiPayment(upiUri) {
  if (typeof window === "undefined") return false;
  try {
    window.location.href = upiUri;
    return true;
  } catch (err) {
    console.error("Failed to launch UPI deep link:", err);
    return false;
  }
}
