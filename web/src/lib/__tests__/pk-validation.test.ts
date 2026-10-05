import { describe, expect, it } from "vitest";

import { cnicLast6, iban, localMobile, payoutAccountErrors } from "../pk-validation";

describe("Pakistani formats (mirror of the server rules)", () => {
  it("normalises mobile numbers", () => {
    expect(localMobile("0300 1234567")).toBe("03001234567");
    expect(localMobile("+92 300 1234567")).toBe("03001234567");
    expect(localMobile("12345")).toBeNull();
  });

  it("checks IBANs with mod 97", () => {
    expect(iban("PK36 SCBL 0000 0011 2345 6702")).toBe("PK36SCBL0000001123456702");
    expect(iban("PK37SCBL0000001123456702")).toBeNull();
  });

  it("validates payout accounts by field", () => {
    expect(cnicLast6("123456")).toBe(true);
    expect(payoutAccountErrors({ method: "jazzCash", account: "03001234567", holderName: "Sana" })).toEqual({});
    expect(Object.keys(payoutAccountErrors({ method: "bank", account: "x", holderName: "S" }))).toEqual(["account", "bankName", "holderName"]);
  });
});
