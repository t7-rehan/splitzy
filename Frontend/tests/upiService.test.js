import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  parseUpiUri,
  buildUpiUri,
  isValidUpiUri,
  decodeQrFromImageData,
  UPI_ERROR_CODES,
  UpiError,
} from "../src/services/upiService.js";

describe("UPI Service — Parsing and Validation", () => {
  it("parses a fully specified UPI payment URI", () => {
    const raw = "upi://pay?pa=alice@okhdfcbank&pn=Alice%20Smith&am=1450.00&cu=INR&tn=Weekend%20Dinner&tr=TXN123456";
    const result = parseUpiUri(raw);

    assert.equal(result.pa, "alice@okhdfcbank");
    assert.equal(result.pn, "Alice Smith");
    assert.equal(result.am, 1450.0);
    assert.equal(result.cu, "INR");
    assert.equal(result.tn, "Weekend Dinner");
    assert.equal(result.tr, "TXN123456");
    assert.equal(result.rawUri, raw);
  });

  it("handles case-insensitive scheme and uppercase parameters", () => {
    const raw = "UPI://PAY?pa=bob@paytm&am=500";
    const result = parseUpiUri(raw);

    assert.equal(result.pa, "bob@paytm");
    assert.equal(result.am, 500);
    assert.equal(result.cu, "INR"); // default
  });

  it("parses a UPI QR without an embedded amount (am missing)", () => {
    const raw = "upi://pay?pa=merchant@upi&pn=Grocery%20Store";
    const result = parseUpiUri(raw);

    assert.equal(result.pa, "merchant@upi");
    assert.equal(result.pn, "Grocery Store");
    assert.equal(result.am, null, "amount should be null when missing in QR");
  });

  it("rejects non-UPI URIs (e.g. web URLs or plain text)", () => {
    assert.throws(
      () => parseUpiUri("https://splitzy.app/pay"),
      (err) => {
        assert.ok(err instanceof UpiError);
        assert.equal(err.code, UPI_ERROR_CODES.NON_UPI_QR);
        return true;
      }
    );

    assert.throws(
      () => parseUpiUri("WIFI:S:MyNetwork;T:WPA;P:password;;"),
      (err) => {
        assert.ok(err instanceof UpiError);
        assert.equal(err.code, UPI_ERROR_CODES.NON_UPI_QR);
        return true;
      }
    );
  });

  it("rejects UPI URIs missing the payee address (pa parameter)", () => {
    assert.throws(
      () => parseUpiUri("upi://pay?pn=Alice&am=100"),
      (err) => {
        assert.ok(err instanceof UpiError);
        assert.equal(err.code, UPI_ERROR_CODES.MISSING_PA);
        return true;
      }
    );

    assert.throws(
      () => parseUpiUri("upi://pay?pa="),
      (err) => {
        assert.ok(err instanceof UpiError);
        assert.equal(err.code, UPI_ERROR_CODES.MISSING_PA);
        return true;
      }
    );
  });

  it("rejects malformed UPI addresses (missing @)", () => {
    assert.throws(
      () => parseUpiUri("upi://pay?pa=notAnEmailOrVpa&am=100"),
      (err) => {
        assert.ok(err instanceof UpiError);
        assert.equal(err.code, UPI_ERROR_CODES.MALFORMED_URI);
        return true;
      }
    );
  });

  it("isValidUpiUri returns true for valid URIs and false for invalid", () => {
    assert.equal(isValidUpiUri("upi://pay?pa=user@upi"), true);
    assert.equal(isValidUpiUri("upi://pay?pa=user@bank&am=200"), true);
    assert.equal(isValidUpiUri("https://example.com"), false);
    assert.equal(isValidUpiUri("upi://pay?pn=NoPa"), false);
    assert.equal(isValidUpiUri(""), false);
    assert.equal(isValidUpiUri(null), false);
  });

  it("builds a canonical upi://pay deep link", () => {
    const link = buildUpiUri({
      pa: "rehan@okaxis",
      pn: "Rehan",
      am: 850,
      cu: "INR",
      tn: "Dinner share",
    });

    assert.ok(link.startsWith("upi://pay?"));
    const parsed = parseUpiUri(link);
    assert.equal(parsed.pa, "rehan@okaxis");
    assert.equal(parsed.pn, "Rehan");
    assert.equal(parsed.am, 850);
    assert.equal(parsed.cu, "INR");
    assert.equal(parsed.tn, "Dinner share");
  });

  it("buildUpiUri rejects missing pa", () => {
    assert.throws(
      () => buildUpiUri({ am: 100 }),
      (err) => {
        assert.ok(err instanceof UpiError);
        assert.equal(err.code, UPI_ERROR_CODES.MISSING_PA);
        return true;
      }
    );
  });
});

describe("UPI Service — QR Decoding via jsQR", () => {
  it("decodeQrFromImageData returns null when input is invalid or has no QR", () => {
    assert.equal(decodeQrFromImageData(null, 100, 100), null);
    assert.equal(decodeQrFromImageData(new Uint8ClampedArray(400), 0, 0), null);

    // 10x10 blank pixel array contains no QR code
    const blankPixels = new Uint8ClampedArray(10 * 10 * 4);
    assert.equal(decodeQrFromImageData(blankPixels, 10, 10), null);
  });
});
